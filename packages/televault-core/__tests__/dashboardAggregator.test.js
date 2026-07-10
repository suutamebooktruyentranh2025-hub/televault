const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry, dirMarker, buildDashboardStats } = require('../src');

function f(id, path, size, mtime) {
  return createVaultEntry({
    messageId: id,
    path,
    size,
    sha256: 'h',
    mtime: new Date(mtime),
  });
}

describe('buildDashboardStats', () => {
  it('totals exclude trash and dir markers', () => {
    const entries = [
      f(1, '/a.txt', 100, '2026-07-01T10:00:00Z'),
      f(2, '/docs/b.pdf', 900, '2026-07-02T10:00:00Z'),
      f(3, '/Rác/deleted.txt', 5000, '2026-07-03T10:00:00Z'),
      dirMarker({ messageId: 4, path: '/docs/' }),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 30, today: new Date('2026-07-04T12:00:00Z') });
    assert.equal(stats.totalFiles, 2);
    assert.equal(stats.totalBytes, 1000);
  });

  it('top folders aggregate nested bytes', () => {
    const entries = [
      f(1, '/big/x.txt', 100, '2026-07-01T10:00:00Z'),
      f(2, '/big/sub/y.txt', 400, '2026-07-01T11:00:00Z'),
      f(3, '/small.txt', 50, '2026-07-01T12:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    assert.equal(stats.topFolders[0].path, '/big/');
    assert.equal(stats.topFolders[0].bytes, 500);
    assert.equal(stats.topFolders[0].fileCount, 2);
  });

  it('top files sorted by size desc', () => {
    const entries = [
      f(1, '/a.txt', 10, '2026-07-01T10:00:00Z'),
      f(2, '/b.txt', 100, '2026-07-01T10:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, { rangeDays: 7, today: new Date('2026-07-04T12:00:00Z') });
    assert.deepEqual(stats.topFiles.map((x) => x.messageId), [2, 1]);
  });

  it('uploadsPerDay buckets by date and zero-fills range', () => {
    const entries = [
      f(1, '/a.txt', 100, '2026-07-03T12:00:00Z'),
      f(2, '/b.txt', 200, '2026-07-04T12:00:00Z'),
    ];
    const stats = buildDashboardStats(entries, {
      rangeDays: 3,
      today: new Date('2026-07-04T12:00:00Z'),
      timeZone: 'UTC',
    });
    assert.equal(stats.uploadsPerDay.length, 3);
    const last = stats.uploadsPerDay.at(-1);
    assert.equal(last.date, '2026-07-04');
    assert.equal(last.fileCount, 1);
    assert.equal(last.bytes, 200);
    assert.equal(stats.uploadsPerDay[0].fileCount, 0);
  });
});
