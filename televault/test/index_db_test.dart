import 'helpers/test_db.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/index_db.dart';
import 'package:televault/services/transfer_service.dart';
import 'package:televault/settings/app_settings.dart';

VaultEntry f(int id, String path, {List<String> tags = const [], String sha = 'h'}) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: sha, mtime: DateTime.utc(2026), tags: tags);

void main() {
  late IndexDb db;
  late String dbPath;

  setUp(() async {
    sqfliteFfiInit();
    dbPath = nextTestDbPath();
    db = await IndexDb.open(databaseFactoryFfi, dbPath);
  });

  tearDown(() async {
    await db.close();
    await deleteTestDb(dbPath);
  });

  test('upsert and getAll', () async {
    await db.upsert(VaultEntry.dirMarker(messageId: 1, path: '/x/', tags: ['t']));
    await db.upsert(f(2, '/b.txt'));
    final all = await db.getAll();
    expect(all.length, 2);
    expect(all.firstWhere((e) => e.messageId == 1).tags, ['t']);
  });

  test('upsert same messageId replaces', () async {
    await db.upsert(f(1, '/a.txt'));
    await db.upsert(f(1, '/renamed.txt'));
    final all = await db.getAll();
    expect(all.single.path, '/renamed.txt');
  });

  test('delete removes entry', () async {
    await db.upsert(f(1, '/a.txt'));
    await db.setFolderTags('/', ['x']);
    await db.delete(1);
    expect(await db.getAll(), isEmpty);
    expect((await db.folderTagsIndex())['/'], ['x']);
  });

  test('search by name matches path segments', () async {
    await db.upsert(f(1, '/Truyện/One Piece/tập-01.pdf'));
    await db.upsert(f(2, '/khác.txt'));
    final r = await db.search(query: 'one piece');
    expect(r.single.messageId, 1);
  });

  test('search matches Vietnamese without diacritics', () async {
    await db.upsert(f(1, '/Truyện/One Piece/tập-01.pdf'));
    await db.upsert(f(2, '/khác.txt'));
    expect((await db.search(query: 'truyen')).single.messageId, 1);
    expect((await db.search(query: 'tap')).single.messageId, 1);
    expect((await db.search(query: 'truyện')).single.messageId, 1);
  });

  test('search matches NFD path and inherited folder tags', () async {
    final dacNfd = 'd${String.fromCharCode(0x103)}${String.fromCharCode(0x301)}c';
    await db.upsert(f(1, '/Sách/$dacNfd Nhân Tâm.pdf'));
    await db.upsert(f(2, '/Sách/other.pdf'));
    await db.setFolderTags('/Sách/', ['Đắc nhân tâm']);
    expect((await db.search(query: 'Dac')).length, 2);
  });

  test('search filters by folder tags with AND', () async {
    await db.upsert(f(1, '/f1/a.pdf'));
    await db.setFolderTags('/f1/', ['manga', 'đã đọc']);
    await db.upsert(f(2, '/f2/b.pdf'));
    await db.setFolderTags('/f2/', ['manga']);
    final r = await db.search(tags: ['manga', 'đã đọc']);
    expect(r.single.messageId, 1);
  });

  test('allTags returns tag with file counts from folder tags', () async {
    await db.upsert(f(1, '/f1/a.pdf'));
    await db.setFolderTags('/f1/', ['manga']);
    await db.upsert(f(2, '/f2/b.pdf'));
    await db.setFolderTags('/f2/', ['manga', 'hay']);
    final tags = await db.allTags();
    expect(tags['manga'], 2);
    expect(tags['hay'], 1);
  });

  test('findBySha finds duplicate', () async {
    await db.upsert(f(1, '/a.pdf', sha: 'dup'));
    final hit = await db.findBySha('dup');
    expect(hit!.messageId, 1);
    expect(await db.findBySha('none'), isNull);
  });

  test('localPath set and cleared', () async {
    await db.upsert(f(1, '/a.pdf'));
    await db.setLocalPath(1, '/tmp/cache/a.pdf');
    expect((await db.getAll()).single.localPath, '/tmp/cache/a.pdf');
    await db.setLocalPath(1, null);
    expect((await db.getAll()).single.localPath, isNull);
  });

  test('touchLastUsed and getCached', () async {
    await db.upsert(f(1, '/a.pdf'));
    await db.setLocalPath(1, '/tmp/a.pdf');
    await db.touchLastUsed(1);
    final cached = await db.getCached();
    expect(cached.single.messageId, 1);
  });

  test('journal add, list, remove', () async {
    final id = await db.journalAdd('editCaption', {'messageId': 9, 'newPath': '/x'});
    final pending = await db.journalPending();
    expect(pending.single.op, 'editCaption');
    expect(pending.single.args['messageId'], 9);
    await db.journalRemove(id);
    expect(await db.journalPending(), isEmpty);
  });

  test('rekeyMessageId moves dir marker row and tags to new message id', () async {
    await db.upsert(VaultEntry.dirMarker(messageId: -100, path: '/a/', tags: ['x']));
    await db.rekeyMessageId(-100, 42);
    final all = await db.getAll();
    expect(all.single.messageId, 42);
    expect(all.single.path, '/a/');
    expect(all.single.tags, ['x']);
    expect((await db.folderTagsIndex())['/a/'], ['x']);
  });

  test('deleteTemporaryMessageIds removes negative ids', () async {
    await db.upsert(f(-999, '/stale.txt'));
    await db.upsert(f(1, '/ok.txt'));
    await db.deleteTemporaryMessageIds();
    final all = await db.getAll();
    expect(all.length, 1);
    expect(all.single.messageId, 1);
  });

  test('purgeStaleJournal removes journal with temp message ids', () async {
    await db.journalAdd('editCaption', {'messageId': -5, 'caption': 'x'});
    await db.journalAdd('editCaption', {'messageId': 9, 'caption': 'y'});
    await db.purgeStaleJournal();
    final pending = await db.journalPending();
    expect(pending.length, 1);
    expect(pending.single.args['messageId'], 9);
  });

  test('reconcileToMessageIds removes stale rows', () async {
    await db.upsert(f(1, '/a.txt'));
    await db.upsert(f(99, '/ghost.txt'));
    await db.reconcileToMessageIds({1, 2, 3});
    final all = await db.getAll();
    expect(all.map((e) => e.messageId), [1]);
  });

  test('vault chat id persists in kv', () async {
    await db.setVaultChatId(-100123);
    expect(await db.getVaultChatId(), -100123);
  });

  test('save as directory and bookmark persist in kv', () async {
    await db.setSaveAsDirectory('/Volumes/Disk/Save', bookmark: 'Ym9vaw==');
    expect(await db.getSaveAsDirectory(), '/Volumes/Disk/Save');
    expect(await db.getSaveAsBookmark(), 'Ym9vaw==');
    await db.clearSaveAsDirectory();
    expect(await db.getSaveAsDirectory(), isNull);
    expect(await db.getSaveAsBookmark(), isNull);
  });

  test('lastMessageId persists', () async {
    expect(await db.getLastMessageId(), 0);
    await db.setLastMessageId(555);
    expect(await db.getLastMessageId(), 555);
  });

  test('allTagNames returns distinct sorted tags', () async {
    await db.setFolderTags('/a/', ['manga', 'Kiếm Hiệp']);
    await db.setFolderTags('/b/', ['manga', 'hay']);
    expect(await db.allTagNames(), ['Kiếm Hiệp', 'hay', 'manga']);
  });

  test('theme and locale persist in kv', () async {
    await db.setThemePreference(AppThemePreference.dark);
    await db.setLocale(AppLocale.en);
    expect(await db.getThemePreference(), AppThemePreference.dark);
    expect(await db.getLocale(), AppLocale.en);
  });

  test('auto resume transfers persists in kv', () async {
    expect(await db.getAutoResumeTransfers(), isTrue);
    await db.setAutoResumeTransfers(false);
    expect(await db.getAutoResumeTransfers(), isFalse);
  });

  test('transfers add list update remove', () async {
    final id = await db.transferAdd(
      kind: TransferKind.upload,
      label: 'a.txt',
      localPath: '/tmp/a.txt',
      destPath: '/a.txt',
      size: 10,
    );
    final pending = await db.transfersPending();
    expect(pending.single.label, 'a.txt');
    await db.transferUpdate(id, status: 'failed', error: 'net');
    expect((await db.transfersPending()).single.status, 'failed');
    await db.transferRemove(id);
    expect(await db.transfersPending(), isEmpty);
  });

  test('setFolderTags and renameFolderTagsPath', () async {
    await db.setFolderTags('/x/', ['a', 'b']);
    await db.setFolderTags('/x/sub/', ['c']);
    await db.renameFolderTagsPath('/x/', '/y/');
    final index = await db.folderTagsIndex();
    expect(index['/y/'], ['a', 'b']);
    expect(index['/y/sub/'], ['c']);
    expect(index.containsKey('/x/'), isFalse);
  });

  test('renameTagName and deleteTagName affect folder_tags', () async {
    await db.setFolderTags('/a/', ['old', 'keep']);
    await db.setFolderTags('/b/', ['old']);
    await db.renameTagName('old', 'new');
    var index = await db.folderTagsIndex();
    expect(index['/a/'], containsAll(['new', 'keep']));
    expect(index['/b/'], ['new']);
    await db.deleteTagName('new');
    index = await db.folderTagsIndex();
    expect(index['/a/'], ['keep']);
    expect(index.containsKey('/b/'), isFalse);
  });
}
