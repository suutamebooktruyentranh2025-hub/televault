import 'dart:async';
import 'dart:io';

import 'package:collection/collection.dart';
import 'package:crypto/crypto.dart';

import '../models/caption_codec.dart';
import '../models/pending_transfer.dart';
import '../models/vault_entry.dart';
import 'index_db.dart';
import 'telegram/channel_service.dart';
import 'telegram/td_api_builders.dart';
import 'telegram/td_client.dart';
import 'transfer_service.dart';
import 'vault_ops.dart';
import '../utils/folder_tags.dart';
import '../utils/trash.dart';

enum FolderMoveReason { intoDescendant }

class FolderMoveException implements Exception {
  final FolderMoveReason reason;
  const FolderMoveException(this.reason);
}

class VaultService {
  final TdSender td;
  final IndexDb db;
  final ChannelService channel;
  final TransferQueue queue;
  final int chatId;
  final bool legacyTdApi;

  VaultService({required this.td, required this.db, required this.channel,
      required this.queue, required this.chatId, this.legacyTdApi = true}) {
    queue.onStatusChange = _onTransferStatusChange;
  }

  void _onTransferStatusChange(TransferTask task) {
    final pid = task.persistId;
    if (pid == null) return;
    switch (task.status) {
      case TransferStatus.done:
        unawaited(db.transferRemove(pid));
      case TransferStatus.failed:
      case TransferStatus.cancelled:
        unawaited(db.transferUpdate(pid,
            status: task.status.name, error: task.error?.toString()));
      case TransferStatus.running:
        unawaited(db.transferUpdate(pid, status: 'running'));
      case TransferStatus.queued:
      case TransferStatus.paused:
        break;
    }
  }

  Future<void> _editCaption(int messageId, String caption) async {
    await td.send({
      '@type': 'editMessageCaption',
      'chat_id': chatId,
      'message_id': messageId,
      'caption': {'@type': 'formattedText', 'text': caption},
    });
  }

  Future<void> _editMessageText(int messageId, String text) async {
    await td.send({
      '@type': 'editMessageText',
      'chat_id': chatId,
      'message_id': messageId,
      'input_message_content': {
        '@type': 'inputMessageText',
        'text': {'@type': 'formattedText', 'text': text},
      },
    });
  }

  Future<void> _syncEntryMetadata(VaultEntry entry) async {
    final payload = encodeCaption(entry);
    if (entry.isDir) {
      await _editMessageText(entry.messageId, payload);
    } else {
      await _editCaption(entry.messageId, payload);
    }
  }

  Future<void> renameFile(int messageId, String newPath) async {
    final entry = (await db.getAll()).firstWhere((e) => e.messageId == messageId);
    final updated = entry.copyWith(path: newPath);
    await _syncEntryMetadata(updated);
    await db.upsert(updated);
  }

  Future<void> ensureFolderMarker(String folderPath, List<String> tags) async {
    assert(folderPath.endsWith('/'));
    final normalized = normalizeFolderTags(tags);
    if (normalized.isEmpty) return;
    final existing =
        (await db.getAll()).where((e) => e.isDir && e.path == folderPath).firstOrNull;
    if (existing != null) return;
    final marker = VaultEntry.dirMarker(messageId: 0, path: folderPath, tags: normalized);
    await td.send({
      '@type': 'sendMessage',
      'chat_id': chatId,
      'input_message_content': {
        '@type': 'inputMessageText',
        'text': {'@type': 'formattedText', 'text': encodeCaption(marker)},
      },
    });
  }

  Future<void> setFolderTags(String folderPath, List<String> tags) async {
    assert(folderPath.endsWith('/'));
    final normalized = normalizeFolderTags(tags);
    await db.setFolderTags(folderPath, normalized);
    final marker = (await db.getAll()).where((e) => e.isDir && e.path == folderPath).firstOrNull;
    if (marker != null) {
      final updated = marker.copyWith(tags: normalized);
      await _syncEntryMetadata(updated);
      await db.upsert(updated);
    } else if (normalized.isNotEmpty) {
      await ensureFolderMarker(folderPath, normalized);
    }
  }

  Future<void> deleteEntries(List<int> messageIds) async {
    await td.send({
      '@type': 'deleteMessages',
      'chat_id': chatId,
      'message_ids': messageIds,
      'revoke': true,
    });
    for (final id in messageIds) {
      await db.delete(id);
    }
  }

  Future<void> ensureTrashFolder() async {
    final all = await db.getAll();
    if (all.any((e) => e.isDir && e.path == kTrashFolder)) return;
    await createFolder(kTrashFolder);
  }

  Future<void> trashEntries(List<int> messageIds) async {
    if (messageIds.isEmpty) return;
    await ensureTrashFolder();
    final all = await db.getAll();
    final paths = all.map((e) => e.path).toList();
    for (final id in messageIds) {
      final entry = all.firstWhere((e) => e.messageId == id);
      if (isInTrash(entry.path)) continue;
      final dest = uniqueVaultPath(pathInTrash(entry.path), paths);
      paths.add(dest);
      await renameFile(id, dest);
    }
  }

  Future<void> trashFolder(String folder) async {
    assert(folder.endsWith('/'));
    if (isTrashFolder(folder) || isInTrash(folder)) {
      await deleteFolderPermanently(folder);
      return;
    }
    await ensureTrashFolder();
    final all = await db.getAll();
    final paths = all.map((e) => e.path).toList();
    final dest = uniqueVaultPath(pathInTrash(folder), paths);
    await renameFolder(folder, dest);
  }

  Future<void> deleteFolderPermanently(String folder) async {
    final steps = planFolderDelete(await db.getAll(), folder: folder);
    await _runJournaled([for (final s in steps) ('delete', {'messageId': s.messageId})]);
  }

  Future<void> deleteFileOrTrash(VaultEntry entry) async {
    if (isInTrash(entry.path)) {
      await deleteEntries([entry.messageId]);
    } else {
      await trashEntries([entry.messageId]);
    }
  }

  Future<void> deleteFilesOrTrash(List<VaultEntry> entries) async {
    final files = entries.where((e) => !e.isDir).toList();
    if (files.isEmpty) return;
    if (files.every((e) => isInTrash(e.path))) {
      await deleteEntries(files.map((e) => e.messageId).toList());
      return;
    }
    await trashEntries(files.where((e) => !isInTrash(e.path)).map((e) => e.messageId).toList());
    final inTrash = files.where((e) => isInTrash(e.path)).map((e) => e.messageId).toList();
    if (inTrash.isNotEmpty) await deleteEntries(inTrash);
  }

  Future<void> restoreEntries(List<int> messageIds) async {
    if (messageIds.isEmpty) return;
    final all = await db.getAll();
    final paths = all.map((e) => e.path).toList();
    for (final id in messageIds) {
      final entry = all.firstWhere((e) => e.messageId == id);
      if (!isInTrash(entry.path) || entry.isDir) continue;
      final dest = uniqueVaultPath(pathFromTrash(entry.path), paths);
      paths.add(dest);
      await renameFile(id, dest);
    }
  }

  Future<void> restoreFolder(String folder) async {
    assert(folder.endsWith('/') && isInTrash(folder));
    final all = await db.getAll();
    final paths = all.map((e) => e.path).toList();
    var dest = uniqueVaultPath(pathFromTrash(folder), paths);
    if (!dest.endsWith('/')) dest = '$dest/';
    await renameFolder(folder, dest);
  }

  Future<void> createFolder(String path) async {
    assert(path.endsWith('/'));
    final marker = VaultEntry.dirMarker(messageId: 0, path: path);
    await td.send({
      '@type': 'sendMessage',
      'chat_id': chatId,
      'input_message_content': {
        '@type': 'inputMessageText',
        'text': {'@type': 'formattedText', 'text': encodeCaption(marker)},
      },
    });
  }

  Future<VaultEntry?> checkDuplicate(String sha256) => db.findBySha(sha256);

  Future<void> _runJournaled(List<(String, Map<String, dynamic>)> steps) async {
    final ids = <int>[];
    for (final (op, args) in steps) {
      ids.add(await db.journalAdd(op, args));
    }
    for (var i = 0; i < steps.length; i++) {
      await _applyJournalStep(steps[i].$1, steps[i].$2);
      await db.journalRemove(ids[i]);
    }
  }

  Future<void> _applyJournalStep(String op, Map<String, dynamic> args) async {
    switch (op) {
      case 'editCaption':
        final messageId = args['messageId'] as int;
        final caption = args['caption'] as String;
        final decoded = decodeCaption(messageId, caption);
        if (decoded?.isDir == true) {
          await _editMessageText(messageId, caption);
        } else {
          await _editCaption(messageId, caption);
        }
        if (decoded != null) await db.upsert(decoded);
      case 'delete':
        await td.send({'@type': 'deleteMessages', 'chat_id': chatId,
            'message_ids': [args['messageId']], 'revoke': true});
        await db.delete(args['messageId'] as int);
    }
  }

  Future<void> resumePendingJournal() async {
    for (final item in await db.journalPending()) {
      try {
        await _applyJournalStep(item.op, item.args);
        await db.journalRemove(item.id);
      } on TdException catch (e) {
        if (e.code == 404 || e.code == 400) {
          await db.journalRemove(item.id);
        } else {
          rethrow;
        }
      }
    }
  }

  Future<void> resolveConflictsNow() async {
    final fixes = resolvePathConflicts(await db.getAll(), today: DateTime.now().toUtc());
    for (final fix in fixes) {
      try {
        await _editCaption(fix.entry.messageId, encodeCaption(fix.entry.copyWith(path: fix.newPath)));
        await db.upsert(fix.entry.copyWith(path: fix.newPath));
      } on TdException catch (e) {
        if (e.code == 404 || e.code == 400) {
          await db.delete(fix.entry.messageId);
        } else {
          rethrow;
        }
      }
    }
  }

  Future<void> renameFolder(String from, String to) async {
    final all = await db.getAll();
    final steps = planFolderRename(all, from: from, to: to);
    final byId = {for (final e in all) e.messageId: e};
    await db.renameFolderTagsPath(from, to);
    await _runJournaled([
      for (final s in steps)
        ('editCaption', {
          'messageId': s.messageId,
          'caption': encodeCaption(byId[s.messageId]!.copyWith(path: s.newPath)),
        })
    ]);
  }

  /// Di chuyển folder [folder] vào [destParent] (giữ tên folder).
  /// Throws [FolderMoveException] nếu đích nằm trong cây nguồn.
  Future<void> moveFolder(String folder, String destParent) async {
    assert(folder.endsWith('/') && destParent.endsWith('/'));
    final name = folder.substring(0, folder.length - 1).split('/').last;
    var to = '$destParent$name/';
    if (to == folder) return;
    if (to.startsWith(folder)) {
      throw FolderMoveException(FolderMoveReason.intoDescendant);
    }
    final all = await db.getAll();
    final paths = all.map((e) => e.path).toList();
    if (paths.contains(to)) {
      to = uniqueVaultPath(to, paths);
      if (!to.endsWith('/')) to = '$to/';
    }
    await renameFolder(folder, to);
  }

  Future<void> deleteFolder(String folder) async {
    if (isTrashFolder(folder) || isInTrash(folder)) {
      await deleteFolderPermanently(folder);
    } else {
      await trashFolder(folder);
    }
  }

  Future<void> renameTag(String from, String to) async {
    final all = await db.getAll();
    final steps = planTagRename(all, from: from, to: to);
    final byId = {for (final e in all) e.messageId: e};
    await db.renameTagName(from, to);
    await _runJournaled([
      for (final s in steps)
        ('editCaption', {
          'messageId': s.messageId,
          'caption': encodeCaption(byId[s.messageId]!.copyWith(tags: s.newTags)),
        })
    ]);
  }

  Future<void> deleteTag(String tag) async {
    await db.deleteTagName(tag);
    final all = await db.getAll();
    final steps = planTagDelete(all, tag: tag);
    final byId = {for (final e in all) e.messageId: e};
    await _runJournaled([
      for (final s in steps)
        ('editCaption', {
          'messageId': s.messageId,
          'caption': encodeCaption(byId[s.messageId]!.copyWith(tags: s.newTags)),
        })
    ]);
  }

  Future<String> _sha256Of(File file) async {
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString();
  }

  Future<bool> _isUploadAlreadyOnVault(PendingTransfer p) async {
    final localPath = p.localPath;
    final destPath = p.destPath;
    if (localPath == null || destPath == null) return false;
    final local = File(localPath);
    if (!await local.exists()) return false;
    final entry = (await db.getAll()).where((e) => e.path == destPath && !isInTrash(e.path)).firstOrNull;
    if (entry == null) return false;
    final sha = await _sha256Of(local);
    final size = await local.length();
    return entry.sha256 == sha && entry.size == size;
  }

  Future<bool> _isDownloadAlreadyComplete(VaultEntry entry) async {
    final localPath = entry.localPath;
    if (localPath == null) return false;
    final local = File(localPath);
    if (!await local.exists()) return false;
    final actual = await _sha256Of(local);
    return actual == entry.sha256;
  }

  Future<void> _verifyLocalSha256(File file, String expected) async {
    final actual = await _sha256Of(file);
    if (actual != expected) {
      throw Exception('SHA256 không khớp — file có thể bị hỏng (mong đợi $expected, nhận $actual)');
    }
  }

  int _tdId(Object? v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v) ?? -1;
    return -1;
  }

  Future<String?> readLocalPath(int messageId) async {
    for (final row in await db.getAll()) {
      if (row.messageId == messageId) return row.localPath;
    }
    return null;
  }

  (TransferTask, Future<void>) enqueueUpload(File local, String destPath) {
    final label = destPath.substring(destPath.lastIndexOf('/') + 1);
    final task = TransferTask(
      id: 'up:${DateTime.now().microsecondsSinceEpoch}',
      kind: TransferKind.upload,
      label: label,
      localPath: local.path,
      destPath: destPath,
      run: (report) => _runUpload(local, destPath, report),
    );
    final done = () async {
      await _bindPersistedTransfer(task, () async {
        final size = await local.length();
        return db.transferAdd(
          kind: TransferKind.upload,
          label: label,
          localPath: local.path,
          destPath: destPath,
          size: size,
        );
      }, sizeOf: () => local.length());
      return queue.add(task);
    }();
    return (task, done);
  }

  Future<void> _runUpload(File local, String destPath, ProgressReporter report) async {
    if (!await local.exists()) {
      throw FileSystemException('File không tồn tại — thử chọn lại', local.path);
    }
    final sha = await _sha256Of(local);
    final fileSize = await local.length();
    final entry = VaultEntry(
      messageId: 0,
      path: destPath,
      size: fileSize,
      sha256: sha,
      mtime: DateTime.now().toUtc(),
    );
    channel.markUploadPath(destPath);
    int? tempId;
    int? messageId;
    try {
      final sent = await td.send({
        '@type': 'sendMessage',
        'chat_id': chatId,
        'input_message_content': inputMessageDocument(
          filePath: local.path,
          captionText: encodeCaption(entry),
          legacyApi: legacyTdApi,
          disableContentTypeDetection: shouldDisableContentTypeDetection(local.path),
        ),
      });
      tempId = _tdId(sent['id'] ?? (sent['message'] as Map?)?['id']);
      if (tempId < 0) {
        throw StateError('sendMessage không trả message id');
      }
      channel.markUploadPending(tempId);
      final uploadFileId = channel.tdFileIdFromMessage(
        (sent['message'] as Map<String, dynamic>?) ?? sent as Map<String, dynamic>,
      );
      messageId = await _awaitUploadComplete(
        tempId,
        report,
        totalBytes: fileSize,
        uploadFileId: uploadFileId,
      );
      final msg = await td.send({
        '@type': 'getMessage',
        'chat_id': chatId,
        'message_id': messageId,
      }) as Map<String, dynamic>;
      final indexed = channel.entryFromMessage(msg);
      if (indexed != null) {
        await db.upsert(indexed);
        channel.changes.add(null);
      }
    } finally {
      channel.clearUploadPath(destPath);
      channel.clearUploadPending(tempId, messageId);
    }
  }

  Future<int> _awaitUploadComplete(
    int tempMessageId,
    ProgressReporter report, {
    required int totalBytes,
    int? uploadFileId,
  }) async {
    final completer = Completer<int>();
    var realMessageId = 0;
    var uploadComplete = false;

    StreamSubscription<Map<String, dynamic>>? sub;

    void tryFinish() {
      if (realMessageId > 0 && uploadComplete && !completer.isCompleted) {
        sub?.cancel();
        report(1, bytesDone: totalBytes, bytesTotal: totalBytes);
        completer.complete(realMessageId);
      }
    }

    sub = td.updates.listen((u) {
      switch (u['@type']) {
        case 'updateFile':
          final file = u['file'] as Map<String, dynamic>;
          if (uploadFileId != null && _tdId(file['id']) != uploadFileId) break;
          final remote = file['remote'] as Map<String, dynamic>? ?? const {};
          final size = (file['size'] as num?)?.toDouble() ?? totalBytes.toDouble();
          final up = (remote['uploaded_size'] as num?)?.toDouble() ?? 0;
          if (size > 0) {
            report((up / size).clamp(0, 1), bytesDone: up.round(), bytesTotal: size.round());
          }
          if (remote['is_uploading_completed'] == true) {
            uploadComplete = true;
            tryFinish();
          }
        case 'updateMessageSendSucceeded':
          if (_tdId(u['old_message_id']) == tempMessageId) {
            final msg = u['message'] as Map<String, dynamic>? ?? const {};
            realMessageId = _tdId(msg['id']);
            tryFinish();
          }
        case 'updateMessageSendFailed':
          if (_tdId(u['old_message_id']) == tempMessageId) {
            sub?.cancel();
            if (!completer.isCompleted) {
              final err = u['error'] as Map<String, dynamic>?;
              completer.completeError(Exception(
                err?['message'] as String? ?? u['error_message'] as String? ?? 'Gửi Telegram thất bại',
              ));
            }
          }
      }
    });
    return completer.future.timeout(
      const Duration(minutes: 30),
      onTimeout: () {
        sub?.cancel();
        throw TimeoutException('Upload timeout — kiểm tra kết nối mạng');
      },
    );
  }

  (TransferTask, Future<void>) enqueueDownload(VaultEntry entry) {
    final task = TransferTask(
      id: 'down:${entry.messageId}',
      kind: TransferKind.download,
      label: entry.name,
      messageId: entry.messageId,
      totalBytes: entry.size,
      run: (report) => _runDownload(entry, report),
    );
    final done = () async {
      await _bindPersistedTransfer(task, () async {
        return db.transferAdd(
          kind: TransferKind.download,
          label: entry.name,
          messageId: entry.messageId,
          size: entry.size,
        );
      }, sizeOf: () async => entry.size);
      return queue.add(task);
    }();
    return (task, done);
  }

  Future<void> _runDownload(VaultEntry entry, ProgressReporter report) async {
    final msg = await td.send({'@type': 'getMessage', 'chat_id': chatId, 'message_id': entry.messageId});
    final fileId = channel.tdFileIdFromMessage(msg);
    if (fileId == null) throw Exception('message has no document');
    await db.setTdFileId(entry.messageId, fileId);

    final fileInfo = await td.send({'@type': 'getFile', 'file_id': fileId});
    final cached = fileInfo['local'] as Map<String, dynamic>? ?? const {};
    final totalBytes = (fileInfo['size'] as num?)?.toInt() ?? entry.size;
    if (cached['is_downloading_completed'] == true) {
      final path = cached['path'] as String?;
      if (path != null && path.isNotEmpty) {
        await _verifyLocalSha256(File(path), entry.sha256);
        await db.setLocalPath(entry.messageId, path);
        report(1, bytesDone: totalBytes, bytesTotal: totalBytes);
        return;
      }
    }

    final completer = Completer<String>();
    late StreamSubscription sub;
    sub = td.updates.listen((u) {
      if (u['@type'] != 'updateFile') return;
      final file = u['file'] as Map<String, dynamic>;
      if (_tdId(file['id']) != fileId) return;
      final local = file['local'] as Map<String, dynamic>? ?? const {};
      final size = (file['size'] as num?)?.toDouble() ?? totalBytes.toDouble();
      final got = (local['downloaded_size'] as num?)?.toDouble() ?? 0;
      if (size > 0) {
        report((got / size).clamp(0, 1), bytesDone: got.round(), bytesTotal: size.round());
      }
      if (local['is_downloading_completed'] == true) {
        sub.cancel();
        if (!completer.isCompleted) completer.complete(local['path'] as String);
      }
    });
    await td.send({'@type': 'downloadFile', 'file_id': fileId, 'priority': 1, 'synchronous': false});
    final path = await completer.future.timeout(
      const Duration(minutes: 30),
      onTimeout: () {
        sub.cancel();
        throw TimeoutException('Download timeout');
      },
    );
    await _verifyLocalSha256(File(path), entry.sha256);
    await db.setLocalPath(entry.messageId, path);
    report(1, bytesDone: totalBytes, bytesTotal: totalBytes);
  }

  Future<void> _bindPersistedTransfer(
    TransferTask task,
    Future<int> Function() persist,
    {required FutureOr<int> Function() sizeOf}
  ) async {
    task.totalBytes = await sizeOf();
    task.persistId = await persist();
  }

  Future<void> restorePendingTransfers({required bool autoStart}) async {
    final pending = await db.transfersPending();
    for (final p in pending) {
      if (p.status == 'running') await db.transferUpdate(p.id, status: 'queued');

      if (p.kind == TransferKind.upload) {
        final localPath = p.localPath;
        final destPath = p.destPath;
        if (localPath == null || destPath == null) {
          await db.transferRemove(p.id);
          continue;
        }
        final local = File(localPath);
        if (!await local.exists()) {
          await db.transferUpdate(p.id, status: 'failed', error: 'File không tồn tại — thử chọn lại');
          queue.restorePaused(_taskFromPending(p, status: TransferStatus.failed));
          continue;
        }
        if (await _isUploadAlreadyOnVault(p)) {
          await db.transferRemove(p.id);
          continue;
        }
        final task = _taskFromPending(p,
            status: p.status == 'failed' ? TransferStatus.failed : TransferStatus.paused);
        queue.restorePaused(task);
        if (autoStart && p.status != 'failed') {
          await db.transferUpdate(p.id, status: 'queued');
          await queue.startTask(task);
        }
        continue;
      }

      if (p.kind == TransferKind.download && p.messageId != null) {
        final entry = (await db.getAll()).where((e) => e.messageId == p.messageId).firstOrNull;
        if (entry == null) {
          await db.transferRemove(p.id);
          continue;
        }
        if (await _isDownloadAlreadyComplete(entry)) {
          await db.transferRemove(p.id);
          continue;
        }
        final task = _taskFromPending(p,
            status: p.status == 'failed' ? TransferStatus.failed : TransferStatus.paused,
            entry: entry);
        queue.restorePaused(task);
        if (autoStart && p.status != 'failed') {
          await db.transferUpdate(p.id, status: 'queued');
          await queue.startTask(task);
        }
      }
    }
    final needsPanel = queue.tasks.any((t) =>
        t.status == TransferStatus.queued ||
        t.status == TransferStatus.running ||
        t.status == TransferStatus.paused ||
        t.status == TransferStatus.failed);
    if (!needsPanel) queue.clearFinished();
  }

  TransferTask _taskFromPending(
    PendingTransfer p, {
    required TransferStatus status,
    VaultEntry? entry,
  }) {
    final task = TransferTask(
      id: p.kind == TransferKind.upload ? 'up:${p.id}' : 'down:${p.messageId}',
      kind: p.kind,
      label: p.label,
      localPath: p.localPath,
      destPath: p.destPath,
      messageId: p.messageId,
      totalBytes: p.size,
      persistId: p.id,
      run: (_) async {},
    );
    task.status = status;
    if (p.error != null) task.error = p.error;
    if (p.kind == TransferKind.upload && p.localPath != null && p.destPath != null) {
      final local = File(p.localPath!);
      final dest = p.destPath!;
      task.run = (report) => _runUpload(local, dest, report);
    } else if (entry != null) {
      task.run = (report) => _runDownload(entry, report);
    }
    return task;
  }

  void retryTransfer(TransferTask task) {
    queue.removeTask(task.id);
    if (task.persistId != null) unawaited(db.transferRemove(task.persistId!));

    if (task.kind == TransferKind.upload &&
        task.localPath != null &&
        task.destPath != null) {
      enqueueUpload(File(task.localPath!), task.destPath!);
      return;
    }
    if (task.kind == TransferKind.download && task.messageId != null) {
      db.getAll().then((all) {
        final entry = all.where((e) => e.messageId == task.messageId).firstOrNull;
        if (entry != null) enqueueDownload(entry);
      });
    }
  }

  void resumeTransfer(TransferTask task) {
    if (task.persistId != null) {
      unawaited(db.transferUpdate(task.persistId!, status: 'queued'));
    }
    unawaited(queue.startTask(task));
  }
}
