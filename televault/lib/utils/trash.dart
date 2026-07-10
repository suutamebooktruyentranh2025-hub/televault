/// Thư mục rác — xoá thường chỉ chuyển vào đây; xoá trong Rác mới xoá Telegram.
const kTrashFolder = '/Rác/';

const kTrashFolderName = 'Rác';

bool isTrashFolder(String folderPath) => folderPath == kTrashFolder;

bool isInTrash(String path) => path.startsWith(kTrashFolder) && path != kTrashFolder;

String pathInTrash(String originalPath) {
  assert(originalPath.startsWith('/'));
  if (isInTrash(originalPath) || originalPath == kTrashFolder) return originalPath;
  return '$kTrashFolder${originalPath.substring(1)}';
}

/// Đường dẫn gốc trước khi vào Rác — `/Rác/a/b.txt` → `/a/b.txt`.
String pathFromTrash(String trashPath) {
  assert(isInTrash(trashPath));
  return '/${trashPath.substring(kTrashFolder.length)}';
}

/// Tránh trùng path khi nhiều file cùng tên trong Rác.
String uniqueVaultPath(String desired, Iterable<String> existingPaths) {
  final taken = existingPaths.toSet();
  if (!taken.contains(desired)) return desired;
  final dot = desired.lastIndexOf('.');
  final slash = desired.lastIndexOf('/');
  final hasExt = dot > slash;
  final stem = hasExt ? desired.substring(0, dot) : desired;
  final ext = hasExt ? desired.substring(dot) : '';
  for (var n = 1; n < 10_000; n++) {
    final candidate = '$stem ($n)$ext';
    if (!taken.contains(candidate)) return candidate;
  }
  throw StateError('Không tạo được tên duy nhất cho $desired');
}
