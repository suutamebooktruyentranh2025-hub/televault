import '../models/vault_entry.dart';

const maxTagLen = 50;

List<String> normalizeFolderTags(List<String> tags) {
  final out = <String>[];
  final seen = <String>{};
  for (final raw in tags) {
    final t = raw.trim();
    if (t.isEmpty) continue;
    if (t.contains(',')) {
      throw ArgumentError('Tag cannot contain comma');
    }
    if (t.length > maxTagLen) {
      throw ArgumentError('Tag too long');
    }
    if (seen.contains(t)) continue;
    seen.add(t);
    out.add(t);
  }
  return out;
}

/// Mọi thư mục tổ tiên của [filePath] (không gồm `/`).
Iterable<String> ancestorFolderPaths(String filePath) sync* {
  assert(filePath.startsWith('/') && !filePath.endsWith('/'));
  var folder = filePath.substring(0, filePath.lastIndexOf('/') + 1);
  while (folder != '/') {
    yield folder;
    final trimmed = folder.substring(0, folder.length - 1);
    folder = trimmed.substring(0, trimmed.lastIndexOf('/') + 1);
  }
}

/// Tag gắn trên folder marker / folder_tags — file kế thừa từ mọi folder tổ tiên.
List<String> effectiveTagsForPath(String filePath, Map<String, List<String>> folderTagsByPath) {
  final tags = <String>{};
  for (final folder in ancestorFolderPaths(filePath)) {
    tags.addAll(folderTagsByPath[folder] ?? const []);
  }
  return tags.toList()..sort();
}

List<String> effectiveTagsForEntry(VaultEntry entry, Map<String, List<String>> folderTagsByPath) {
  if (entry.isDir) return List<String>.from(folderTagsByPath[entry.path] ?? entry.tags);
  return effectiveTagsForPath(entry.path, folderTagsByPath);
}

Map<String, List<String>> buildFolderTagsIndex(Map<String, List<String>> folderTagsByPath) =>
    folderTagsByPath;
