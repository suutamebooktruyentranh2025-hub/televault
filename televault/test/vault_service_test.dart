import 'dart:io';

import 'helpers/test_db.dart';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/index_db.dart';
import 'package:televault/services/telegram/channel_service.dart';
import 'package:televault/services/transfer_service.dart';
import 'package:televault/services/vault_service.dart';
import 'package:televault/services/telegram/td_client.dart';
import 'package:televault/utils/trash.dart';

import 'helpers/scripted_td.dart';

VaultEntry f(int id, String path, {List<String> tags = const [], String sha256 = 'h'}) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: sha256, mtime: DateTime.utc(2026), tags: tags);

void main() {
  late ScriptedTd td;
  late IndexDb db;
  late String dbPath;
  late VaultService vault;

  setUp(() async {
    sqfliteFfiInit();
    td = ScriptedTd();
    dbPath = nextTestDbPath();
    db = await IndexDb.open(databaseFactoryFfi, dbPath);
    vault = VaultService(
      td: td, db: db,
      channel: ChannelService(td, db),
      queue: TransferQueue(maxConcurrent: 1, baseBackoff: Duration.zero),
      chatId: -100,
    );
  });

  tearDown(() async {
    await db.close();
    await deleteTestDb(dbPath);
  });

  test('renameFile edits caption with new path', () async {
    await db.upsert(f(1, '/old.txt'));
    await vault.renameFile(1, '/new.txt');
    final req = td.sent.singleWhere((r) => r['@type'] == 'editMessageCaption');
    expect(req['chat_id'], -100);
    expect(req['message_id'], 1);
    expect((req['caption'] as Map)['text'], contains('"/new.txt"'));
  });

  test('deleteEntries sends deleteMessages with revoke', () async {
    await db.upsert(f(1, '/a.txt'));
    await vault.deleteEntries([1]);
    final req = td.sent.singleWhere((r) => r['@type'] == 'deleteMessages');
    expect(req['message_ids'], [1]);
    expect(req['revoke'], true);
  });

  test('trashEntries moves file into Rác via editCaption', () async {
    await db.upsert(f(1, '/a.txt'));
    await db.upsert(VaultEntry.dirMarker(messageId: 9, path: kTrashFolder));
    await vault.trashEntries([1]);
    final edits = td.sent.where((r) => r['@type'] == 'editMessageCaption').toList();
    expect(edits, hasLength(1));
    expect((edits.first['caption'] as Map)['text'], contains('"/Rác/a.txt"'));
    expect((await db.getAll()).singleWhere((e) => e.messageId == 1).path, '/Rác/a.txt');
  });

  test('deleteFolder outside trash moves folder into Rác', () async {
    await db.upsert(f(1, '/x/a.txt'));
    await db.upsert(VaultEntry.dirMarker(messageId: 9, path: kTrashFolder));
    await vault.deleteFolder('/x/');
    final edits = td.sent.where((r) => r['@type'] == 'editMessageCaption').toList();
    expect(edits.length, 1);
    expect((edits.first['caption'] as Map)['text'], contains('"/Rác/x/a.txt"'));
  });

  test('deleteFolder inside trash permanently deletes', () async {
    await db.upsert(f(1, '/Rác/a.txt'));
    await vault.deleteFolder('/Rác/');
    final req = td.sent.singleWhere((r) => r['@type'] == 'deleteMessages');
    expect(req['message_ids'], [1]);
  });

  test('restoreEntries moves file back from Rác', () async {
    await db.upsert(f(1, '/Rác/docs/a.txt'));
    await vault.restoreEntries([1]);
    final edit = td.sent.singleWhere((r) => r['@type'] == 'editMessageCaption');
    expect((edit['caption'] as Map)['text'], contains('"/docs/a.txt"'));
    expect((await db.getAll()).single.path, '/docs/a.txt');
  });

  test('renameFolder edits caption of every descendant and journals', () async {
    await db.upsert(f(1, '/x/a.txt'));
    await db.upsert(f(2, '/x/b/c.txt'));
    await db.upsert(VaultEntry.dirMarker(messageId: 4, path: '/x/sub2/'));
    await db.upsert(f(3, '/y/d.txt'));
    await vault.renameFolder('/x/', '/z/');
    expect(td.sent.where((r) => r['@type'] == 'editMessageCaption').length, 2);
    expect(td.sent.where((r) => r['@type'] == 'editMessageText').length, 1);
    expect(await db.journalPending(), isEmpty);
  });

  test('moveFolder relocates folder under dest parent', () async {
    await db.upsert(f(1, '/src/a.txt'));
    await db.upsert(VaultEntry.dirMarker(messageId: 2, path: '/src/'));
    await db.setFolderTags('/src/', ['t1']);
    await vault.moveFolder('/src/', '/dest/');
    expect((await db.getAll()).singleWhere((e) => e.messageId == 1).path, '/dest/src/a.txt');
    expect((await db.folderTagsIndex())['/dest/src/'], ['t1']);
  });

  test('moveFolder throws when dest is inside source tree', () async {
    await db.upsert(VaultEntry.dirMarker(messageId: 1, path: '/src/'));
    expect(
      () => vault.moveFolder('/src/', '/src/sub/'),
      throwsA(isA<FolderMoveException>()),
    );
  });

  test('moveFolder can move nested folder to vault root', () async {
    await db.upsert(f(1, '/archive/manga/a.txt'));
    await vault.moveFolder('/archive/manga/', '/');
    expect((await db.getAll()).singleWhere((e) => e.messageId == 1).path, '/manga/a.txt');
  });

  test('setFolderTags edits marker caption preserving path', () async {
    await db.upsert(VaultEntry.dirMarker(messageId: 1, path: '/manga/'));
    await vault.setFolderTags('/manga/', ['manga']);
    final req = td.sent.singleWhere((r) => r['@type'] == 'editMessageText');
    final text = ((req['input_message_content'] as Map)['text'] as Map)['text'] as String;
    expect(text, contains('"manga"'));
    expect(text, contains('"/manga/"'));
    expect((await db.folderTagsIndex())['/manga/'], ['manga']);
  });

  test('setFolderTags without marker sends marker with tags', () async {
    await db.upsert(f(1, '/manga/a.txt'));
    await vault.setFolderTags('/manga/', ['series', 'cbz']);
    final req = td.sent.singleWhere((r) => r['@type'] == 'sendMessage');
    final text = ((req['input_message_content'] as Map)['text'] as Map)['text'] as String;
    expect(text, contains('"tags"'));
    expect(text, contains('series'));
    expect(text, contains('cbz'));
    expect((await db.folderTagsIndex())['/manga/'], ['cbz', 'series']);
  });

  test('renameTag renames tag on folder marker caption', () async {
    await db.upsert(VaultEntry.dirMarker(messageId: 1, path: '/manga/', tags: ['old']));
    await db.setFolderTags('/manga/', ['old']);
    await vault.renameTag('old', 'Kiếm Hiệp');
    expect((await db.folderTagsIndex())['/manga/'], ['Kiếm Hiệp']);
    final edit = td.sent.singleWhere((r) => r['@type'] == 'editMessageText');
    final text = ((edit['input_message_content'] as Map)['text'] as Map)['text'] as String;
    expect(text, contains('Kiếm Hiệp'));
  });

  test('createFolder sends marker text message', () async {
    await vault.createFolder('/mới/');
    final req = td.sent.singleWhere((r) => r['@type'] == 'sendMessage');
    final content = req['input_message_content'] as Map;
    expect(content['@type'], 'inputMessageText');
    expect(((content['text'] as Map)['text'] as String), contains('"/mới/"'));
  });

  test('checkDuplicate returns existing entry by sha', () async {
    await db.upsert(VaultEntry(messageId: 1, path: '/a.pdf', size: 9,
        sha256: 'dup', mtime: DateTime.utc(2026)));
    final hit = await vault.checkDuplicate('dup');
    expect(hit!.path, '/a.pdf');
  });

  test('resumePendingJournal replays remaining steps', () async {
    await db.journalAdd('editCaption', {'messageId': 5, 'caption': '{"v":1,"path":"/j.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'});
    await vault.resumePendingJournal();
    expect(td.sent.single['@type'], 'editMessageCaption');
    expect(await db.journalPending(), isEmpty);
  });

  test('resumePendingJournal drops stale journal on 404', () async {
    td.throwOn['editMessageCaption'] = TdException(404, 'Not Found');
    await db.journalAdd('editCaption', {'messageId': 5, 'caption': '{"v":1,"path":"/j.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'});
    await vault.resumePendingJournal();
    expect(await db.journalPending(), isEmpty);
  });

  test('resolveConflictsNow drops stale index entry on message not found', () async {
    await db.upsert(f(1, '/dup.pdf'));
    await db.upsert(f(2, '/dup.pdf'));
    td.throwOn['editMessageCaption'] = TdException(400, 'Message not found');
    await vault.resolveConflictsNow();
    final ids = (await db.getAll()).map((e) => e.messageId).toList();
    expect(ids, isNot(contains(1)));
    expect(ids, contains(2));
  });

  test('enqueueDownload skips downloadFile when getFile already complete', () async {
    final tmp = File('${Directory.systemTemp.path}/televault_cached_${DateTime.now().microsecondsSinceEpoch}.bin');
    await tmp.writeAsBytes([0x42]);
    final digest = sha256.convert([0x42]).toString();
    await db.upsert(f(5, '/cached.txt', sha256: digest));
    td.responses['getMessage'] = [
      {
        '@type': 'message',
        'id': 5,
        'content': {
          '@type': 'messageDocument',
          'document': {'document': {'id': 50}},
        },
      },
    ];
    td.responses['getFile'] = [
      {
        '@type': 'file',
        'id': 50,
        'local': {'is_downloading_completed': true, 'path': tmp.path},
      },
    ];
    final (_, done) = vault.enqueueDownload((await db.getAll()).single);
    await done;
    expect(td.sent.where((r) => r['@type'] == 'downloadFile'), isEmpty);
    expect(await vault.readLocalPath(5), tmp.path);
    await tmp.delete();
  });

  test('restorePendingTransfers skips upload already on vault', () async {
    final tmp = File('${Directory.systemTemp.path}/televault_skip_${DateTime.now().microsecondsSinceEpoch}.bin');
    await tmp.writeAsBytes([1, 2, 3]);
    final digest = sha256.convert([1, 2, 3]).toString();
    await db.upsert(VaultEntry(messageId: 10, path: '/a.bin', size: 3, sha256: digest, mtime: DateTime.utc(2026)));
    await db.transferAdd(
      kind: TransferKind.upload,
      label: 'a.bin',
      localPath: tmp.path,
      destPath: '/a.bin',
      size: 3,
    );
    await vault.restorePendingTransfers(autoStart: true);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(vault.queue.tasks.where((t) => t.kind == TransferKind.upload), isEmpty);
    expect(await db.transfersPending(), isEmpty);
    await tmp.delete();
  });

  test('restorePendingTransfers re-enqueues queued upload when autoStart', () async {
    final tmp = File('${Directory.systemTemp.path}/televault_up_${DateTime.now().microsecondsSinceEpoch}.bin');
    await tmp.writeAsBytes([1, 2, 3]);
    await db.transferAdd(
      kind: TransferKind.upload,
      label: 'a.bin',
      localPath: tmp.path,
      destPath: '/a.bin',
      size: 3,
    );
    await vault.restorePendingTransfers(autoStart: true);
    expect(vault.queue.tasks.where((t) => t.kind == TransferKind.upload), isNotEmpty);
    await tmp.delete();
  });

  test('restorePendingTransfers skips download already cached locally', () async {
    final tmp = File('${Directory.systemTemp.path}/televault_dl_${DateTime.now().microsecondsSinceEpoch}.bin');
    await tmp.writeAsBytes([0x42]);
    final digest = sha256.convert([0x42]).toString();
    await db.upsert(VaultEntry(
      messageId: 11,
      path: '/cached.bin',
      size: 1,
      sha256: digest,
      mtime: DateTime.utc(2026),
      localPath: tmp.path,
    ));
    await db.transferAdd(
      kind: TransferKind.download,
      label: 'cached.bin',
      messageId: 11,
      size: 1,
    );
    await vault.restorePendingTransfers(autoStart: true);
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(vault.queue.tasks.where((t) => t.kind == TransferKind.download), isEmpty);
    expect(await db.transfersPending(), isEmpty);
    await tmp.delete();
  });

  test('restorePendingTransfers leaves missing file as failed', () async {
    await db.transferAdd(
      kind: TransferKind.upload,
      label: 'gone.bin',
      localPath: '${Directory.systemTemp.path}/televault_missing_${DateTime.now().microsecondsSinceEpoch}.bin',
      destPath: '/gone.bin',
      size: 1,
    );
    await vault.restorePendingTransfers(autoStart: false);
    final t = vault.queue.tasks.single;
    expect(t.status, TransferStatus.failed);
  });
}
