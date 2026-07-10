const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

function tempDbPath() {
  return path.join(os.tmpdir(), `televault-sync-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test('syncConfig get/set round-trips', () => {
  const dbPath = tempDbPath();
  const { openIndexDb } = require('../indexDb');
  const db = openIndexDb(dbPath);
  try {
    assert.deepEqual(db.getSyncConfig(), {
      syncFolder: null,
      syncMode: 'upload-only',
      syncEnabled: false,
      syncVaultFolder: '/Sync/',
    });
    db.setSyncConfig({
      syncFolder: '/Users/test/Documents',
      syncMode: 'two-way',
      syncEnabled: true,
      syncVaultFolder: '/Backup/',
    });
    const config = db.getSyncConfig();
    assert.equal(config.syncFolder, '/Users/test/Documents');
    assert.equal(config.syncMode, 'two-way');
    assert.equal(config.syncEnabled, true);
    assert.equal(config.syncVaultFolder, '/Backup/');
  } finally {
    db.close();
    fs.unlinkSync(dbPath);
  }
});

test('syncManifest upsert/get/delete', () => {
  const dbPath = tempDbPath();
  const { openIndexDb } = require('../indexDb');
  const db = openIndexDb(dbPath);
  try {
    db.syncManifestUpsert('docs/readme.md', { sha256: 'abc123', mtime: '2026-07-06T00:00:00Z', side: 'both' });
    const entry = db.syncManifestGet('docs/readme.md');
    assert.equal(entry.relPath, 'docs/readme.md');
    assert.equal(entry.sha256, 'abc123');
    assert.equal(entry.side, 'both');

    db.syncManifestDelete('docs/readme.md');
    assert.equal(db.syncManifestGet('docs/readme.md'), null);
  } finally {
    db.close();
    fs.unlinkSync(dbPath);
  }
});

test('syncManifestAll returns all entries', () => {
  const dbPath = tempDbPath();
  const { openIndexDb } = require('../indexDb');
  const db = openIndexDb(dbPath);
  try {
    db.syncManifestUpsert('a.txt', { sha256: 'aaa', mtime: '2026-07-06T00:00:00Z', side: 'local' });
    db.syncManifestUpsert('b.txt', { sha256: 'bbb', mtime: '2026-07-06T00:00:00Z', side: 'remote' });
    assert.equal(db.syncManifestAll().length, 2);
  } finally {
    db.close();
    fs.unlinkSync(dbPath);
  }
});

test('syncManifestClear removes all entries', () => {
  const dbPath = tempDbPath();
  const { openIndexDb } = require('../indexDb');
  const db = openIndexDb(dbPath);
  try {
    db.syncManifestUpsert('a.txt', { sha256: 'aaa', mtime: '2026-07-06T00:00:00Z', side: 'local' });
    db.syncManifestClear();
    assert.equal(db.syncManifestAll().length, 0);
  } finally {
    db.close();
    fs.unlinkSync(dbPath);
  }
});

if (process.versions.electron) {
  setTimeout(() => {
    require('electron').app.quit();
  }, 500);
}
