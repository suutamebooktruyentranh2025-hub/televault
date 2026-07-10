# Rate Limit + Retry + Backoff Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Add rate limiting, adaptive concurrency, retry with exponential backoff to the GDrive→Telegram sync pipeline so it handles 10K+ files without being throttled.

**Architecture:** Two new modules (`apiRateLimiter.js`, `syncThrottleController.js`) injected into existing `gdriveApi.js` and `gdriveSyncService.js`. Token bucket for API rate limiting, adaptive concurrency controller for queue worker, per-file retry with error classification.

**Tech Stack:** Node.js, better-sqlite3, native `https` module. Test runner: npm test (vitest via `@televault/core`).

**Design doc:** `docs/plans/2026-07-09-rate-limit-retry-backoff-design.md`

---

### Task 1: Create `ApiRateLimiter` Module

**Files:**
- Create: `electron/lib/gdrive/apiRateLimiter.js`
- Test: `electron/lib/gdrive/__tests__/apiRateLimiter.test.js`

**Step 1: Create test directory and write failing tests**

Create `electron/lib/gdrive/__tests__/apiRateLimiter.test.js`:

```js
const { describe, it, expect, vi, beforeEach } = require('vitest');
const { ApiRateLimiter } = require('../apiRateLimiter');

describe('ApiRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('acquire() resolves immediately when tokens available', async () => {
    const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
    const start = Date.now();
    await limiter.acquire();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('acquire() waits when tokens exhausted', async () => {
    const limiter = new ApiRateLimiter({ tokensPerSecond: 1, maxBurst: 1 });
    await limiter.acquire(); // consume the 1 token
    const p = limiter.acquire(); // should wait
    vi.advanceTimersByTime(1000);
    await p;
    expect(limiter.getStats().calls).toBe(2);
  });

  it('reportThrottle() pauses acquisition', async () => {
    const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
    limiter.reportThrottle(5000);
    expect(limiter.isThrottled()).toBe(true);
  });

  it('reportSuccess() increments call count', () => {
    const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
    limiter.reportSuccess();
    limiter.reportSuccess();
    expect(limiter.getStats().calls).toBe(2);
  });

  it('getStats() returns correct shape', () => {
    const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
    const stats = limiter.getStats();
    expect(stats).toHaveProperty('calls');
    expect(stats).toHaveProperty('throttled');
    expect(stats).toHaveProperty('avgWaitMs');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/lib/gdrive/__tests__/apiRateLimiter.test.js`
Expected: FAIL — module not found

**Step 3: Implement `ApiRateLimiter`**

Create `electron/lib/gdrive/apiRateLimiter.js`:

```js
/**
 * Token-bucket rate limiter for Google Drive API calls.
 * Prevents 429 errors by throttling outgoing requests.
 */
class ApiRateLimiter {
  /**
   * @param {{ tokensPerSecond?: number, maxBurst?: number }} opts
   */
  constructor({ tokensPerSecond = 8, maxBurst = 12 } = {}) {
    this._tokensPerSecond = tokensPerSecond;
    this._maxBurst = maxBurst;
    this._tokens = maxBurst;
    this._lastRefill = Date.now();
    this._throttledUntil = 0;
    this._backoffLevel = 0;
    this._stats = { calls: 0, throttled: 0, totalWaitMs: 0 };
    this._waitQueue = [];
  }

  /**
   * Wait for a rate-limit token before making an API call.
   * @returns {Promise<void>}
   */
  async acquire() {
    const waitStart = Date.now();

    // Wait if currently throttled (429 backoff)
    const throttleRemaining = this._throttledUntil - Date.now();
    if (throttleRemaining > 0) {
      await this._sleep(throttleRemaining);
    }

    // Refill tokens
    this._refill();

    // Wait for token
    while (this._tokens < 1) {
      const waitMs = Math.ceil((1 - this._tokens) / this._tokensPerSecond * 1000);
      await this._sleep(Math.max(waitMs, 50));
      this._refill();
    }

    this._tokens -= 1;
    const waited = Date.now() - waitStart;
    if (waited > 10) {
      this._stats.totalWaitMs += waited;
    }
  }

  /** Call after a successful API response. */
  reportSuccess() {
    this._stats.calls += 1;
    // Gradually recover backoff level
    if (this._backoffLevel > 0) {
      this._backoffLevel = Math.max(0, this._backoffLevel - 0.5);
    }
  }

  /**
   * Call when receiving a 429 or rate-limit error.
   * @param {number} [retryAfterMs] - Retry-After value in ms, if provided by server
   */
  reportThrottle(retryAfterMs) {
    this._stats.throttled += 1;
    this._stats.calls += 1;
    this._backoffLevel = Math.min(this._backoffLevel + 1, 6); // cap at 2^6 = 64s

    const backoffMs = retryAfterMs || Math.min(1000 * Math.pow(2, this._backoffLevel), 60000);
    this._throttledUntil = Date.now() + backoffMs;
    this._tokens = 0; // drain tokens during throttle

    console.warn(`[ApiRateLimiter] Throttled for ${backoffMs}ms (level ${this._backoffLevel})`);
  }

  /** @returns {boolean} */
  isThrottled() {
    return Date.now() < this._throttledUntil;
  }

  /** @returns {{ calls: number, throttled: number, avgWaitMs: number }} */
  getStats() {
    const totalCalls = this._stats.calls || 1;
    return {
      calls: this._stats.calls,
      throttled: this._stats.throttled,
      avgWaitMs: Math.round(this._stats.totalWaitMs / totalCalls),
    };
  }

  /** @private */
  _refill() {
    const now = Date.now();
    const elapsed = (now - this._lastRefill) / 1000;
    this._tokens = Math.min(this._maxBurst, this._tokens + elapsed * this._tokensPerSecond);
    this._lastRefill = now;
  }

  /** @private */
  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = { ApiRateLimiter };
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/lib/gdrive/__tests__/apiRateLimiter.test.js`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add electron/lib/gdrive/apiRateLimiter.js electron/lib/gdrive/__tests__/apiRateLimiter.test.js
git commit -m "feat(gdrive): add ApiRateLimiter token bucket module"
```

---

### Task 2: Create `SyncThrottleController` Module

**Files:**
- Create: `electron/lib/gdrive/syncThrottleController.js`
- Test: `electron/lib/gdrive/__tests__/syncThrottleController.test.js`

**Step 1: Write failing tests**

Create `electron/lib/gdrive/__tests__/syncThrottleController.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { SyncThrottleController } = require('../syncThrottleController');

describe('SyncThrottleController', () => {
  it('starts at minConcurrency', () => {
    const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3 });
    expect(c.getConcurrency()).toBe(1);
  });

  it('scales up after N consecutive successes', () => {
    const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 3 });
    c.reportSuccess();
    c.reportSuccess();
    expect(c.getConcurrency()).toBe(1);
    c.reportSuccess();
    expect(c.getConcurrency()).toBe(2);
  });

  it('scales down to min on throttle error', () => {
    const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 2 });
    c.reportSuccess();
    c.reportSuccess(); // scale to 2
    expect(c.getConcurrency()).toBe(2);
    c.reportError('throttle');
    expect(c.getConcurrency()).toBe(1);
  });

  it('does not scale up during cooldown', () => {
    const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 2, cooldownMs: 60000 });
    c.reportError('throttle');
    c.reportSuccess();
    c.reportSuccess();
    expect(c.getConcurrency()).toBe(1); // cooldown active
  });

  it('shouldRetry returns true for retriable errors within max attempts', () => {
    const c = new SyncThrottleController();
    expect(c.shouldRetry(1, 'timeout').retry).toBe(true);
    expect(c.shouldRetry(1, 'network').retry).toBe(true);
    expect(c.shouldRetry(1, 'throttle').retry).toBe(true);
  });

  it('shouldRetry returns false for permanent errors', () => {
    const c = new SyncThrottleController();
    expect(c.shouldRetry(1, 'permanent').retry).toBe(false);
  });

  it('shouldRetry returns false after max attempts', () => {
    const c = new SyncThrottleController({ maxRetries: 3 });
    expect(c.shouldRetry(3, 'timeout').retry).toBe(true);
    expect(c.shouldRetry(4, 'timeout').retry).toBe(false);
  });

  it('shouldRetry returns increasing delay', () => {
    const c = new SyncThrottleController();
    const r1 = c.shouldRetry(1, 'timeout');
    const r2 = c.shouldRetry(2, 'timeout');
    expect(r2.delayMs).toBeGreaterThan(r1.delayMs);
  });

  it('getStats returns correct shape', () => {
    const c = new SyncThrottleController();
    const stats = c.getStats();
    expect(stats).toHaveProperty('concurrency');
    expect(stats).toHaveProperty('successStreak');
    expect(stats).toHaveProperty('throttleCount');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run electron/lib/gdrive/__tests__/syncThrottleController.test.js`
Expected: FAIL — module not found

**Step 3: Implement `SyncThrottleController`**

Create `electron/lib/gdrive/syncThrottleController.js`:

```js
/**
 * Adaptive concurrency controller + retry logic for the GDrive sync queue worker.
 * Starts conservative (1 concurrent), scales up on success, drops back on errors.
 */
class SyncThrottleController {
  /**
   * @param {{
   *   minConcurrency?: number,
   *   maxConcurrency?: number,
   *   scaleUpAfter?: number,
   *   cooldownMs?: number,
   *   maxRetries?: number,
   *   baseRetryDelayMs?: number,
   * }} opts
   */
  constructor({
    minConcurrency = 1,
    maxConcurrency = 3,
    scaleUpAfter = 5,
    cooldownMs = 30000,
    maxRetries = 3,
    baseRetryDelayMs = 2000,
  } = {}) {
    this._min = minConcurrency;
    this._max = maxConcurrency;
    this._scaleUpAfter = scaleUpAfter;
    this._cooldownMs = cooldownMs;
    this._maxRetries = maxRetries;
    this._baseRetryDelayMs = baseRetryDelayMs;

    this._concurrency = minConcurrency;
    this._successStreak = 0;
    this._throttleCount = 0;
    this._lastScaleDownAt = 0;
  }

  /** @returns {number} Current target concurrency */
  getConcurrency() {
    return this._concurrency;
  }

  /** Call after a file syncs successfully. May increase concurrency. */
  reportSuccess() {
    this._successStreak += 1;
    if (
      this._successStreak >= this._scaleUpAfter &&
      this._concurrency < this._max &&
      !this._inCooldown()
    ) {
      this._concurrency += 1;
      this._successStreak = 0;
      console.log(`[SyncThrottleController] Scale up → concurrency=${this._concurrency}`);
    }
  }

  /**
   * Call when a sync error occurs.
   * @param {'throttle'|'timeout'|'network'|'permanent'} type
   */
  reportError(type) {
    this._successStreak = 0;
    if (type === 'throttle' || type === 'timeout') {
      this._throttleCount += 1;
      this._concurrency = this._min;
      this._lastScaleDownAt = Date.now();
      console.warn(`[SyncThrottleController] Scale down → concurrency=${this._concurrency} (${type})`);
    }
  }

  /**
   * Determine whether a failed file should be retried.
   * @param {number} attempt - Current attempt number (1-based)
   * @param {'throttle'|'timeout'|'network'|'permanent'} errorType
   * @returns {{ retry: boolean, delayMs: number }}
   */
  shouldRetry(attempt, errorType) {
    if (errorType === 'permanent') {
      return { retry: false, delayMs: 0 };
    }
    if (attempt > this._maxRetries) {
      return { retry: false, delayMs: 0 };
    }
    const delayMs = this._baseRetryDelayMs * Math.pow(2, attempt - 1);
    return { retry: true, delayMs };
  }

  /** @returns {{ concurrency: number, successStreak: number, throttleCount: number }} */
  getStats() {
    return {
      concurrency: this._concurrency,
      successStreak: this._successStreak,
      throttleCount: this._throttleCount,
    };
  }

  /** @private */
  _inCooldown() {
    return Date.now() - this._lastScaleDownAt < this._cooldownMs;
  }
}

module.exports = { SyncThrottleController };
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run electron/lib/gdrive/__tests__/syncThrottleController.test.js`
Expected: PASS (all 9 tests)

**Step 5: Commit**

```bash
git add electron/lib/gdrive/syncThrottleController.js electron/lib/gdrive/__tests__/syncThrottleController.test.js
git commit -m "feat(gdrive): add SyncThrottleController adaptive concurrency module"
```

---

### Task 3: Integrate `ApiRateLimiter` into `GDriveApi`

**Files:**
- Modify: `electron/lib/gdrive/gdriveApi.js:11-17` (constructor)
- Modify: `electron/lib/gdrive/gdriveApi.js:219-247` (`_get()` method)
- Modify: `electron/lib/gdrive/gdriveApi.js:162-214` (`_downloadStream()` method)

**Step 1: Update constructor to accept rateLimiter**

In `electron/lib/gdrive/gdriveApi.js`, change the constructor (lines 11-17):

```js
// Before:
constructor({ auth }) {
  this.auth = auth;
}

// After:
constructor({ auth, rateLimiter = null }) {
  this.auth = auth;
  this.rateLimiter = rateLimiter;
}
```

**Step 2: Add rate limiting + 429 retry to `_get()`**

Replace `_get()` method (lines 219-247) with:

```js
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
```

**Step 3: Add 429 handling to `_downloadStream()`**

In `_downloadStream()` (lines 162-214), add 429 handling after the redirect check (line 181). Insert before the `if (res.statusCode !== 200)` block:

```js
// Handle 429 for downloads
if (res.statusCode === 429) {
  res.resume();
  const retryAfterSec = parseInt(res.headers['retry-after'] || '0', 10);
  const retryAfterMs = retryAfterSec > 0 ? retryAfterSec * 1000 : undefined;
  if (this.rateLimiter) this.rateLimiter.reportThrottle(retryAfterMs);
  const delay = retryAfterMs || 2000 * Math.pow(2, redirectCount);
  setTimeout(() => {
    this._downloadStream(url, token, destPath, redirectCount + 1, onProgress)
      .then(resolve, reject);
  }, delay);
  return;
}
```

**Step 4: Verify build doesn't break**

Run: `node -e "require('./electron/lib/gdrive/gdriveApi.js')"`
Expected: no errors (module loads cleanly)

**Step 5: Commit**

```bash
git add electron/lib/gdrive/gdriveApi.js
git commit -m "feat(gdrive): integrate ApiRateLimiter into GDriveApi with 429 retry"
```

---

### Task 4: Add `retry_count` column to `gdrive_sync_queue`

**Files:**
- Modify: `electron/lib/db/indexDb.js:94-102` (table schema)
- Modify: `electron/lib/db/indexDb.js:705-745` (queue methods)

**Step 1: Update schema to add `retry_count` column**

In `electron/lib/db/indexDb.js`, change the CREATE TABLE statement (lines 94-102):

```sql
-- Before:
CREATE TABLE IF NOT EXISTS gdrive_sync_queue(
  drive_file_id TEXT PRIMARY KEY,
  file_name TEXT,
  drive_path TEXT,
  vault_path TEXT,
  size INTEGER,
  modified_time TEXT,
  added_at TEXT
);

-- After:
CREATE TABLE IF NOT EXISTS gdrive_sync_queue(
  drive_file_id TEXT PRIMARY KEY,
  file_name TEXT,
  drive_path TEXT,
  vault_path TEXT,
  size INTEGER,
  modified_time TEXT,
  added_at TEXT,
  retry_count INTEGER DEFAULT 0
);
```

**Step 2: Add migration for existing databases**

After the schema exec block (line 103), add:

```js
// Migration: add retry_count if missing
try {
  db.prepare('SELECT retry_count FROM gdrive_sync_queue LIMIT 0').get();
} catch {
  db.exec('ALTER TABLE gdrive_sync_queue ADD COLUMN retry_count INTEGER DEFAULT 0');
}
```

**Step 3: Update `gdriveSyncQueueAdd` to accept retry_count**

Change `gdriveSyncQueueAdd` (line 705-711):

```js
gdriveSyncQueueAdd({ driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, retryCount = 0 }) {
  db.prepare(`
    INSERT OR REPLACE INTO gdrive_sync_queue(
      drive_file_id, file_name, drive_path, vault_path, size, modified_time, added_at, retry_count
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(driveFileId, fileName, drivePath, vaultPath, size, modifiedTime, retryCount);
},
```

**Step 4: Update `gdriveSyncQueueGetNext` to return retry_count**

Change `gdriveSyncQueueGetNext` (lines 712-723):

```js
gdriveSyncQueueGetNext() {
  const r = db.prepare('SELECT * FROM gdrive_sync_queue ORDER BY added_at ASC LIMIT 1').get();
  if (!r) return null;
  return {
    driveFileId: r.drive_file_id,
    fileName: r.file_name,
    drivePath: r.drive_path,
    vaultPath: r.vault_path,
    size: r.size,
    modifiedTime: r.modified_time,
    retryCount: r.retry_count || 0,
  };
},
```

**Step 5: Add `gdriveSyncQueueIncrementRetry` method**

After `gdriveSyncQueueClear` (line 744), add:

```js
gdriveSyncQueueIncrementRetry(driveFileId) {
  db.prepare('UPDATE gdrive_sync_queue SET retry_count = retry_count + 1 WHERE drive_file_id = ?').run(driveFileId);
},
```

**Step 6: Verify DB loads**

Run: `node -e "require('./electron/lib/db/indexDb.js')"`
Expected: no errors

**Step 7: Commit**

```bash
git add electron/lib/db/indexDb.js
git commit -m "feat(db): add retry_count to gdrive_sync_queue schema"
```

---

### Task 5: Refactor `gdriveSyncService` — Inject Dependencies + Error Classification

**Files:**
- Modify: `electron/lib/gdrive/gdriveSyncService.js:1-47` (imports + constructor)
- Modify: `electron/lib/gdrive/gdriveSyncService.js:417-474` (`_syncFile` + error classification)

**Step 1: Update imports and constructor**

In `gdriveSyncService.js`, add imports after line 5:

```js
const { ApiRateLimiter } = require('./apiRateLimiter');
const { SyncThrottleController } = require('./syncThrottleController');
```

Change constructor (lines 19-46) to create instances internally:

```js
constructor({ db, vault, onChange }) {
  this.db = db;
  this.vault = vault;
  this.onChange = onChange || (() => {});
  this.rateLimiter = new ApiRateLimiter();
  this.throttleController = new SyncThrottleController();
  this.auth = new GDriveAuth({ db });
  this.api = new GDriveApi({ auth: this.auth, rateLimiter: this.rateLimiter });
  /** @type {GDriveSyncStatus} */
  this.status = this.auth.isConnected() ? 'idle' : 'disconnected';
  this.lastSyncAt = null;
  this.pendingCount = 0;
  this.lastError = null;
  this.totalCount = 0;
  this.syncedCount = 0;
  this.currentSyncFile = null;
  this.currentSyncProgress = 0;
  this._lastProgressNotifyAt = 0;
  this.scanPhase = null;
  this.scanInfo = null;
  /** @type {NodeJS.Timeout | null} */
  this._pollTimer = null;
  this._syncInProgress = false;
  this._queueWorkerRunning = false;
  this._activeWorkers = 0;
  this._pollIntervalMs = 5 * 60 * 1000;

  if (this.auth.isConnected()) {
    this.pendingCount = this.db.gdriveSyncQueueCount();
    this._startQueueWorker();
  }
}
```

**Step 2: Add error classification helper**

Add after `_shouldSyncFile()` method (after line 499):

```js
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
```

**Step 3: Add throttle info to `getSnapshot()`**

In `getSnapshot()` (line 49-71), add after `allowedExtensions` line:

```js
throttleInfo: {
  currentConcurrency: this.throttleController.getConcurrency(),
  isThrottled: this.rateLimiter.isThrottled(),
  apiStats: this.rateLimiter.getStats(),
  syncStats: this.throttleController.getStats(),
},
```

**Step 4: Commit**

```bash
git add electron/lib/gdrive/gdriveSyncService.js
git commit -m "feat(gdrive): inject rate limiter + throttle controller + error classification"
```

---

### Task 6: Refactor `_startQueueWorker` — Adaptive Concurrency + Retry

**Files:**
- Modify: `electron/lib/gdrive/gdriveSyncService.js:73-115` (`_startQueueWorker`)

**Step 1: Replace `_startQueueWorker` with adaptive multi-worker version**

Replace lines 73-115 with:

```js
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
          // This worker should exit — put file back and return
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
      // Failed after all retries — move to errors, remove from queue
      this.db.gdriveSyncQueueRemove(next.driveFileId);
    }

    this.pendingCount = this.db.gdriveSyncQueueCount();
    this.onChange();
  }
}
```

Note: `_syncFile()` already writes to `gdrive_sync_errors` in its catch block (lines 467-473), so we don't need to duplicate that.

**Step 2: Verify the app starts and queue worker initializes**

Run: `node -e "require('./electron/lib/gdrive/gdriveSyncService.js')"`
Expected: no errors

**Step 3: Commit**

```bash
git add electron/lib/gdrive/gdriveSyncService.js
git commit -m "feat(gdrive): refactor queue worker with adaptive concurrency + retry"
```

---

### Task 7: Wire up in `sessionHandlers.js`

**Files:**
- Verify: `electron/lib/ipc/sessionHandlers.js:122-130` and `150-158`

**Step 1: Verify no changes needed**

The `GDriveSyncService` constructor now creates `ApiRateLimiter` and `SyncThrottleController` internally, so `sessionHandlers.js` does not need any changes. The existing `new GDriveSyncService({ db, vault, onChange })` calls remain unchanged.

Run: `node -e "require('./electron/lib/ipc/sessionHandlers.js')"` (may fail due to electron dependency, that's OK)

**Step 2: Commit (only if changes were needed)**

No commit needed for this task.

---

### Task 8: Integration Test — Full Pipeline

**Files:**
- Create: `electron/lib/gdrive/__tests__/rateLimitIntegration.test.js`

**Step 1: Write integration test**

Create `electron/lib/gdrive/__tests__/rateLimitIntegration.test.js`:

```js
const { describe, it, expect } = require('vitest');
const { ApiRateLimiter } = require('../apiRateLimiter');
const { SyncThrottleController } = require('../syncThrottleController');

describe('Rate Limit Integration', () => {
  it('limiter + controller work together under simulated throttle', async () => {
    const limiter = new ApiRateLimiter({ tokensPerSecond: 100, maxBurst: 100 });
    const controller = new SyncThrottleController({
      minConcurrency: 1,
      maxConcurrency: 3,
      scaleUpAfter: 3,
      cooldownMs: 100,
    });

    // Simulate 5 successes → should scale up
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
      limiter.reportSuccess();
      controller.reportSuccess();
    }
    expect(controller.getConcurrency()).toBe(2);

    // Simulate throttle → should scale down + limiter throttled
    limiter.reportThrottle(100);
    controller.reportError('throttle');
    expect(controller.getConcurrency()).toBe(1);
    expect(limiter.isThrottled()).toBe(true);
  });

  it('error classification returns correct types', () => {
    // We test this by constructing errors with known messages
    const classify = (msg) => {
      const err = new Error(msg);
      const m = String(err.message).toLowerCase();
      if (m.includes('429') || m.includes('rate limit')) return 'throttle';
      if (m.includes('timeout')) return 'timeout';
      if (m.includes('econnreset') || m.includes('socket hang up')) return 'network';
      if (m.includes('404') || m.includes('not found')) return 'permanent';
      return 'network';
    };

    expect(classify('429 Too Many Requests')).toBe('throttle');
    expect(classify('Rate limited')).toBe('throttle');
    expect(classify('Request Timeout')).toBe('timeout');
    expect(classify('ECONNRESET')).toBe('network');
    expect(classify('socket hang up')).toBe('network');
    expect(classify('404 Not Found')).toBe('permanent');
    expect(classify('Unknown error')).toBe('network');
  });
});
```

**Step 2: Run all gdrive tests**

Run: `npx vitest run electron/lib/gdrive/__tests__/`
Expected: PASS (all tests in all 3 files)

**Step 3: Commit**

```bash
git add electron/lib/gdrive/__tests__/rateLimitIntegration.test.js
git commit -m "test(gdrive): add rate limit integration tests"
```

---

### Task 9: Manual Verification

**Step 1: Start the app**

Run: `npm run electron:dev`

**Step 2: Verify GDrive sync still works**

1. Connect to Google Drive
2. Add a subscription folder
3. Press "Quét ngay" — verify scan completes without errors
4. Check console for `[ApiRateLimiter]` and `[SyncThrottleController]` log messages

**Step 3: Verify throttle info in snapshot**

Open DevTools, run in console:
```js
// Check if throttleInfo is present in state
```
Verify `throttleInfo.currentConcurrency` starts at 1 and increases after successes.

**Step 4: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix(gdrive): post-integration fixups for rate limiting"
```

---

## Verification Summary

| Check | Command | Expected |
|---|---|---|
| Unit tests — ApiRateLimiter | `npx vitest run electron/lib/gdrive/__tests__/apiRateLimiter.test.js` | PASS |
| Unit tests — SyncThrottleController | `npx vitest run electron/lib/gdrive/__tests__/syncThrottleController.test.js` | PASS |
| Integration tests | `npx vitest run electron/lib/gdrive/__tests__/rateLimitIntegration.test.js` | PASS |
| App starts | `npm run electron:dev` | No crash |
| Manual scan | Press "Quét ngay" with 10+ files | Completes, console shows rate limiter activity |
