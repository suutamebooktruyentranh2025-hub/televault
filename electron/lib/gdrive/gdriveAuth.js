const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { shell } = require('electron');

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

class GDriveAuth {
  /**
   * @param {{ db: import('../db/indexDb').ReturnType<import('../db/indexDb').openIndexDb> }} opts
   */
  constructor({ db }) {
    this.db = db;
  }

  get clientId() { return this.db.gdriveTokenGet('client_id'); }
  get clientSecret() { return this.db.gdriveTokenGet('client_secret'); }
  get accessToken() { return this.db.gdriveTokenGet('access_token'); }
  get refreshToken() { return this.db.gdriveTokenGet('refresh_token'); }
  get expiry() { return this.db.gdriveTokenGet('expiry'); }
  get email() { return this.db.gdriveTokenGet('email'); }

  isConnected() {
    return Boolean(this.accessToken && this.refreshToken);
  }

  saveCredentials(clientId, clientSecret) {
    this.db.gdriveTokenSet('client_id', clientId);
    this.db.gdriveTokenSet('client_secret', clientSecret);
  }

  /**
   * Start OAuth2 flow: open browser, listen for redirect.
   * @returns {Promise<{ ok: boolean, email?: string, error?: string }>}
   */
  async authorize() {
    const clientId = this.clientId;
    const clientSecret = this.clientSecret;
    if (!clientId || !clientSecret) return { ok: false, error: 'Missing client credentials' };

    const { port, code } = await this._listenForCode();
    const redirectUri = `http://localhost:${port}`;

    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&response_type=code&scope=${encodeURIComponent(SCOPES)}`
      + `&access_type=offline&prompt=consent`
      + `&state=${state}`;

    await shell.openExternal(authUrl);

    let authCode;
    try {
      authCode = await code;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }

    // Exchange code for tokens
    const tokens = await this._exchangeCode(authCode, redirectUri);
    if (!tokens.ok) return tokens;

    this.db.gdriveTokenSet('access_token', tokens.access_token);
    this.db.gdriveTokenSet('refresh_token', tokens.refresh_token);
    this.db.gdriveTokenSet('expiry', tokens.expiry);

    // Get user email
    const email = await this._fetchEmail(tokens.access_token);
    if (email) this.db.gdriveTokenSet('email', email);

    return { ok: true, email };
  }

  /**
   * Get a valid access token, refreshing if needed.
   * @returns {Promise<string>}
   */
  async getValidToken() {
    const expiry = this.expiry;
    const now = Date.now();
    if (expiry && Number(expiry) > now + 60_000) {
      return this.accessToken;
    }
    return this._refreshAccessToken();
  }

  async _refreshAccessToken() {
    const clientId = this.clientId;
    const clientSecret = this.clientSecret;
    const refreshToken = this.refreshToken;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Cannot refresh — missing credentials');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    const data = await this._post(TOKEN_URL, body);
    if (data.error) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);

    this.db.gdriveTokenSet('access_token', data.access_token);
    const expiry = String(Date.now() + (data.expires_in || 3600) * 1000);
    this.db.gdriveTokenSet('expiry', expiry);
    if (data.refresh_token) {
      this.db.gdriveTokenSet('refresh_token', data.refresh_token);
    }
    return data.access_token;
  }

  disconnect() {
    this.db.gdriveTokensClear();
  }

  /**
   * Start a temporary local HTTP server to receive the OAuth redirect.
   * @returns {Promise<{ port: number, code: Promise<string> }>}
   */
  _listenForCode() {
    return new Promise((resolve) => {
      const server = http.createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const codePromise = new Promise((resolveCode, rejectCode) => {
          const timeout = setTimeout(() => {
            server.close();
            rejectCode(new Error('OAuth timeout — vui lòng thử lại'));
          }, 5 * 60 * 1000);

          server.on('request', (req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            if (code) {
              res.end('<html><body><h2>Đã kết nối Google Drive! Bạn có thể đóng tab này.</h2></body></html>');
              clearTimeout(timeout);
              server.close();
              resolveCode(code);
            } else {
              res.end(`<html><body><h2>Lỗi: ${error || 'unknown'}</h2></body></html>`);
              clearTimeout(timeout);
              server.close();
              rejectCode(new Error(error || 'OAuth failed'));
            }
          });
        });
        resolve({ port, code: codePromise });
      });
    });
  }

  async _exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString();

    const data = await this._post(TOKEN_URL, body);
    if (data.error) return { ok: false, error: data.error_description || data.error };

    return {
      ok: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry: String(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  async _fetchEmail(token) {
    try {
      const data = await this._get('https://www.googleapis.com/oauth2/v2/userinfo', token);
      return data.email || null;
    } catch { return null; }
  }

  /**
   * POST request via node:https.
   */
  _post(url, body) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON response')); }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google Drive Auth Request Timeout'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * GET request via node:https with Bearer auth.
   */
  _get(url, token) {
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
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON response')); }
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

module.exports = { GDriveAuth };
