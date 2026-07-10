const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { GDriveAuth } = require('./gdriveAuth');
const { GDriveApi } = require('./gdriveApi');
const { ApiRateLimiter } = require('./apiRateLimiter');
const { SyncThrottleController } = require('./syncThrottleController');

/**
 * @typedef {'idle'|'syncing'|'error'|'disconnected'} GDriveSyncStatus
 */

class GDriveSyncService {
  /**
   * @param {{
   *   db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb>,
   *   vault: import('../vault/vaultService').VaultService,
   *   onChange?: () => void,
   * }} opts
   */
  constructor({ db, vault, onChange }) {
    this.db = db;
    this.vault = vault;
    this.onChange = onChange || (() => {});
    this.rateLimiter = new ApiRateLimiter();
    this.throttleController = new SyncThrottleController();
    this.auth = new GDriveAuth({ db });
    this.api = new GDriveApi({ auth: this.auth, rateLimiter: this.rateLimiter });
    /** @type {GDriveSyncStatus} */
    this.isPaused = this.db.gdriveStateGet('is_paused') === '1';
    /** @type {GDriveSyncStatus | 'paused'} */
    this.status = this.isPaused ? 'paused' : (this.auth.isConnected() ? 'idle' : 'disconnected');
    this.lastSyncAt = null;
    this.pendingCount = 0;
    this.lastError = null;
    this.totalCount = 0;
    this.syncedCount = 0;
    this.currentSyncFile = null;
    this.currentSyncProgress = 0;
    this._lastProgressNotifyAt = 0;
    this.scanPhase = null; // 'scanning' | 'syncing' | null
    this.scanInfo = null;  // { currentFolder, filesFound }
    /** @type {NodeJS.Timeout | null} */
    this._pollTimer = null;
    this._syncInProgress = false;
    this._queueWorkerRunning = false;
    this._activeWorkers = 0;
    
    const savedPoll = this.db.gdriveStateGet('poll_interval_ms');
    this._pollIntervalMs = savedPoll !== undefined && savedPoll !== null && savedPoll !== '' 
      ? parseInt(savedPoll, 10) 
      : 5 * 60 * 1000; // default 5 min

    if (this.auth.isConnected()) {
      this.pendingCount = this.db.gdriveSyncQueueCount();
      if (!this.isPaused) {
        this._startQueueWorker();
      }
    }
  }

  setPaused(paused) {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.db.gdriveStateSet('is_paused', paused ? '1' : '0');
    
    if (paused) {
      this.status = 'paused';
      this._queueWorkerRunning = false;
      this._activeWorkers = 0;
      this.stopPolling();
    } else {
      this.status = this.auth.isConnected() ? 'idle' : 'disconnected';
      if (this.auth.isConnected()) {
        this._startQueueWorker();
        this.startPolling();
      }
    }
    this.onChange();
  }

  getSnapshot() {
    return {
      isPaused: this.isPaused,
      status: this.status,
      connected: this.auth.isConnected(),
      email: this.auth.email,
      lastSyncAt: this.lastSyncAt,
      pendingCount: this.pendingCount,
      totalCount: Math.max(this.totalCount || 0, this.pendingCount + (this.syncedCount || 0)),
      syncedCount: this.syncedCount || 0,
      currentSyncFile: this.currentSyncFile || null,
      currentSyncProgress: this.currentSyncProgress,
      syncQueue: this.db.gdriveSyncQueueGetAll(),
      scanPhase: this.scanPhase,
      scanInfo: this.scanInfo,
      recentSynced: this.db.gdriveManifestRecent() || [],
      lastError: this.lastError,
      pollIntervalMs: this._pollIntervalMs,
      subscriptions: this.db.gdriveSubscriptionsAll(),
      syncErrors: this.db.gdriveSyncErrorsAll(),
      ignoredExtensions: this.db.gdriveStateGet('ignored_extensions', ''),
      allowedExtensions: this.db.gdriveStateGet('allowed_extensions', ''),
      tempDownloadDir: this.db.gdriveStateGet('temp_download_dir', ''),
      throttleInfo: {
        currentConcurrency: this.throttleController.getConcurrency(),
        isThrottled: this.rateLimiter.isThrottled(),
        apiStats: this.rateLimiter.getStats(),
        syncStats: this.throttleController.getStats(),
      },
    };
  }

  _startQueueWorker() {
    if (this._queueWorkerRunning) return;
    this._queueWorkerRunning = true;
    this._activeWorkers = 0;
    this._adjustWorkers();
  }

  /**
   * Spawn or reduce workers to match throttleController.getConcurrency().
   */
  _adjustWorkers() {
    const target = this.throttleController.getConcurrency();
    while (this._activeWorkers < target) {
      this._activeWorkers += 1;
      this._runWorkerLoop();
    }
  }

  /**
   * Single worker loop: pick next file, sync with retry, report result.
   */
  async _runWorkerLoop() {
    while (this._queueWorkerRunning) {
      // Check if this worker should exit (concurrency reduced)
      if (this._activeWorkers > this.throttleController.getConcurrency()) {
        this._activeWorkers -= 1;
        return;
      }

      if (!this.auth.isConnected()) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const next = this.db.gdriveSyncQueueGetNext();
      if (!next) {
        if (this.status === 'syncing' && !this._syncInProgress) {
          this.status = 'idle';
          this.currentSyncFile = null;
          this.currentSyncProgress = 0;
          this.pendingCount = 0;
          this.onChange();
        }
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      this.status = 'syncing';
      this.currentSyncFile = next.fileName;
      this.currentSyncProgress = 0;
      this.pendingCount = this.db.gdriveSyncQueueCount();
      this.onChange();

      let synced = false;
      const startAttempt = (next.retryCount || 0) + 1;

      for (let attempt = startAttempt; attempt <= startAttempt + 2; attempt++) {
        try {
          await this._syncFile(next);
          synced = true;
          break;
        } catch (e) {
          const errorType = this._classifyError(e);
          this.throttleController.reportError(errorType);

          const { retry, delayMs } = this.throttleController.shouldRetry(attempt, errorType);
          if (!retry) {
            console.error(`[GDriveSyncService] Permanent fail ${next.drivePath} (${errorType}):`, e.message);
            break;
          }

          console.warn(`[GDriveSyncService] Retry ${attempt} for ${next.drivePath} in ${delayMs}ms (${errorType})`);
          this.db.gdriveSyncQueueIncrementRetry(next.driveFileId);
          await new Promise(r => setTimeout(r, delayMs));

          // Adjust workers after error (concurrency may have dropped)
          if (this._activeWorkers > this.throttleController.getConcurrency()) {
            this._activeWorkers -= 1;
            return;
          }
        }
      }

      if (synced) {
        this.db.gdriveSyncQueueRemove(next.driveFileId);
        this.syncedCount += 1;
        this.throttleController.reportSuccess();
        // Maybe spawn more workers after success
        this._adjustWorkers();
      } else {
        // Failed after all retries — already in sync errors via _syncFile catch, remove from queue
        this.db.gdriveSyncQueueRemove(next.driveFileId);
      }

      this.pendingCount = this.db.gdriveSyncQueueCount();
      this.onChange();
    }
  }


  /**
   * Connect to Google Drive via OAuth2.
   * @param {string} clientId
   * @param {string} clientSecret
   */
  async connect(clientId, clientSecret) {
    this.auth.saveCredentials(clientId, clientSecret);
    const result = await this.auth.authorize();
    if (result.ok) {
      this.status = 'idle';
      // Initialize changes page token
      const { newStartPageToken } = await this.api.getChanges(null);
      this.db.gdriveStateSet('changes_page_token', newStartPageToken);
      this._startQueueWorker();
      this.onChange();
    }
    return result;
  }

  /** @returns {boolean} */
  isSyncing() { return this._syncInProgress; }

  /**
   * Remove a specific file from the active sync queue.
   * @param {string} driveFileId 
   */
  removeQueueItem(driveFileId) {
    this.db.gdriveSyncQueueRemove(driveFileId);
    this.pendingCount = this.db.gdriveSyncQueueCount();
    this.onChange();
  }

  /**
   * Disconnect: clear all tokens, subscriptions, and manifest.
   */
  disconnect() {
    this.stopPolling();
    this.auth.disconnect();
    for (const sub of this.db.gdriveSubscriptionsAll()) {
      this.db.gdriveSubscriptionRemove(sub.driveId);
    }
    this.db.gdriveManifestClear();
    this.db.gdriveStateSet('changes_page_token', '');
    this.status = 'disconnected';
    this.lastError = null;
    this.onChange();
  }

  /**
   * Update polling interval.
   * @param {number} ms - 0 or negative to disable auto polling
   */
  setPollInterval(ms) {
    this._pollIntervalMs = ms;
    this.db.gdriveStateSet('poll_interval_ms', ms.toString());
    if (this._pollTimer) {
      this.stopPolling();
      if (ms > 0) this.startPolling();
    }
  }

  startPolling() {
    if (this._pollTimer || this._pollIntervalMs <= 0) return;
    if (!this.auth.isConnected() || this.isPaused) return;
    
    // Trigger immediate poll sync on startup/resume
    void this._runPollSync();
    
    this._pollTimer = setInterval(() => void this._runPollSync(), this._pollIntervalMs);
  }

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async scanNow() {
    if (!this.auth.isConnected() || this._syncInProgress || this.isPaused) return;
    if (!this.auth.isConnected()) {
      this.status = 'disconnected';
      this.onChange();
      return;
    }

    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    this.onChange();

    try {
      const subs = this.db.gdriveSubscriptionsAll().filter(s => s.enabled);

      this.scanPhase = 'scanning';
      this.scanInfo = { currentFolder: '/', filesFound: 0 };
      this.totalCount = 0;
      this.syncedCount = 0;
      this.currentSyncFile = null;
      this.currentSyncProgress = 0;
      this.onChange();

      // --- Scanner (producer): discovers files and pushes to db queue ---
      for (const sub of subs) {
        if (sub.isFolder) {
          await this.api.listFolderRecursive(sub.driveId, '', new Set(), {
            onProgress: (info) => {
              this.scanInfo = { currentFolder: `${sub.drivePath}/${info.currentFolder}`, filesFound: info.filesFound };
              this.onChange();
            },
            onFile: (f) => {
              if (!this._shouldSyncFile(f.name)) return;
              const manifest = this.db.gdriveManifestGet(f.id);
              if (manifest && manifest.driveModifiedTime === f.modifiedTime) return;
              this.db.gdriveSyncQueueAdd({
                driveFileId: f.id,
                fileName: f.name,
                drivePath: f.drivePath,
                vaultPath: `${sub.vaultPath}${f.drivePath}`,
                size: f.size,
                modifiedTime: f.modifiedTime,
              });
              this.totalCount += 1;
              this.pendingCount = this.db.gdriveSyncQueueCount();
              this.onChange();
            },
          });
        } else {
          // Single file subscription
          try {
            const file = await this.api.getFile(sub.driveId);
            if (!file || file.trashed) continue;
            if (!this._shouldSyncFile(file.name)) continue;
            const manifest = this.db.gdriveManifestGet(sub.driveId);
            if (manifest && manifest.driveModifiedTime === file.modifiedTime) continue;
            this.db.gdriveSyncQueueAdd({
              driveFileId: file.id,
              fileName: file.name,
              drivePath: sub.drivePath,
              vaultPath: sub.vaultPath,
              size: Number(file.size) || 0,
              modifiedTime: file.modifiedTime,
            });
            this.totalCount += 1;
            this.pendingCount = this.db.gdriveSyncQueueCount();
            this.onChange();
          } catch (e) {
            console.warn(`[GDriveSyncService] Failed to get file ${sub.driveId}:`, e.message);
          }
        }
      }

      // Signal scan complete
      this.scanPhase = null;
      this.scanInfo = null;
      this.onChange();

      try {
        const token = this.db.gdriveStateGet('changes_page_token');
        if (!token) {
          const { newStartPageToken } = await this.api.getChanges(null);
          this.db.gdriveStateSet('changes_page_token', newStartPageToken);
        }
      } catch (tokenErr) {
        console.warn('[GDriveSyncService] Failed to set changes token post-scan:', tokenErr.message);
      }

      this.lastSyncAt = new Date().toISOString();
      if (this.db.gdriveSyncQueueCount() === 0) {
        this.status = 'idle';
      } else {
        this.status = 'syncing';
      }
    } catch (e) {
      this.status = 'error';
      this.lastError = String(e.message || e);
      console.error('[GDriveSyncService] scan error:', e);
    } finally {
      this.currentSyncFile = null;
      this.currentSyncProgress = 0;
      this.scanPhase = null;
      this.scanInfo = null;
      this._syncInProgress = false;
      this.onChange();
    }
  }

  /**
   * Poll-based sync using Google Drive Changes API.
   */
  async _runPollSync() {
    if (this._syncInProgress) return;
    if (!this.auth.isConnected()) return;

    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    this.onChange();

    try {
      let pageToken = this.db.gdriveStateGet('changes_page_token');
      if (!pageToken) {
        const { newStartPageToken } = await this.api.getChanges(null);
        this.db.gdriveStateSet('changes_page_token', newStartPageToken);
        this._syncInProgress = false;
        this.status = 'idle';
        this.onChange();
        return;
      }

      const { changes, newStartPageToken } = await this.api.getChanges(pageToken);
      this.db.gdriveStateSet('changes_page_token', newStartPageToken);

      // Filter changes to subscribed files/folders
      const subs = this.db.gdriveSubscriptionsAll().filter(s => s.enabled);
      const filesToSync = [];

      for (const change of changes) {
        if (change.removed || !change.file) continue;
        if (change.file.trashed) continue;
        if (change.file.mimeType === 'application/vnd.google-apps.folder') continue;
        if (change.file.mimeType?.startsWith('application/vnd.google-apps.')) continue;
        if (!this._shouldSyncFile(change.file.name)) continue;

        for (const sub of subs) {
          if (sub.isFolder) {
            // Check if file was previously synced under this subscription
            const manifest = this.db.gdriveManifestGet(change.fileId);
            if (manifest && manifest.vaultPath.startsWith(sub.vaultPath)) {
              if (manifest.driveModifiedTime !== change.file.modifiedTime) {
                filesToSync.push({
                  driveFileId: change.fileId,
                  fileName: change.file.name,
                  drivePath: manifest.drivePath,
                  vaultPath: manifest.vaultPath,
                  size: Number(change.file.size) || 0,
                  modifiedTime: change.file.modifiedTime,
                  md5Checksum: change.file.md5Checksum || null,
                });
              }
              break;
            }
          } else if (sub.driveId === change.fileId) {
            const manifest = this.db.gdriveManifestGet(change.fileId);
            if (!manifest || manifest.driveModifiedTime !== change.file.modifiedTime) {
              filesToSync.push({
                driveFileId: change.fileId,
                fileName: change.file.name,
                drivePath: sub.drivePath,
                vaultPath: sub.vaultPath,
                size: Number(change.file.size) || 0,
                modifiedTime: change.file.modifiedTime,
                md5Checksum: change.file.md5Checksum || null,
              });
            }
            break;
          }
        }
      }

      this.pendingCount = this.db.gdriveSyncQueueCount();
      this.totalCount += filesToSync.length;
      this.onChange();

      for (const f of filesToSync) {
        this.db.gdriveSyncQueueAdd({
          driveFileId: f.driveFileId,
          fileName: f.fileName,
          drivePath: f.drivePath,
          vaultPath: f.vaultPath,
          size: f.size,
          modifiedTime: f.modifiedTime,
        });
      }
      this.pendingCount = this.db.gdriveSyncQueueCount();
      this.onChange();

      this.lastSyncAt = new Date().toISOString();
      if (this.pendingCount === 0) {
        this.status = 'idle';
      } else {
        this.status = 'syncing';
      }
    } catch (e) {
      this.status = 'error';
      this.lastError = String(e.message || e);
      console.error('[GDriveSyncService] poll error:', e);
    } finally {
      this._syncInProgress = false;
      this.onChange();
    }
  }

  _notifyProgress() {
    const now = Date.now();
    if (now - this._lastProgressNotifyAt >= 200) {
      this._lastProgressNotifyAt = now;
      this.onChange();
    }
  }

  /**
   * Download from Drive and upload to Telegram vault.
   */
  async _syncFile({ driveFileId, fileName, drivePath, vaultPath, size, modifiedTime }) {
    try {
      this.currentSyncProgress = 0;
      this.onChange();

      // Download to temp
      const customTempDir = this.db.gdriveStateGet('temp_download_dir', '');
      const tempPath = await this.api.downloadFile(driveFileId, fileName, customTempDir, (progress) => {
        this.currentSyncProgress = progress * 0.5;
        this._notifyProgress();
      });

      try {
        // Compute SHA256
        const sha256 = this._sha256Of(tempPath);

        // Dedup check: if same SHA256 + size already on vault at same path, skip
        const existingEntries = this.db.getAll().filter(e => e.path === vaultPath);
        if (existingEntries.length > 0) {
          const existing = existingEntries[0];
          if (existing.sha256 === sha256 && existing.size === size) {
            // Already on vault, just update manifest
            this.db.gdriveManifestUpsert({
              driveFileId, drivePath, vaultPath, sha256, size,
              driveModifiedTime: modifiedTime,
            });
            this.db.gdriveSyncErrorRemove(driveFileId);
            return;
          }
        }

        // Upload to Telegram vault
        const { task, done } = this.vault.enqueueUpload(tempPath, vaultPath, { metadata: { source: 'gdrive' } });
        const unsub = task.onProgress((progress) => {
          this.currentSyncProgress = 0.5 + (progress * 0.5);
          this._notifyProgress();
        });
        await done;
        unsub();

        // Update manifest
        this.db.gdriveManifestUpsert({
          driveFileId, drivePath, vaultPath, sha256, size,
          driveModifiedTime: modifiedTime,
        });
        this.db.gdriveSyncErrorRemove(driveFileId);
      } finally {
        // Clean up temp file
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); }
        catch (e) { console.warn('[GDriveSyncService] temp cleanup failed:', e); }
      }
    } catch (e) {
      this.db.gdriveSyncErrorAdd({
        driveFileId, fileName, drivePath, vaultPath, size,
        modifiedTime, errorMessage: String(e.message || e),
      });
      throw e;
    }
  }

  _sha256Of(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  _shouldSyncFile(fileName) {
    const ext = path.extname(fileName).toLowerCase().slice(1);
    if (!ext) return true;

    const ignoredStr = this.db.gdriveStateGet('ignored_extensions', '');
    if (ignoredStr) {
      const ignoredList = ignoredStr.split(',').map(s => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
      if (ignoredList.includes(ext)) return false;
    }

    const allowedStr = this.db.gdriveStateGet('allowed_extensions', '');
    if (allowedStr) {
      const allowedList = allowedStr.split(',').map(s => s.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
      if (allowedList.length > 0 && !allowedList.includes(ext)) return false;
    }

    return true;
  }

  /**
   * Classify an error for retry decisions.
   * @param {Error} err
   * @returns {'throttle'|'timeout'|'network'|'permanent'}
   */
  _classifyError(err) {
    const msg = String(err.message || err).toLowerCase();

    // Throttle errors
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('flood')) {
      return 'throttle';
    }

    // Timeout errors
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'timeout';
    }

    // Network errors
    if (
      msg.includes('econnreset') || msg.includes('enotfound') ||
      msg.includes('socket hang up') || msg.includes('econnrefused') ||
      msg.includes('network') || msg.includes('fetch failed')
    ) {
      return 'network';
    }

    // Permanent errors (404, 403 non-rate-limit, trashed)
    if (msg.includes('404') || msg.includes('not found') || msg.includes('trashed')) {
      return 'permanent';
    }
    if (msg.includes('403') && !msg.includes('rate')) {
      return 'permanent';
    }

    // Default to network (retriable)
    return 'network';
  }

  // --- Subscription management ---

  addSubscription({ driveId, drivePath, vaultPath, isFolder }) {
    this.db.gdriveSubscriptionAdd({ driveId, drivePath, vaultPath, isFolder });
    this.onChange();
  }

  removeSubscription(driveId) {
    // Clean manifest entries for this subscription
    const sub = this.db.gdriveSubscriptionsAll().find(s => s.driveId === driveId);
    if (sub) {
      for (const m of this.db.gdriveManifestAll()) {
        if (m.vaultPath.startsWith(sub.vaultPath)) {
          this.db.gdriveManifestDelete(m.driveFileId);
        }
      }
    }
    this.db.gdriveSubscriptionRemove(driveId);
    this.onChange();
  }

  toggleSubscription(driveId, enabled) {
    this.db.gdriveSubscriptionSetEnabled(driveId, enabled);
    this.onChange();
  }

  /**
   * List folder contents for file picker UI.
   */
  async listDriveFolder(folderId = 'root') {
    return this.api.listFolder(folderId);
  }

  /**
   * Manual retry for a failed sync file.
   */
  async retryFile(driveFileId) {
    const errors = this.db.gdriveSyncErrorsAll();
    const target = errors.find(err => err.driveFileId === driveFileId);
    if (!target) return { ok: false, error: 'File not found in sync errors' };

    this._syncInProgress = true;
    this.status = 'syncing';
    this.lastError = null;
    this.onChange();

    try {
      await this._syncFile({
        driveFileId: target.driveFileId,
        fileName: target.fileName,
        drivePath: target.drivePath,
        vaultPath: target.vaultPath,
        size: target.size,
        modifiedTime: target.modifiedTime,
      });
      this.status = 'idle';
      this.onChange();
      return { ok: true };
    } catch (e) {
      this.status = 'error';
      this.lastError = String(e.message || e);
      this.onChange();
      return { ok: false, error: String(e.message || e) };
    } finally {
      this._syncInProgress = false;
      this.onChange();
    }
  }
}

module.exports = { GDriveSyncService };
