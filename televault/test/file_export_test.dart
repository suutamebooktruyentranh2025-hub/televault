import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/file_export.dart';

VaultEntry f(int id, String path) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: 'h', mtime: DateTime.utc(2026));

void main() {
  test('uniqueDestPath avoids overwrite', () {
    final dir = Directory.systemTemp.createTempSync('televault_export_');
    addTearDown(() => dir.deleteSync(recursive: true));
    File(p.join(dir.path, 'a.txt')).writeAsStringSync('x');
    expect(uniqueDestPath(dir.path, 'a.txt'), p.join(dir.path, 'a (1).txt'));
    expect(uniqueDestPath(dir.path, 'b.txt'), p.join(dir.path, 'b.txt'));
  });

  group('filesInVaultFolder', () {
    test('lists files under prefix excluding dir markers', () {
      final all = [
        f(1, '/Truyện/One Piece/a.cbz'),
        f(2, '/Truyện/One Piece/sub/b.cbz'),
        VaultEntry.dirMarker(messageId: 3, path: '/Truyện/One Piece/sub/'),
        f(4, '/Truyện/Naruto/x.cbz'),
      ];
      final files = filesInVaultFolder(all, '/Truyện/One Piece/');
      expect(files.map((e) => e.messageId), [1, 2]);
    });

    test('folderExportName uses last segment', () {
      expect(folderExportName('/Truyện/One Piece/'), 'One Piece');
      expect(folderExportName('/'), 'Kho');
    });
  });
}
