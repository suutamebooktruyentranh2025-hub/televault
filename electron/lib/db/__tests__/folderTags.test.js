const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { openIndexDb } = require('../indexDb');
const { dirMarker } = require('@televault/core');

function tempDbPath() {
  return path.join(os.tmpdir(), `televault-tags-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test('foldersByTag lists folders from dir marker file_tags when folder_tags empty', () => {
  const dbPath = tempDbPath();
  const db = openIndexDb(dbPath);
  try {
    db.upsert(dirMarker({ messageId: 10, path: '/Xì Trum (CBZ)/', tags: ['Thiếu Nhi'] }));
    db.upsert(dirMarker({ messageId: 11, path: '/Tiết Nhơn Quý Chinh Đông (CBZ)/', tags: ['Truyện xưa'] }));

    const rows = db.folderTagsIndex();
    assert.deepEqual(rows['/Xì Trum (CBZ)/'], ['Thiếu Nhi']);

    const byTag = db.foldersByTag();
    assert.deepEqual(byTag['Thiếu Nhi'], ['/Xì Trum (CBZ)/']);
    assert.deepEqual(byTag['Truyện xưa'], ['/Tiết Nhơn Quý Chinh Đông (CBZ)/']);
    assert.deepEqual(db.allTagNames(), ['Thiếu Nhi', 'Truyện xưa']);
  } finally {
    db.close();
    fs.unlinkSync(dbPath);
  }
});

test('reconcileFolderTagsFromMarkers backfills folder_tags from marker tags', () => {
  const dbPath = tempDbPath();
  const db = openIndexDb(dbPath);
  try {
    db.upsert(dirMarker({ messageId: 20, path: '/docs/', tags: ['work'] }));
    const raw = new Database(dbPath);
    raw.prepare('DELETE FROM folder_tags WHERE folder_path = ?').run('/docs/');
    raw.close();

    assert.deepEqual(db.folderTagsIndex()['/docs/'], undefined);

    db.reconcileFolderTagsFromMarkers();

    assert.deepEqual(db.folderTagsIndex()['/docs/'], ['work']);
    assert.deepEqual(db.foldersByTag().work, ['/docs/']);
  } finally {
    db.close();
    fs.unlinkSync(dbPath);
  }
});
