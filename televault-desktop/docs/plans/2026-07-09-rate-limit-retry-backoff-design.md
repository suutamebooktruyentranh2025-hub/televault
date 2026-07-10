# Rate Limit + Retry + Backoff Design for GDrive Sync Pipeline

## Goal

Thiết kế cơ chế rate limit, adaptive concurrency, retry với exponential backoff cho toàn bộ pipeline GDrive → Telegram sync. Hệ thống phải xử lý được 10,000+ files mà không bị Google/Telegram throttle, tự điều chỉnh tốc độ, và cung cấp trải nghiệm ổn định cho người dùng.

## Approach: Centralized Rate Gate

Tạo 2 module mới riêng biệt, inject vào các service hiện có:
1. **`ApiRateLimiter`** — token bucket cho Google Drive API
2. **`SyncThrottleController`** — adaptive concurrency + retry logic cho queue worker

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  gdriveSyncService                   │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │   scanNow()  │    │    _startQueueWorker()    │  │
│  │  _runPoll()  │    │  N concurrent workers     │  │
│  └──────┬───────┘    │  (adaptive: 1→3)          │  │
│         │            └─────────┬─────────────────┘  │
│         │                      │                     │
│         ▼                      ▼                     │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │ gdriveApi.js │    │ SyncThrottleController    │  │
│  │              │    │ • getConcurrency()         │  │
│  │  _get()      │    │ • reportSuccess/Error()    │  │
│  │  _download() │    │ • shouldRetry()            │  │
│  └──────┬───────┘    └───────────────────────────┘  │
│         │                                            │
│         ▼                                            │
│  ┌──────────────┐                                    │
│  │ApiRateLimiter│                                    │
│  │ Token Bucket │                                    │
│  │ 8 req/s      │                                    │
│  │ handle 429   │                                    │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

## Component 1: ApiRateLimiter (Token Bucket)

### File: `electron/lib/gdrive/apiRateLimiter.js` [NEW]

**Algorithm:** Token bucket — mỗi giây thêm N tokens (default 8 req/s, Google Drive quota ~10 req/s/user).

**API:**
```js
class ApiRateLimiter {
  constructor({ tokensPerSecond = 8, maxBurst = 12 })
  async acquire()              // wait for token, returns when OK
  reportSuccess()              // increase rate gradually
  reportThrottle(retryAfterMs) // pause + backoff
  isThrottled()                // true if currently in backoff
  getStats()                   // { calls, throttled, avgWait }
}
```

**Behavior:**
- Trước mỗi API call: `await limiter.acquire()` — block cho đến khi có token
- Khi nhận HTTP 429 hoặc `rateLimitExceeded`:
  - Parse `Retry-After` header nếu có
  - Nếu không có: exponential backoff 1s → 2s → 4s → 8s → 16s (cap 60s)
  - Tạm pause toàn bộ bucket trong thời gian backoff
- Khi nhận HTTP 403 `userRateLimitExceeded`: giảm token rate 50%, tự phục hồi dần sau 60s
- Sau mỗi request thành công: `reportSuccess()` — dần phục hồi rate nếu đang bị giảm

## Component 2: SyncThrottleController (Adaptive Concurrency + Retry)

### File: `electron/lib/gdrive/syncThrottleController.js` [NEW]

**API:**
```js
class SyncThrottleController {
  constructor({ minConcurrency = 1, maxConcurrency = 3, scaleUpAfter = 5, cooldownMs = 30000 })
  getConcurrency()               // current target concurrency
  reportSuccess()                // maybe scale up after N successes
  reportError(type)              // 'throttle' | 'timeout' | 'network' | 'permanent'
  shouldRetry(attempt, errorType) // returns { retry: boolean, delayMs: number }
  getStats()                     // { concurrency, successStreak, throttleCount }
}
```

**Adaptive Concurrency:**
- Khởi đầu: concurrency = 1 (an toàn)
- Scale up: Sau mỗi 5 file thành công liên tiếp → tăng +1 (tối đa 3)
- Scale down: Khi gặp throttle/timeout → giảm về 1 ngay lập tức + cooldown 30s
- Cooldown: Sau khi scale down, không cho phép scale up trong 30s

**Per-file Retry:**
- Tối đa 3 lần retry per file
- Backoff: 2s → 4s → 8s (2^attempt * 2s)
- Phân biệt retriable vs permanent errors

## Error Classification

| Error Type | Ví dụ | Retriable? | Backoff |
|---|---|---|---|
| `throttle` | HTTP 429, FloodWait, `rateLimitExceeded` | ✅ | Theo `Retry-After` hoặc 2^attempt × 2s |
| `timeout` | Request timeout, download timeout | ✅ | 2^attempt × 2s |
| `network` | ECONNRESET, ENOTFOUND, socket hang up | ✅ | 2^attempt × 2s |
| `permanent` | 404, 403 (not rate limit), file trashed | ❌ | Thẳng vào `gdrive_sync_errors` |

## Integration Changes

### MODIFY: `electron/lib/gdrive/gdriveApi.js`

- Inject `ApiRateLimiter` vào constructor
- `_get()`: thêm `await this.rateLimiter.acquire()` trước mỗi request
- `_get()`: thêm catch block cho HTTP 429 → `rateLimiter.reportThrottle()` → retry
- `_downloadStream()`: handle HTTP 429 response → reportThrottle
- Thêm parsing `Retry-After` header trong response handler

### MODIFY: `electron/lib/gdrive/gdriveSyncService.js`

- Inject `SyncThrottleController` vào constructor
- Refactor `_startQueueWorker()`:
  - Thay vì 1 while(true) loop → spawn N async workers (N = controller.getConcurrency())
  - Workers tự điều chỉnh: khi concurrency thay đổi, spawn thêm hoặc thu hồi worker
- `_syncFile()` thêm retry wrapper:
  - Loop attempt 1..3
  - Classify error → controller.shouldRetry() → retry hoặc → gdrive_sync_errors
- Thêm throttle info vào `getSnapshot()`:
  ```js
  throttleInfo: {
    currentConcurrency: controller.getConcurrency(),
    isThrottled: rateLimiter.isThrottled(),
    apiCallsTotal: rateLimiter.getStats().calls,
    throttledCount: rateLimiter.getStats().throttled,
    successStreak: controller.getStats().successStreak,
  }
  ```

### MODIFY: DB Schema — `gdrive_sync_queue`

Thêm column `retry_count INTEGER DEFAULT 0` để track retry count, giúp resume sau restart.

### Telegram Side

`TransferQueue` hiện tại đã có `maxConcurrent` + `baseBackoffMs` + `maxAttempts`. Khi Telegram trả FloodWait → `SyncThrottleController.reportError('throttle')` → giảm concurrency toàn pipeline.

## File Layout

```
electron/lib/gdrive/
├── gdriveApi.js               (MODIFY — inject rateLimiter, handle 429)
├── gdriveAuth.js              (unchanged)
├── gdriveSyncService.js       (MODIFY — inject throttleController, refactor worker)
├── apiRateLimiter.js          (NEW — token bucket)
└── syncThrottleController.js  (NEW — adaptive concurrency + retry logic)
```

## Testing Strategy

### Unit Tests
- `apiRateLimiter.js`: acquire() timing, reportThrottle() backoff, recovery after cooldown
- `syncThrottleController.js`: scale up/down logic, shouldRetry() classification, cooldown enforcement

### Integration Tests
- Simulate 429 responses → verify limiter pauses and retries
- Simulate consecutive failures → verify concurrency drops to 1
- Simulate consecutive successes → verify concurrency scales up

### Manual Testing
1. Sync 100+ files → verify adaptive concurrency log output
2. Disconnect network mid-sync → verify retry + backoff behavior
3. Kiểm tra `getSnapshot().throttleInfo` hiển thị đúng trên UI
