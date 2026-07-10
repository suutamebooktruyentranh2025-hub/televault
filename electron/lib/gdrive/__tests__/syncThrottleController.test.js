const test = require('node:test');
const assert = require('node:assert/strict');
const { SyncThrottleController } = require('../syncThrottleController');

test('starts at minConcurrency', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3 });
  assert.equal(c.getConcurrency(), 1);
});

test('scales up after N consecutive successes', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 3 });
  c.reportSuccess();
  c.reportSuccess();
  assert.equal(c.getConcurrency(), 1);
  c.reportSuccess();
  assert.equal(c.getConcurrency(), 2);
});

test('does not scale beyond maxConcurrency', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 2, scaleUpAfter: 2 });
  for (let i = 0; i < 10; i++) c.reportSuccess();
  assert.equal(c.getConcurrency(), 2);
});

test('scales down to min on throttle error', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 2 });
  c.reportSuccess();
  c.reportSuccess(); // scale to 2
  assert.equal(c.getConcurrency(), 2);
  c.reportError('throttle');
  assert.equal(c.getConcurrency(), 1);
});

test('scales down to min on timeout error', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 2 });
  c.reportSuccess();
  c.reportSuccess(); // scale to 2
  c.reportError('timeout');
  assert.equal(c.getConcurrency(), 1);
});

test('does not scale down on network or permanent error', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 2 });
  c.reportSuccess();
  c.reportSuccess(); // scale to 2
  c.reportError('network');
  assert.equal(c.getConcurrency(), 2);
  c.reportError('permanent');
  assert.equal(c.getConcurrency(), 2);
});

test('does not scale up during cooldown', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 2, cooldownMs: 60000 });
  c.reportError('throttle');
  c.reportSuccess();
  c.reportSuccess();
  assert.equal(c.getConcurrency(), 1); // cooldown active
});

test('shouldRetry returns true for retriable errors within max attempts', () => {
  const c = new SyncThrottleController({ maxRetries: 3 });
  assert.equal(c.shouldRetry(1, 'timeout').retry, true);
  assert.equal(c.shouldRetry(1, 'network').retry, true);
  assert.equal(c.shouldRetry(1, 'throttle').retry, true);
  assert.equal(c.shouldRetry(3, 'timeout').retry, true);
});

test('shouldRetry returns false for permanent errors', () => {
  const c = new SyncThrottleController();
  assert.equal(c.shouldRetry(1, 'permanent').retry, false);
});

test('shouldRetry returns false after max attempts', () => {
  const c = new SyncThrottleController({ maxRetries: 3 });
  assert.equal(c.shouldRetry(3, 'timeout').retry, true);
  assert.equal(c.shouldRetry(4, 'timeout').retry, false);
});

test('shouldRetry returns increasing delay', () => {
  const c = new SyncThrottleController({ baseRetryDelayMs: 1000 });
  const r1 = c.shouldRetry(1, 'timeout');
  const r2 = c.shouldRetry(2, 'timeout');
  const r3 = c.shouldRetry(3, 'timeout');
  assert.equal(r1.delayMs, 1000);
  assert.equal(r2.delayMs, 2000);
  assert.equal(r3.delayMs, 4000);
});

test('resets success streak on error', () => {
  const c = new SyncThrottleController({ minConcurrency: 1, maxConcurrency: 3, scaleUpAfter: 3 });
  c.reportSuccess();
  c.reportSuccess();
  c.reportError('network'); // resets streak
  c.reportSuccess(); // only 1 success, not 3
  assert.equal(c.getConcurrency(), 1);
});

test('getStats returns correct shape', () => {
  const c = new SyncThrottleController();
  const stats = c.getStats();
  assert.equal(typeof stats.concurrency, 'number');
  assert.equal(typeof stats.successStreak, 'number');
  assert.equal(typeof stats.throttleCount, 'number');
});
