import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/models/vault_tree.dart';

VaultEntry f(int id, String path) => VaultEntry(
      messageId: id, path: path, size: 1, sha256: 'h',
      mtime: DateTime.utc(2026), tags: const [],
    );

void main() {
  final entries = [
    f(1, '/a.txt'),
    f(2, '/Truyện/One Piece/tập-01.pdf'),
    f(3, '/Truyện/One Piece/tập-02.pdf'),
    f(4, '/Truyện/Naruto/tập-01.pdf'),
    VaultEntry.dirMarker(messageId: 5, path: '/Trống/'),
  ];

  test('list root', () {
    final r = listFolder(entries, '/');
    expect(r.folders, ['Truyện', 'Trống']);
    expect(r.files.map((e) => e.name), ['a.txt']);
  });

  test('list nested folder', () {
    final r = listFolder(entries, '/Truyện/');
    expect(r.folders, ['Naruto', 'One Piece']);
    expect(r.files, isEmpty);
  });

  test('folders sorted, files sorted by name', () {
    final r = listFolder(entries, '/Truyện/One Piece/');
    expect(r.files.map((e) => e.name), ['tập-01.pdf', 'tập-02.pdf']);
  });

  test('empty-dir marker shows as folder but not as file', () {
    final r = listFolder(entries, '/Trống/');
    expect(r.folders, isEmpty);
    expect(r.files, isEmpty);
  });

  test('hides Rác from My Drive root listing', () {
    final withTrash = [
      ...entries,
      VaultEntry.dirMarker(messageId: 99, path: '/Rác/'),
      f(100, '/Rác/deleted.txt'),
    ];
    final r = listFolder(withTrash, '/');
    expect(r.folders, isNot(contains('Rác')));
  });

  test('list trash shows direct folders and files only', () {
    final trashEntries = [
      VaultEntry.dirMarker(messageId: 99, path: '/Rác/'),
      f(10, '/Rác/docs/a.txt'),
      f(11, '/Rác/b.pdf'),
      VaultEntry.dirMarker(messageId: 12, path: '/Rác/docs/'),
    ];
    final r = listFolder(trashEntries, '/Rác/');
    expect(r.folders, ['docs']);
    expect(r.files.map((e) => e.path), ['/Rác/b.pdf']);
  });

  test('sort files by size descending', () {
    final entries = [
      VaultEntry(messageId: 1, path: '/a.txt', size: 10, sha256: 'h', mtime: DateTime.utc(2026, 1, 1)),
      VaultEntry(messageId: 2, path: '/b.txt', size: 100, sha256: 'h', mtime: DateTime.utc(2026, 1, 2)),
      VaultEntry(messageId: 3, path: '/c.txt', size: 1, sha256: 'h', mtime: DateTime.utc(2026, 1, 3)),
    ];
    final base = listFolder(entries, '/');
    final sorted = sortFolderListing(
      base,
      entries,
      '/',
      field: VaultSortField.size,
      direction: SortDirection.descending,
    );
    expect(sorted.files.map((e) => e.name), ['b.txt', 'a.txt', 'c.txt']);
  });

  test('sort files by mtime ascending', () {
    final entries = [
      VaultEntry(messageId: 1, path: '/a.txt', size: 1, sha256: 'h', mtime: DateTime.utc(2026, 3, 1)),
      VaultEntry(messageId: 2, path: '/b.txt', size: 1, sha256: 'h', mtime: DateTime.utc(2026, 1, 1)),
    ];
    final base = listFolder(entries, '/');
    final sorted = sortFolderListing(
      base,
      entries,
      '/',
      field: VaultSortField.mtime,
      direction: SortDirection.ascending,
    );
    expect(sorted.files.map((e) => e.name), ['b.txt', 'a.txt']);
  });

  test('buildVisibleTreeRows respects expanded set', () {
    final collapsed = buildVisibleTreeRows(entries, {});
    expect(collapsed.whereType<VaultTreeFolderRow>().map((r) => r.name), ['Truyện', 'Trống']);
    expect(collapsed.whereType<VaultTreeFileRow>().length, 1);

    final expandedTruyen = buildVisibleTreeRows(entries, {'/Truyện/'});
    expect(
      expandedTruyen.whereType<VaultTreeFolderRow>().where((r) => r.depth == 1).map((r) => r.name),
      ['Naruto', 'One Piece'],
    );
    expect(expandedTruyen.whereType<VaultTreeFileRow>().length, 1);

    final fullyExpanded = buildVisibleTreeRows(entries, {
      '/Truyện/',
      '/Truyện/One Piece/',
      '/Truyện/Naruto/',
    });
    expect(fullyExpanded.whereType<VaultTreeFileRow>().length, 4);
  });

  test('folderMtime uses latest nested file upload', () {
    final entries = [
      VaultEntry.dirMarker(messageId: 1, path: '/docs/'),
      VaultEntry(messageId: 2, path: '/docs/old.txt', size: 1, sha256: 'h', mtime: DateTime.utc(2026, 2, 1)),
      VaultEntry(messageId: 3, path: '/docs/sub/new.txt', size: 1, sha256: 'h', mtime: DateTime.utc(2026, 6, 15)),
    ];
    expect(folderMtime(entries, '/docs/'), DateTime.utc(2026, 6, 15));
    expect(folderSize(entries, '/docs/'), 2);
  });
}
