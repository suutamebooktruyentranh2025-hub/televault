import 'dart:async';

import '../../models/caption_codec.dart';
import '../../models/vault_entry.dart';
import '../index_db.dart';
import 'td_client.dart';

const vaultMarker = '#televault-v1';

class ChannelService {
  final TdSender _td;
  final IndexDb _db;

  final changes = StreamController<void>.broadcast();
  StreamSubscription<Map<String, dynamic>>? _updatesSub;
  final _pendingUploadIds = <int>{};
  final _pendingUploadPaths = <String>{};

  ChannelService(this._td, this._db);

  void markUploadPath(String destPath) {
    if (destPath.isNotEmpty) _pendingUploadPaths.add(destPath);
  }

  void clearUploadPath(String destPath) {
    if (destPath.isNotEmpty) _pendingUploadPaths.remove(destPath);
  }

  void markUploadPending(int messageId) {
    if (messageId > 0) _pendingUploadIds.add(messageId);
  }

  void clearUploadPending(int? messageId, [int? otherId]) {
    for (final id in [messageId, otherId]) {
      if (id != null && id > 0) _pendingUploadIds.remove(id);
    }
  }

  void rekeyUploadPending(int oldId, int newId) {
    if (_pendingUploadIds.remove(oldId) && newId > 0) {
      _pendingUploadIds.add(newId);
    }
  }

  bool _shouldIndexMessage(Map<String, dynamic> msg) {
    if (!_isDocumentMessage(msg)) return true;
    final id = msg['id'];
    if (id is num && id.toInt() > 0 && _pendingUploadIds.contains(id.toInt())) {
      return false;
    }
    final entry = entryFromMessage(msg);
    if (entry != null && _pendingUploadPaths.contains(entry.path)) return false;
    return true;
  }

  Future<void> dispose() async {
    await _updatesSub?.cancel();
    _updatesSub = null;
  }

  Future<int> createVaultChannel() async {
    final chat = await _td.send({
      '@type': 'createNewSupergroupChat',
      'title': 'TeleVault Storage',
      'is_channel': true,
      'description': 'Kho file TeleVault — không xoá kênh này. $vaultMarker',
    });
    return chat['id'] as int;
  }

  Future<int?> findVaultChannel() async {
    final chats = await _td.send({'@type': 'getChats', 'limit': 200});
    for (final chatId in (chats['chat_ids'] as List? ?? const [])) {
      final chat = await _td.send({'@type': 'getChat', 'chat_id': chatId});
      final type = chat['type'] as Map<String, dynamic>?;
      if (type?['@type'] != 'chatTypeSupergroup' || type?['is_channel'] != true) continue;
      final full = await _td.send({
        '@type': 'getSupergroupFullInfo',
        'supergroup_id': type!['supergroup_id'],
      });
      if ((full['description'] as String? ?? '').contains(vaultMarker)) {
        return chatId as int;
      }
    }
    return null;
  }

  Future<bool> _isVaultChat(int chatId) async {
    try {
      final chat = await _td.send({'@type': 'getChat', 'chat_id': chatId});
      final type = chat['type'] as Map<String, dynamic>?;
      if (type?['@type'] != 'chatTypeSupergroup' || type?['is_channel'] != true) return false;
      final full = await _td.send({
        '@type': 'getSupergroupFullInfo',
        'supergroup_id': type!['supergroup_id'],
      });
      return (full['description'] as String? ?? '').contains(vaultMarker);
    } catch (_) {
      return false;
    }
  }

  /// Dùng chat id đã lưu (2 request) thay vì quét toàn bộ getChats mỗi lần đăng nhập.
  Future<int> resolveVaultChatId() async {
    final cached = await _db.getVaultChatId();
    if (cached != null && await _isVaultChat(cached)) return cached;
    final found = await findVaultChannel();
    if (found != null) {
      await _db.setVaultChatId(found);
      return found;
    }
    final created = await createVaultChannel();
    await _db.setVaultChatId(created);
    return created;
  }

  VaultEntry? entryFromMessage(Map<String, dynamic> msg) {
    final content = msg['content'] as Map<String, dynamic>?;
    final id = msg['id'] as int;
    switch (content?['@type']) {
      case 'messageDocument':
        final caption = (content!['caption'] as Map<String, dynamic>?)?['text'] as String? ?? '';
        return decodeCaption(id, caption);
      case 'messageText':
        final text = (content!['text'] as Map<String, dynamic>?)?['text'] as String? ?? '';
        return decodeCaption(id, text);
    }
    return null;
  }

  bool _isDocumentMessage(Map<String, dynamic> msg) {
    final content = msg['content'] as Map<String, dynamic>?;
    return content?['@type'] == 'messageDocument';
  }

  int? tdFileIdFromMessage(Map<String, dynamic> msg) {
    final content = msg['content'] as Map<String, dynamic>?;
    if (content?['@type'] != 'messageDocument') return null;
    final doc = content!['document'] as Map<String, dynamic>?;
    final file = doc?['document'] as Map<String, dynamic>?;
    final id = file?['id'];
    if (id is int) return id;
    if (id is num) return id.toInt();
    return null;
  }

  Future<void> scanHistory(int chatId, {void Function(int scanned)? onProgress}) async {
    var fromMessageId = 0;
    var scanned = 0;
    var maxId = await _db.getLastMessageId();
    final seenIds = <int>{};
    while (true) {
      final page = await _td.send({
        '@type': 'getChatHistory',
        'chat_id': chatId,
        'from_message_id': fromMessageId,
        'offset': 0,
        'limit': 100,
        'only_local': false,
      });
      final messages = (page['messages'] as List? ?? const []).cast<Map<String, dynamic>>();
      if (messages.isEmpty) break;
      for (final msg in messages) {
        final id = msg['id'] as int;
        seenIds.add(id);
        final entry = entryFromMessage(msg);
        if (entry != null) await _db.upsert(entry);
        scanned++;
        if (id > maxId) maxId = id;
      }
      final nextFrom = messages.last['id'] as int;
      if (nextFrom == fromMessageId) break;
      fromMessageId = nextFrom;
      onProgress?.call(scanned);
    }
    await _db.reconcileToMessageIds(seenIds);
    await _db.setLastMessageId(maxId);
    changes.add(null);
  }

  void listenUpdates(int chatId) {
    _updatesSub?.cancel();
    _updatesSub = _td.updates.listen((u) async {
      switch (u['@type']) {
        case 'updateNewMessage':
          final msg = u['message'] as Map<String, dynamic>;
          if (msg['chat_id'] != chatId) return;
          final id = msg['id'];
          if (id is num && id.toInt() < 0) return;
          if (!_shouldIndexMessage(msg)) return;
          final entry = entryFromMessage(msg);
          if (entry != null) {
            await _db.upsert(entry);
            changes.add(null);
          }
        case 'updateMessageSendSucceeded':
          final msg = u['message'] as Map<String, dynamic>?;
          if (msg == null || msg['chat_id'] != chatId) return;
          final oldId = u['old_message_id'];
          final newId = msg['id'];
          if (oldId is num && newId is num) {
            rekeyUploadPending(oldId.toInt(), newId.toInt());
          }
          if (oldId is num && newId is num && oldId.toInt() != newId.toInt()) {
            await _db.rekeyMessageId(oldId.toInt(), newId.toInt());
          }
          if (!_isDocumentMessage(msg)) {
            final entry = entryFromMessage(msg);
            if (entry != null) {
              await _db.upsert(entry);
              changes.add(null);
            }
          }
        case 'updateMessageContent':
          if (u['chat_id'] != chatId) return;
          final msgId = u['message_id'];
          if (msgId is num && _pendingUploadIds.contains(msgId.toInt())) return;
          final entry = entryFromMessage({
            'id': u['message_id'],
            'content': u['new_content'],
          });
          if (entry != null) {
            await _db.upsert(entry);
            changes.add(null);
          }
        case 'updateDeleteMessages':
          if (u['chat_id'] != chatId || u['is_permanent'] != true) return;
          for (final id in (u['message_ids'] as List? ?? const [])) {
            await _db.delete(id as int);
          }
          changes.add(null);
      }
    });
  }
}
