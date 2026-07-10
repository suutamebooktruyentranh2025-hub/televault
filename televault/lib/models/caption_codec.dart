import 'dart:convert';

import 'vault_entry.dart';

const int captionVersion = 1;

String encodeCaption(VaultEntry e) {
  if (e.isDir) {
    return jsonEncode({
      'v': captionVersion,
      'dir': e.path,
      if (e.tags.isNotEmpty) 'tags': e.tags,
    });
  }
  return jsonEncode({
    'v': captionVersion,
    'path': e.path,
    'size': e.size,
    'sha256': e.sha256,
    'mtime': e.mtime.toUtc().toIso8601String(),
  });
}

/// Trả null nếu caption không phải metadata hợp lệ của app (không throw).
VaultEntry? decodeCaption(int messageId, String caption) {
  Map<String, dynamic> m;
  try {
    final d = jsonDecode(caption);
    if (d is! Map<String, dynamic>) return null;
    m = d;
  } catch (_) {
    return null;
  }
  if (m['v'] != captionVersion) return null;

  final dir = m['dir'];
  if (dir is String && dir.startsWith('/') && dir.endsWith('/')) {
    final tagsRaw = m['tags'];
    return VaultEntry.dirMarker(
      messageId: messageId,
      path: dir,
      tags: tagsRaw is List ? tagsRaw.whereType<String>().toList() : const [],
    );
  }

  final path = m['path'];
  if (path is! String || !path.startsWith('/') || path.endsWith('/')) return null;
  final mtimeRaw = m['mtime'];
  final mtime = mtimeRaw is String ? DateTime.tryParse(mtimeRaw) : null;
  if (mtime == null) return null;
  final sizeRaw = m['size'];
  final shaRaw = m['sha256'];
  final tagsRaw = m['tags'];
  return VaultEntry(
    messageId: messageId,
    path: path,
    size: sizeRaw is num ? sizeRaw.toInt() : 0,
    sha256: shaRaw is String ? shaRaw : '',
    mtime: mtime.toUtc(),
    tags: tagsRaw is List ? tagsRaw.whereType<String>().toList() : const [],
  );
}
