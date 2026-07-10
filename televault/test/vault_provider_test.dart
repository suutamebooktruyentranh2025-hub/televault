import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/models/vault_tree.dart';
import 'package:televault/providers/vault_provider.dart';
import 'package:televault/services/index_db.dart';

import 'helpers/test_db.dart';

void main() {
  late IndexDb db;
  late VaultProvider p;
  late String dbPath;

  setUp(() async {
    sqfliteFfiInit();
    dbPath = nextTestDbPath();
    db = await IndexDb.open(databaseFactoryFfi, dbPath);
    await db.upsert(VaultEntry(messageId: 1, path: '/docs/a.pdf', size: 1,
        sha256: 'h', mtime: DateTime.utc(2026)));
    await db.upsert(VaultEntry(messageId: 2, path: '/b.txt', size: 1,
        sha256: 'h2', mtime: DateTime.utc(2026)));
    p = VaultProvider(db);
    await p.refresh();
  });

  tearDown(() async {
    await db.close();
    await deleteTestDb(dbPath);
  });

  test('starts at root with folders and files', () {
    expect(p.currentFolder, '/');
    expect(p.listing.folders, ['docs']);
    expect(p.listing.files.single.name, 'b.txt');
  });

  test('openFolder navigates down, goUp navigates up', () async {
    await p.openFolder('docs');
    expect(p.currentFolder, '/docs/');
    expect(p.listing.files.single.name, 'a.pdf');
    await p.goUp();
    expect(p.currentFolder, '/');
  });

  test('breadcrumbs derived from currentFolder', () async {
    await p.openFolder('docs');
    expect(p.breadcrumbs, ['/', 'docs']);
  });

  test('goTo jumps directly to folder path', () async {
    await p.goTo('/docs/');
    expect(p.currentFolder, '/docs/');
    expect(p.listing.files.single.name, 'a.pdf');
  });

  test('toggleFolderExpanded shows nested files in treeRows', () async {
    expect(p.treeRows.whereType<VaultTreeFileRow>().length, 1);
    p.toggleFolderExpanded('/docs/');
    final names = p.treeRows.whereType<VaultTreeFileRow>().map((r) => r.entry.name).toList();
    expect(names.length, 2);
    expect(names, contains('a.pdf'));
  });
}
