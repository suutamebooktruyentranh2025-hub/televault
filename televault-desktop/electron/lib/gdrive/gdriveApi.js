const https = require('https');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { URL } = require('url');

const BASE = 'https://www.googleapis.com/drive/v3';
const FIELDS_FILE = 'id,name,mimeType,size,modifiedTime,md5Checksum,parents,trashed';
const FIELDS_LIST = `files(${FIELDS_FILE}),nextPageToken`;

class GDriveApi {
  /**
   * @param {{ auth: import('./gdriveAuth').GDriveAuth }} opts
   */
  constructor({ auth, rateLimiter = null }) {
    this.auth = auth;
    this.rateLimiter = rateLimiter;
  }

  /**
   * List children of a folder.
   * @param {string} folderId - Drive folder ID ('root' for My Drive root)
   * @returns {Promise<Array<{ id: string, name: string, mimeType: string, size: number, modifiedTime: string, isFolder: boolean }>>}
   */
  async listFolder(folderId = 'root') {
    const files = [];
    let pageToken = null;
    do {
      const q = folderId === 'sharedWithMe'
        ? `sharedWithMe = true and trashed = false`
        : `'${folderId}' in parents and trashed = false`;
      let url = `${BASE}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(FIELDS_LIST)}&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

      const data = await this._get(url);
      for (const f of data.files || []) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: Number(f.size) || 0,
          modifiedTime: f.modifiedTime,
          md5Checksum: f.md5Checksum || null,
          isFolder: f.mimeType === 'application/vnd.google-apps.folder',
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  }

  /**
   * Recursively list all files in a folder (non-folder items only).
   * Skips Google Docs/Sheets/Slides (not downloadable as binary).
   * @param {string} folderId
   * @param {string} pathPrefix - e.g. "MyFolder/"
   * @param {Set} visited - cycle detection
   * @param {{ onProgress?: (info: { currentFolder: string, filesFound: number }) => void, onFile?: (file: object) => void, _counter?: { count: number } }} opts
   * @returns {Promise<Array<{ id: string, name: string, drivePath: string, size: number, modifiedTime: string, md5Checksum: string|null }>>}
   */
  async listFolderRecursive(folderId, pathPrefix = '', visited = new Set(), opts = {}) {
    if (visited.has(folderId)) return [];
    visited.add(folderId);

    // Initialize shared counter on first call
    if (!opts._counter) opts._counter = { count: 0 };

    if (opts.onProgress) {
      opts.onProgress({ currentFolder: pathPrefix || '/', filesFound: opts._counter.count });
    }

    const items = await this.listFolder(folderId);
    /** @type {Array<{ id: string, name: string, drivePath: string, size: number, modifiedTime: string, md5Checksum: string|null }>} */
    const result = [];
    for (const item of items) {
      if (item.isFolder) {
        const sub = await this.listFolderRecursive(item.id, `${pathPrefix}${item.name}/`, visited, opts);
        result.push(...sub);
      } else if (!item.mimeType.startsWith('application/vnd.google-apps.')) {
        opts._counter.count += 1;
        const fileInfo = {
          id: item.id,
          name: item.name,
          drivePath: `${pathPrefix}${item.name}`,
          size: item.size,
          modifiedTime: item.modifiedTime,
          md5Checksum: item.md5Checksum,
        };
        result.push(fileInfo);
        if (opts.onFile) opts.onFile(fileInfo);
      }
    }
    return result;
  }

  /**
   * Get changes since last page token.
   * @param {string|null} pageToken
   * @returns {Promise<{ changes: Array<{ fileId: string, removed: boolean, file: any }>, newStartPageToken: string }>}
   */
  async getChanges(pageToken) {
    if (!pageToken) {
      // Get initial page token
      const data = await this._get(`${BASE}/changes/startPageToken?supportsAllDrives=true&includeItemsFromAllDrives=true`);
      return { changes: [], newStartPageToken: data.startPageToken };
    }

    const allChanges = [];
    let nextPageToken = pageToken;
    let newStartPageToken = null;
    do {
      const changesFields = `changes(fileId,removed,file(${FIELDS_FILE})),nextPageToken,newStartPageToken`;
      let url = `${BASE}/changes?pageToken=${encodeURIComponent(nextPageToken)}`
        + `&fields=${encodeURIComponent(changesFields)}`
        + `&pageSize=1000&includeRemoved=true&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const data = await this._get(url);
      for (const c of data.changes || []) {
        allChanges.push({
          fileId: c.fileId,
          removed: c.removed || false,
          file: c.file || null,
        });
      }
      nextPageToken = data.nextPageToken;
      if (data.newStartPageToken) newStartPageToken = data.newStartPageToken;
    } while (nextPageToken);

    return { changes: allChanges, newStartPageToken: newStartPageToken || pageToken };
  }

  /**
   * Download a file to a local temp path. Streams to disk to handle large files.
   * @param {string} fileId
   * @param {string} fileName
   * @param {string} [customTempDir] optional custom temp directory
   * @param {function(number): void} [onProgress] callback with progress fraction
   * @returns {Promise<string>} path to downloaded temp file
   */
  async downloadFile(fileId, fileName, customTempDir, onProgress) {
    const tempDir = customTempDir || path.join(app.getPath('temp'), 'gdrive-sync');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    // Sanitize filename for filesystem
    const safeName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const tempPath = path.join(tempDir, `${fileId}_${safeName}`);

    const token = await this.auth.getValidToken();
    const url = `${BASE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

    await this._downloadStream(url, token, tempPath, 0, onProgress);
    return tempPath;
  }

  /**
   * Get file metadata by ID.
   * @param {string} fileId
   */
  async getFile(fileId) {
    return this._get(`${BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FIELDS_FILE)}&supportsAllDrives=true`);
  }

  /**
   * Stream download a file, following redirects.
   */
  _downloadStream(url, token, destPath, redirectCount = 0, onProgress = null) {
    if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const headers = { Authorization: `Bearer ${token}` };
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
        timeout: 60000,
      }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // drain response
          this._downloadStream(res.headers.location, token, destPath, redirectCount + 1, onProgress)
            .then(resolve, reject);
          return;
        }

        // Handle 429 for downloads
        if (res.statusCode === 429) {
          res.resume();
          const retryAfterSec = parseInt(res.headers['retry-after'] || '0', 10);
          const retryAfterMs = retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;
          if (this.rateLimiter) this.rateLimiter.reportThrottle(retryAfterMs);
          if (redirectCount < 5) {
            const delay = retryAfterMs || 2000 * Math.pow(2, redirectCount);
            setTimeout(() => {
              this._downloadStream(url, token, destPath, redirectCount + 1, onProgress)
                .then(resolve, reject);
            }, delay);
            return;
          }
          reject(new Error(`Download rate limited after ${redirectCount} retries`));
          return;
        }

        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', c => { body += c; });
          res.on('end', () => reject(new Error(`Download failed: ${res.statusCode} ${body.slice(0, 200)}`)));
          return;
        }

        const writer = fs.createWriteStream(destPath);
        
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        
        if (onProgress && total > 0) {
          res.on('data', (chunk) => {
            downloaded += chunk.length;
            onProgress(downloaded / total);
          });
        }

        res.pipe(writer);
        writer.on('finish', () => resolve(destPath));
        writer.on('error', reject);
        res.on('error', reject);
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google Drive Download Timeout'));
      });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Authenticated GET request, returns parsed JSON.
   */
  async _get(url, _retryCount = 0) {
    if (this.rateLimiter) await this.rateLimiter.acquire();

    const token = await this.auth.getValidToken();
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          // Handle 429 Too Many Requests
          if (res.statusCode === 429) {
            const retryAfterSec = parseInt(res.headers['retry-after'] || '0', 10);
            const retryAfterMs = retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;
            if (this.rateLimiter) this.rateLimiter.reportThrottle(retryAfterMs);
            if (_retryCount < 5) {
              const delay = retryAfterMs || 2000 * Math.pow(2, _retryCount);
              setTimeout(() => {
                this._get(url, _retryCount + 1).then(resolve, reject);
              }, delay);
              return;
            }
            reject(new Error(`Rate limited after ${_retryCount} retries`));
            return;
          }

          if (this.rateLimiter) this.rateLimiter.reportSuccess();

          try {
            const json = JSON.parse(data);
            if (json.error) {
              // Check for rate limit errors in response body
              const code = json.error.code || res.statusCode;
              const reason = json.error.errors?.[0]?.reason || '';
              if (code === 403 && (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded')) {
                if (this.rateLimiter) this.rateLimiter.reportThrottle();
                if (_retryCount < 5) {
                  setTimeout(() => {
                    this._get(url, _retryCount + 1).then(resolve, reject);
                  }, 2000 * Math.pow(2, _retryCount));
                  return;
                }
              }
              reject(new Error(json.error.message || JSON.stringify(json.error)));
            } else {
              resolve(json);
            }
          } catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)); }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google Drive API Request Timeout'));
      });
      req.on('error', reject);
      req.end();
    });
  }
}

module.exports = { GDriveApi };
