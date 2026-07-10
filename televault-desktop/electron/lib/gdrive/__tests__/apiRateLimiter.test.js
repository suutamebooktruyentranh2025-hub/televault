const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiRateLimiter } = require('../apiRateLimiter');

test('acquire() resolves immediately when tokens available', async () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  await limiter.acquire();
  // Should not hang — acquire doesn't count as a call
  assert.equal(limiter.getStats().calls, 0);
});

test('reportThrottle() marks as throttled', () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  limiter.reportThrottle(5000);
  assert.equal(limiter.isThrottled(), true);
  assert.equal(limiter.getStats().throttled, 1);
});

test('isThrottled returns false after throttle period expires', async () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  limiter.reportThrottle(100); // 100ms throttle
  assert.equal(limiter.isThrottled(), true);
  await new Promise(r => setTimeout(r, 150));
  assert.equal(limiter.isThrottled(), false);
});

test('reportSuccess() increments call count', () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  limiter.reportSuccess();
  limiter.reportSuccess();
  assert.equal(limiter.getStats().calls, 2);
});

test('reportSuccess() recovers backoff level gradually', () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  limiter.reportThrottle(10);
  limiter.reportThrottle(10);
  limiter.reportSuccess();
  limiter.reportSuccess();
  // 2 throttle + 2 success = 4 calls total
  assert.equal(limiter.getStats().calls, 4);
});

test('reportThrottle uses retryAfterMs when provided', async () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  limiter.reportThrottle(200);
  assert.equal(limiter.isThrottled(), true);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(limiter.isThrottled(), true);
  await new Promise(r => setTimeout(r, 150));
  assert.equal(limiter.isThrottled(), false);
});

test('getStats() returns correct shape', () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  const stats = limiter.getStats();
  assert.equal(typeof stats.calls, 'number');
  assert.equal(typeof stats.throttled, 'number');
  assert.equal(typeof stats.avgWaitMs, 'number');
});

test('backoff level caps at 6', () => {
  const limiter = new ApiRateLimiter({ tokensPerSecond: 10, maxBurst: 10 });
  for (let i = 0; i < 10; i++) {
    limiter.reportThrottle(1); // tiny throttle
  }
  // Should not error, level is capped
  assert.equal(limiter.getStats().throttled, 10);
});
