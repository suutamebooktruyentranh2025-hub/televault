const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry, dirMarker, listAllFolders, isInvalidMoveDestination } = require('../src');

function f(id, path) {
  return createVaultEntry({
    messageId: id,
    path,
    size: 1,
    sha256: 'h',
    mtime: new Date(Date.UTC(2026)),
  });
}

describe('moveTargets', () => {
  const entries = [
    f(1, '/Docs/a.txt'),
    f(2, '/Docs/Novels/one.txt'),
    dirMarker({ messageId: 3, path: '/Empty/' }),
    dirMarker({ messageId: 4, path: '/Rác/' }),
    f(5, '/Rác/deleted.txt'),
  ];

  it('lists all visible folders excluding trash', () => {
    assert.deepEqual(listAllFolders(entries), ['/Docs/', '/Docs/Novels/', '/Empty/']);
  });

  it('rejects move targets that are current, same folder, or descendants', () => {
    assert.equal(isInvalidMoveDestination('/Docs/', '/Docs/', []), true);
    assert.equal(isInvalidMoveDestination('/Docs/Novels/', '/Docs/', ['/Docs/Novels/']), true);
    assert.equal(isInvalidMoveDestination('/Docs/Novels/Sub/', '/Docs/', ['/Docs/Novels/']), true);
    assert.equal(isInvalidMoveDestination('/Empty/', '/Docs/', ['/Docs/Novels/']), false);
  });
});
