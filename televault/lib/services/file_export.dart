import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

import '../models/vault_entry.dart';
import 'index_db.dart';
import 'save_as_access.dart';
import 'transfer_service.dart';
import 'vault_service.dart';

class FolderExportResult {
  final int saved;
  final int failed;
  final String destRoot;
  const FolderExportResult(this.saved, this.failed, this.destRoot);
}

/// Mọi file (không gồm marker thư mục) trong [folderPrefix] và cây con.
List<VaultEntry> filesInVaultFolder(List<VaultEntry> all, String folderPrefix) {
  assert(folderPrefix.endsWith('/'));
  return all.where((e) => !e.isDir && e.path.startsWith(folderPrefix)).toList()
    ..sort((a, b) => a.path.compareTo(b.path));
}

String folderExportName(String folderPrefix) {
  assert(folderPrefix.endsWith('/'));
  final trimmed = folderPrefix.substring(0, folderPrefix.length - 1);
  if (trimmed.isEmpty || trimmed == '/') return 'Kho';
  return trimmed.substring(trimmed.lastIndexOf('/') + 1);
}

/// Tránh ghi đè file đã có (chỉ kiểm tra basename trong thư mục đích).
String uniqueDestPath(String dir, String name) {
  var dest = p.join(dir, name);
  if (!File(dest).existsSync()) return dest;
  final dot = name.lastIndexOf('.');
  final stem = dot > 0 ? name.substring(0, dot) : name;
  final ext = dot > 0 ? name.substring(dot) : '';
  for (var i = 1; i < 1000; i++) {
    dest = p.join(dir, '$stem ($i)$ext');
    if (!File(dest).existsSync()) return dest;
  }
  return p.join(dir, '${stem}_${DateTime.now().millisecondsSinceEpoch}$ext');
}

Future<({String dir, String? bookmark})?> resolveSaveAsDirectory(IndexDb db) async {
  var dir = await db.getSaveAsDirectory();
  var bookmark = await db.getSaveAsBookmark();
  if (dir == null || dir.isEmpty) {
    dir = await FilePicker.getDirectoryPath(dialogTitle: 'Chọn thư mục Save as');
    if (dir == null) return null;
    bookmark = await SaveAsAccess.createBookmark(dir);
    await db.setSaveAsDirectory(dir, bookmark: bookmark);
  }
  return (dir: dir, bookmark: bookmark);
}

Future<String> _ensureLocalPath(
  VaultService vault,
  VaultEntry entry, {
  void Function(TransferTask task, Future<void> done)? onDownloading,
}) async {
  var localPath = await vault.readLocalPath(entry.messageId);
  if (localPath == null || !File(localPath).existsSync()) {
    final (task, done) = vault.enqueueDownload(entry);
    onDownloading?.call(task, done);
    await done;
    localPath = await vault.readLocalPath(entry.messageId);
  }
  if (localPath == null || !File(localPath).existsSync()) {
    throw StateError('Không tải được ${entry.name}');
  }
  return localPath;
}

Future<String> copyToSaveAsRelative({
  required String localPath,
  required String saveAsDir,
  required String relativePath,
  String? bookmark,
}) async {
  if (Platform.isMacOS && bookmark != null && bookmark.isNotEmpty) {
    try {
      return await SaveAsAccess.exportWithBookmark(
        bookmarkBase64: bookmark,
        sourcePath: localPath,
        relativePath: relativePath,
      );
    } on PlatformException catch (e) {
      final msg = e.message ?? e.code;
      if (msg.contains('hết hạn') || msg.contains('Bookmark')) {
        throw StateError('$msg — mở Cài đặt → Save as và chọn lại thư mục');
      }
      rethrow;
    }
  }

  final destDir = p.dirname(relativePath) == '.'
      ? saveAsDir
      : p.join(saveAsDir, p.dirname(relativePath));
  Directory(destDir).createSync(recursive: true);
  final dest = uniqueDestPath(destDir, p.basename(relativePath));
  try {
    await File(localPath).copy(dest);
    return dest;
  } on FileSystemException {
    final viaDialog = await SaveAsAccess.saveViaDialog(localPath, p.basename(relativePath));
    if (viaDialog != null) return viaDialog;
    throw StateError(
      'Không ghi được ra "$saveAsDir". '
      'Trên macOS hãy chọn lại thư mục Save as trong Cài đặt (ổ ngoài cần chọn qua hộp thoại).',
    );
  }
}

/// Tải (nếu cần) rồi copy file ra thư mục Save as trong Cài đặt.
Future<String?> exportVaultEntry({
  required IndexDb db,
  required VaultService vault,
  required VaultEntry entry,
  void Function(TransferTask task, Future<void> done)? onDownloading,
}) async {
  final target = await resolveSaveAsDirectory(db);
  if (target == null) return null;

  final localPath = await _ensureLocalPath(vault, entry, onDownloading: onDownloading);
  return copyToSaveAsRelative(
    localPath: localPath,
    saveAsDir: target.dir,
    relativePath: entry.name,
    bookmark: target.bookmark,
  );
}

/// Tải và lưu mọi file trong folder ảo (giữ cấu trúc con).
Future<FolderExportResult?> exportVaultFolder({
  required IndexDb db,
  required VaultService vault,
  required String folderPrefix,
  void Function(int current, int total, String fileName)? onProgress,
  void Function(TransferTask task, Future<void> done)? onDownloading,
}) async {
  assert(folderPrefix.endsWith('/'));
  final files = filesInVaultFolder(await db.getAll(), folderPrefix);
  if (files.isEmpty) {
    throw StateError('Thư mục không có file để lưu');
  }

  final target = await resolveSaveAsDirectory(db);
  if (target == null) return null;

  final rootName = folderExportName(folderPrefix);
  final destRoot = p.join(target.dir, rootName);
  var saved = 0;
  var failed = 0;

  for (var i = 0; i < files.length; i++) {
    final entry = files[i];
    onProgress?.call(i + 1, files.length, entry.name);
    try {
      final localPath = await _ensureLocalPath(vault, entry, onDownloading: onDownloading);
      final relUnderFolder = entry.path.substring(folderPrefix.length);
      final relativePath = p.join(rootName, relUnderFolder);
      await copyToSaveAsRelative(
        localPath: localPath,
        saveAsDir: target.dir,
        relativePath: relativePath,
        bookmark: target.bookmark,
      );
      saved++;
    } catch (_) {
      failed++;
    }
  }

  return FolderExportResult(saved, failed, destRoot);
}
