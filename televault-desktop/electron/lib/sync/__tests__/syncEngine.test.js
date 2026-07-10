const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSyncActions } = require('../syncEngine');

test('new local file → upload action', () => {
  const actions = computeSyncActions({
    localFiles: [{ relPath: 'new.txt', sha256: 'aaa', mtime: '2026-07-06' }],
    remoteFiles: [],
    manifest: [],
    mode: 'upload-only',
  });
  assert.deepEqual(actions, [{ action: 'upload', relPath: 'new.txt', sha256: 'aaa' }]);
});

test('new remote file in two-way → download action', () => {
  const actions = computeSyncActions({
    localFiles: [],
    remoteFiles: [{ relPath: 'remote.txt', sha256: 'bbb', messageId: 42 }],
    manifest: [],
    mode: 'two-way',
  });
  assert.deepEqual(actions, [{ action: 'download', relPath: 'remote.txt', sha256: 'bbb', messageId: 42 }]);
});

test('new remote file in upload-only → no action', () => {
  const actions = computeSyncActions({
    localFiles: [],
    remoteFiles: [{ relPath: 'remote.txt', sha256: 'bbb', messageId: 42 }],
    manifest: [],
    mode: 'upload-only',
  });
  assert.deepEqual(actions, []);
});

test('local changed, remote unchanged → upload', () => {
  const actions = computeSyncActions({
    localFiles: [{ relPath: 'f.txt', sha256: 'new-sha', mtime: '2026-07-06' }],
    remoteFiles: [{ relPath: 'f.txt', sha256: 'old-sha', messageId: 10 }],
    manifest: [{ relPath: 'f.txt', sha256: 'old-sha', side: 'both' }],
    mode: 'two-way',
  });
  assert.deepEqual(actions, [{ action: 'upload', relPath: 'f.txt', sha256: 'new-sha' }]);
});

test('remote changed, local unchanged in two-way → download', () => {
  const actions = computeSyncActions({
    localFiles: [{ relPath: 'f.txt', sha256: 'old-sha', mtime: '2026-07-06' }],
    remoteFiles: [{ relPath: 'f.txt', sha256: 'new-sha', messageId: 10 }],
    manifest: [{ relPath: 'f.txt', sha256: 'old-sha', side: 'both' }],
    mode: 'two-way',
  });
  assert.deepEqual(actions, [{ action: 'download', relPath: 'f.txt', sha256: 'new-sha', messageId: 10 }]);
});

test('both changed → conflict', () => {
  const actions = computeSyncActions({
    localFiles: [{ relPath: 'f.txt', sha256: 'local-sha', mtime: '2026-07-06' }],
    remoteFiles: [{ relPath: 'f.txt', sha256: 'remote-sha', messageId: 10 }],
    manifest: [{ relPath: 'f.txt', sha256: 'old-sha', side: 'both' }],
    mode: 'two-way',
  });
  assert.deepEqual(actions, [{
    action: 'conflict',
    relPath: 'f.txt',
    localSha: 'local-sha',
    remoteSha: 'remote-sha',
    messageId: 10,
  }]);
});

test('local deleted, was in manifest → delete-remote', () => {
  const actions = computeSyncActions({
    localFiles: [],
    remoteFiles: [{ relPath: 'gone.txt', sha256: 'aaa', messageId: 5 }],
    manifest: [{ relPath: 'gone.txt', sha256: 'aaa', side: 'both' }],
    mode: 'two-way',
  });
  assert.deepEqual(actions, [{ action: 'delete-remote', relPath: 'gone.txt', messageId: 5 }]);
});

test('remote deleted in two-way, was in manifest → delete-local', () => {
  const actions = computeSyncActions({
    localFiles: [{ relPath: 'gone.txt', sha256: 'aaa', mtime: '2026-07-06' }],
    remoteFiles: [],
    manifest: [{ relPath: 'gone.txt', sha256: 'aaa', side: 'both' }],
    mode: 'two-way',
  });
  assert.deepEqual(actions, [{ action: 'delete-local', relPath: 'gone.txt' }]);
});

test('remote deleted in upload-only → no action (re-upload)', () => {
  const actions = computeSyncActions({
    localFiles: [{ relPath: 'still.txt', sha256: 'aaa', mtime: '2026-07-06' }],
    remoteFiles: [],
    manifest: [{ relPath: 'still.txt', sha256: 'aaa', side: 'both' }],
    mode: 'upload-only',
  });
  assert.deepEqual(actions, [{ action: 'upload', relPath: 'still.txt', sha256: 'aaa' }]);
});
