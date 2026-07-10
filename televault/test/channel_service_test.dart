import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'helpers/test_db.dart';
import 'package:televault/models/caption_codec.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/index_db.dart';
import 'package:televault/services/telegram/channel_service.dart';

import 'helpers/scripted_td.dart';

Map<String, dynamic> docMessage(int id, String caption) => {
      '@type': 'message',
      'id': id,
      'chat_id': -100,
      'content': {
        '@type': 'messageDocument',
        'document': {'document': {'id': id * 10}},
        'caption': {'text': caption},
      },
    };

VaultEntry f(int id, String path) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: 'h', mtime: DateTime.utc(2026));

void main() {
  late ScriptedTd td;
  late IndexDb db;
  late String dbPath;
  late ChannelService svc;

  setUp(() async {
    sqfliteFfiInit();
    td = ScriptedTd();
    dbPath = nextTestDbPath();
    db = await IndexDb.open(databaseFactoryFfi, dbPath);
    svc = ChannelService(td, db);
  });

  tearDown(() async {
    await db.close();
    await deleteTestDb(dbPath);
  });

  test('createVaultChannel sends createNewSupergroupChat with marker', () async {
    td.responses['createNewSupergroupChat'] = [{'@type': 'chat', 'id': -100}];
    final chatId = await svc.createVaultChannel();
    expect(chatId, -100);
    final req = td.sent.singleWhere((r) => r['@type'] == 'createNewSupergroupChat');
    expect(req['is_channel'], true);
    expect((req['description'] as String).contains('#televault-v1'), isTrue);
  });

  test('resolveVaultChatId uses cached id without getChats', () async {
    await db.setVaultChatId(-100);
    td.responses['getChat'] = [
      {'@type': 'chat', 'id': -100, 'type': {'@type': 'chatTypeSupergroup', 'is_channel': true, 'supergroup_id': 1}},
    ];
    td.responses['getSupergroupFullInfo'] = [
      {'@type': 'supergroupFullInfo', 'description': 'TeleVault $vaultMarker'},
    ];
    final chatId = await svc.resolveVaultChatId();
    expect(chatId, -100);
    expect(td.sent.where((r) => r['@type'] == 'getChats'), isEmpty);
  });

  test('scanHistory pages until empty and fills index', () async {
    await db.upsert(f(999, '/stale-local.txt'));
    td.responses['getChatHistory'] = [
      {'@type': 'messages', 'messages': [
        docMessage(3, '{"v":1,"path":"/c.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
        docMessage(2, 'không phải metadata — bỏ qua'),
      ]},
      {'@type': 'messages', 'messages': [
        docMessage(1, '{"v":1,"path":"/a.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
      ]},
      {'@type': 'messages', 'messages': []},
    ];
    await svc.scanHistory(-100);
    final all = await db.getAll();
    expect(all.map((e) => e.path).toSet(), {'/a.txt', '/c.txt'});
    expect(await db.getLastMessageId(), 3);
    expect((await db.getAll()).map((e) => e.messageId).toSet(), {1, 3});
  });

  test('scanHistory stops when pagination repeats same message id', () async {
    td.responses['getChatHistory'] = [
      {'@type': 'messages', 'messages': [
        docMessage(1, '{"v":1,"path":"/a.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
      ]},
      {'@type': 'messages', 'messages': [
        docMessage(1, '{"v":1,"path":"/a.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
      ]},
    ];
    await svc.scanHistory(-100);
    expect(td.sent.where((r) => r['@type'] == 'getChatHistory').length, 2);
  });

  Future<void> pump(ChannelService service) async {
    await service.changes.stream.first.timeout(const Duration(seconds: 1));
  }

  test('outgoing document SendSucceeded does not index before upload completes', () async {
    svc.listenUpdates(-100);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(-100, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);

    td.updateCtrl.add({
      '@type': 'updateMessageSendSucceeded',
      'old_message_id': -100,
      'message': docMessage(42, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
    });
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
  });

  test('updateNewMessage with positive id skipped while upload pending', () async {
    svc.listenUpdates(-100);
    svc.markUploadPending(42);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(42, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
    svc.clearUploadPending(42);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(42, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await pump(svc);
    expect((await db.getAll()).single.messageId, 42);
  });

  test('rekeyUploadPending follows SendSucceeded id change', () async {
    svc.listenUpdates(-100);
    svc.markUploadPending(10);
    td.updateCtrl.add({
      '@type': 'updateMessageSendSucceeded',
      'old_message_id': 10,
      'message': docMessage(99, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
    });
    await Future<void>.delayed(Duration.zero);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(99, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
  });

  test('updateNewMessage skipped for pending upload path before message id known', () async {
    svc.listenUpdates(-100);
    svc.markUploadPath('/n.txt');
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(42, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
  });

  test('folder marker SendSucceeded still indexes immediately', () async {
    svc.listenUpdates(-100);
    final dir = VaultEntry.dirMarker(messageId: 51, path: '/newfolder/');
    td.updateCtrl.add({
      '@type': 'updateMessageSendSucceeded',
      'old_message_id': -50,
      'message': {
        '@type': 'message',
        'id': 51,
        'chat_id': -100,
        'content': {
          '@type': 'messageText',
          'text': {'text': encodeCaption(dir)},
        },
      },
    });
    await pump(svc);
    expect((await db.getAll()).single.messageId, 51);
  });

  test('listen applies edit/delete updates to indexed messages', () async {
    svc.listenUpdates(-100);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(42, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await pump(svc);
    expect((await db.getAll()).single.messageId, 42);

    td.updateCtrl.add({'@type': 'updateMessageContent', 'chat_id': -100, 'message_id': 42,
        'new_content': {'@type': 'messageDocument', 'document': {'document': {'id': 70}},
          'caption': {'text': '{"v":1,"path":"/renamed.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'}}});
    await pump(svc);
    expect((await db.getAll()).single.path, '/renamed.txt');

    td.updateCtrl.add({'@type': 'updateDeleteMessages', 'chat_id': -100,
        'message_ids': [42], 'is_permanent': true});
    await pump(svc);
    expect(await db.getAll(), isEmpty);
  });

  test('listen indexes confirmed incoming messages immediately', () async {
    svc.listenUpdates(-100);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(7, '{"v":1,"path":"/in.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await pump(svc);
    expect((await db.getAll()).single.messageId, 7);
  });

  test('updates for other chats ignored', () async {
    svc.listenUpdates(-100);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message': {
      ...docMessage(9, '{"v":1,"path":"/x.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
      'chat_id': -999,
    }});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
  });
}
