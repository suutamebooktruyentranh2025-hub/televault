const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFolderTags } = require('../src/folderTags');

describe('normalizeFolderTags', () => {
  it('trims, dedupes, drops empty', () => {
    assert.deepEqual(normalizeFolderTags([' manga ', 'manga', '', 'cbz']), ['manga', 'cbz']);
  });

  it('rejects comma in tag', () => {
    assert.throws(() => normalizeFolderTags(['a,b']), /comma/i);
  });

  it('rejects tag over 50 chars', () => {
    assert.throws(() => normalizeFolderTags(['x'.repeat(51)]), /too long/i);
  });
});
