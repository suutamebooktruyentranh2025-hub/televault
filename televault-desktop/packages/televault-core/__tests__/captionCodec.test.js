const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createVaultEntry,
  dirMarker,
  entryName,
  entryParent,
  encodeCaption,
  decodeCaption,
} = require('../src');

describe('captionCodec', () => {
  const file = createVaultEntry({
    messageId: 100,
    path: '/Truyện/One Piece/tập-01.pdf',
    size: 245891072,
    sha256: 'a3f8b1',
    mtime: new Date(Date.UTC(2026, 6, 3, 10, 15)),
    tags: ['manga', 'đã đọc'],
  });

  it('encode/decode file roundtrip', () => {
    const caption = encodeCaption(file);
    const back = decodeCaption(100, caption);
    assert.ok(back);
    assert.equal(back.path, file.path);
    assert.equal(back.size, file.size);
    assert.equal(back.sha256, file.sha256);
    assert.equal(back.mtime.toISOString(), file.mtime.toISOString());
    assert.deepEqual(back.tags, []);
    assert.equal(back.path.endsWith('/'), false);
    assert.equal(back.messageId, 100);
  });

  it('encode/decode dir marker with tags roundtrip', () => {
    const dir = dirMarker({ messageId: 5, path: '/Trống/', tags: ['work'] });
    const back = decodeCaption(5, encodeCaption(dir));
    assert.ok(back);
    assert.equal(back.path.endsWith('/'), true);
    assert.equal(back.path, '/Trống/');
    assert.deepEqual(back.tags, ['work']);
  });

  it('entry name and parent', () => {
    assert.equal(entryName(file), 'tập-01.pdf');
    assert.equal(entryParent(file), '/Truyện/One Piece/');
    assert.equal(entryName(dirMarker({ messageId: 1, path: '/a/b/' })), 'b');
    assert.equal(entryParent(dirMarker({ messageId: 1, path: '/a/b/' })), '/a/');
  });

  it('decode garbage returns null', () => {
    assert.equal(decodeCaption(1, 'hello world'), null);
    assert.equal(decodeCaption(1, '{"v":99,"path":"/x"}'), null);
    assert.equal(decodeCaption(1, '{"v":1}'), null);
    assert.equal(decodeCaption(1, '{"v":1,"path":"no-slash"}'), null);
    assert.equal(decodeCaption(1, ''), null);
    assert.equal(decodeCaption(1, '{"v":1'), null);
    assert.equal(decodeCaption(1, '{"v":1,"path":"/a.txt","mtime":123}'), null);
  });

  it('decode wrong-typed optional fields falls back to defaults', () => {
    const e = decodeCaption(
      1,
      '{"v":1,"path":"/a.txt","size":"10","sha256":true,"mtime":"2026-01-01T00:00:00Z"}',
    );
    assert.ok(e);
    assert.equal(e.size, 0);
    assert.equal(e.sha256, '');
  });
});
