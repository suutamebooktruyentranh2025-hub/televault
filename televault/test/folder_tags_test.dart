import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/utils/folder_tags.dart';

VaultEntry f(int id, String path) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: 'h', mtime: DateTime.utc(2026));

void main() {
  test('ancestorFolderPaths walks up but excludes root', () {
    expect(ancestorFolderPaths('/a/b/c.txt').toList(), ['/a/b/', '/a/']);
  });

  test('effectiveTagsForPath merges tags from all ancestors', () {
    final index = {
      '/Truyện/': ['manga'],
      '/Truyện/One Piece/': ['đã đọc'],
    };
    expect(
      effectiveTagsForPath('/Truyện/One Piece/tập-01.pdf', index),
      ['manga', 'đã đọc'],
    );
  });

  test('normalizeFolderTags trims dedupes and validates', () {
    expect(normalizeFolderTags([' manga ', 'manga', '', 'cbz']), ['manga', 'cbz']);
    expect(() => normalizeFolderTags(['a,b']), throwsArgumentError);
    expect(() => normalizeFolderTags(['x' * 51]), throwsArgumentError);
  });

  test('effectiveTagsForEntry uses folder tags for dir marker', () {
    final index = {'/x/': ['work']};
    final dir = VaultEntry.dirMarker(messageId: 1, path: '/x/', tags: ['work']);
    expect(effectiveTagsForEntry(dir, index), ['work']);
  });
}
