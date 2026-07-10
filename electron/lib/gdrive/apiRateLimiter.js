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
