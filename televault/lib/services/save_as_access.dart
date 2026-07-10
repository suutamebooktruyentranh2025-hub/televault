import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';

/// macOS sandbox: thư mục Save as (đặc biệt ổ ngoài) cần security-scoped bookmark.
class SaveAsAccess {
  static const _channel = MethodChannel('com.televault.televault/save_as');

  static Future<String?> createBookmark(String directoryPath) async {
    if (!Platform.isMacOS) return null;
    try {
      return await _channel.invokeMethod<String>('createBookmark', {'path': directoryPath});
    } on PlatformException {
      return null;
    }
  }

  /// Copy vào thư mục đã bookmark; [relativePath] có thể gồm subfolder.
  static Future<String> exportWithBookmark({
    required String bookmarkBase64,
    required String sourcePath,
    required String relativePath,
  }) async {
    final dest = await _channel.invokeMethod<String>('exportWithBookmark', {
      'bookmark': bookmarkBase64,
      'sourcePath': sourcePath,
      'relativePath': relativePath,
    });
    if (dest == null || dest.isEmpty) {
      throw StateError('Không ghi được file ra thư mục Save as');
    }
    return dest;
  }

  /// Hộp thoại Save (luôn có quyền ghi user-selected) — fallback khi bookmark thiếu/hết hạn.
  static Future<String?> saveViaDialog(String sourcePath, String fileName) async {
    final bytes = await File(sourcePath).readAsBytes();
    return FilePicker.saveFile(
      dialogTitle: 'Lưu file',
      fileName: fileName,
      bytes: bytes,
    );
  }
}
