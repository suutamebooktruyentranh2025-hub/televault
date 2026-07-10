import 'vault_entry.dart';
import '../utils/trash.dart';

enum VaultSortField { name, mtime, size }

enum SortDirection { ascending, descending }

class FolderListing {
  final List<String> folders; // tên thư mục con, đã sort
  final List<VaultEntry> files; // file trực tiếp, sort theo tên
  const FolderListing(this.folders, this.files);
}

/// [folder] luôn kết thúc '/'. Trả về nội dung trực tiếp của thư mục đó.
FolderListing listFolder(List<VaultEntry> all, String folder) {
  assert(folder.endsWith('/'));
  final folders = <String>{};
  final files = <VaultEntry>[];
  for (final e in all) {
    if (!e.path.startsWith(folder) || e.path == folder) continue;
    final rest = e.path.substring(folder.length);
    final slash = rest.indexOf('/');
    if (slash == -1) {
      files.add(e); // file trực tiếp
    } else {
      final name = rest.substring(0, slash);
      if (folder == '/' && name == kTrashFolderName) continue;
      folders.add(name); // con gián tiếp -> chỉ lấy tên thư mục con cấp 1
    }
  }
  final sortedFolders = folders.toList()..sort();
  files.sort((a, b) => a.name.compareTo(b.name));
  return FolderListing(sortedFolders, files);
}

DateTime folderMtime(List<VaultEntry> all, String folderPath) {
  DateTime? latest;
  VaultEntry? marker;
  for (final e in all) {
    if (e.path == folderPath && e.isDir) marker = e;
    if (e.path.startsWith(folderPath) && e.path != folderPath && !e.isDir) {
      if (latest == null || e.mtime.isAfter(latest)) latest = e.mtime;
    }
  }
  return latest ?? marker?.mtime ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
}

int folderSize(List<VaultEntry> all, String folderPath) {
  var total = 0;
  for (final e in all) {
    if (e.path.startsWith(folderPath) && e.path != folderPath && !e.isDir) {
      total += e.size;
    }
  }
  return total;
}

int _compareByDirection<T extends Comparable<T>>(T a, T b, SortDirection direction) {
  final c = a.compareTo(b);
  return direction == SortDirection.ascending ? c : -c;
}

FolderListing sortFolderListing(
  FolderListing listing,
  List<VaultEntry> all,
  String currentFolder, {
  required VaultSortField field,
  required SortDirection direction,
}) {
  final folders = [...listing.folders];
  final files = [...listing.files];

  switch (field) {
    case VaultSortField.name:
      folders.sort((a, b) => _compareByDirection(a, b, direction));
      files.sort((a, b) => _compareByDirection(a.name, b.name, direction));
    case VaultSortField.mtime:
      folders.sort((a, b) => _compareByDirection(
            folderMtime(all, '$currentFolder$a/'),
            folderMtime(all, '$currentFolder$b/'),
            direction,
          ));
      files.sort((a, b) => _compareByDirection(a.mtime, b.mtime, direction));
    case VaultSortField.size:
      folders.sort((a, b) => _compareByDirection(
            folderSize(all, '$currentFolder$a/'),
            folderSize(all, '$currentFolder$b/'),
            direction,
          ));
      files.sort((a, b) => _compareByDirection(a.size, b.size, direction));
  }

  return FolderListing(folders, files);
}

List<VaultEntry> sortVaultEntries(
  List<VaultEntry> entries, {
  required VaultSortField field,
  required SortDirection direction,
}) {
  final files = [...entries];
  switch (field) {
    case VaultSortField.name:
      files.sort((a, b) => _compareByDirection(a.name, b.name, direction));
    case VaultSortField.mtime:
      files.sort((a, b) => _compareByDirection(a.mtime, b.mtime, direction));
    case VaultSortField.size:
      files.sort((a, b) => _compareByDirection(a.size, b.size, direction));
  }
  return files;
}

/// Một dòng trong cây thư mục (browser expand/collapse).
sealed class VaultTreeRow {
  const VaultTreeRow(this.depth);
  final int depth;
}

class VaultTreeFolderRow extends VaultTreeRow {
  final String path;
  final String name;
  final bool hasChildren;
  final bool expanded;
  const VaultTreeFolderRow({
    required int depth,
    required this.path,
    required this.name,
    required this.hasChildren,
    required this.expanded,
  }) : super(depth);
}

class VaultTreeFileRow extends VaultTreeRow {
  final VaultEntry entry;
  const VaultTreeFileRow({required int depth, required this.entry}) : super(depth);
}

bool folderHasContents(List<VaultEntry> all, String folderPath) {
  final listing = listFolder(all, folderPath);
  return listing.folders.isNotEmpty || listing.files.any((e) => !e.isDir);
}

/// Duyệt cây theo trạng thái [expanded] (path folder đang mở).
List<VaultTreeRow> buildVisibleTreeRows(List<VaultEntry> all, Set<String> expanded) {
  final rows = <VaultTreeRow>[];

  void walk(String folderPath, int depth) {
    final listing = listFolder(all, folderPath);
    for (final name in listing.folders) {
      final path = '$folderPath$name/';
      final hasChildren = folderHasContents(all, path);
      final isExpanded = expanded.contains(path);
      rows.add(VaultTreeFolderRow(
        depth: depth,
        path: path,
        name: name,
        hasChildren: hasChildren,
        expanded: isExpanded,
      ));
      if (isExpanded) walk(path, depth + 1);
    }
    for (final file in listing.files) {
      if (!file.isDir) rows.add(VaultTreeFileRow(depth: depth, entry: file));
    }
  }

  walk('/', 0);
  return rows;
}
