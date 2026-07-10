import 'package:flutter/foundation.dart';

import '../models/vault_entry.dart';
import '../models/vault_tree.dart';
import '../services/index_db.dart';

class VaultProvider extends ChangeNotifier {
  final IndexDb db;
  String currentFolder = '/';
  List<VaultEntry> _all = [];
  FolderListing listing = const FolderListing([], []);
  final expandedFolders = <String>{};

  VaultProvider(this.db);

  List<VaultEntry> get allEntries => _all;

  List<String> get breadcrumbs =>
      ['/', ...currentFolder.split('/').where((s) => s.isNotEmpty)];

  List<VaultTreeRow> get treeRows => buildVisibleTreeRows(_all, expandedFolders);

  void toggleFolderExpanded(String folderPath) {
    if (expandedFolders.contains(folderPath)) {
      expandedFolders.remove(folderPath);
    } else {
      expandedFolders.add(folderPath);
    }
    notifyListeners();
  }

  void expandAll() {
    expandedFolders
      ..clear()
      ..addAll(_allFolderPaths(_all));
    notifyListeners();
  }

  static Set<String> _allFolderPaths(List<VaultEntry> all) {
    final paths = <String>{};
    for (final e in all) {
      if (e.isDir) paths.add(e.path);
      var path = e.parent;
      while (path != '/') {
        paths.add(path);
        final trimmed = path.substring(0, path.length - 1);
        path = trimmed.substring(0, trimmed.lastIndexOf('/') + 1);
      }
    }
    return paths;
  }

  void collapseAll() {
    expandedFolders.clear();
    notifyListeners();
  }

  Future<void> refresh() async {
    _all = await db.getAll();
    listing = listFolder(_all, currentFolder);
    notifyListeners();
  }

  FolderListing sortedListing(VaultSortField field, SortDirection direction) {
    return sortFolderListing(listing, _all, currentFolder, field: field, direction: direction);
  }

  Future<void> openFolder(String name) async {
    currentFolder = '$currentFolder$name/';
    await refresh();
  }

  Future<void> goUp() async {
    if (currentFolder == '/') return;
    final trimmed = currentFolder.substring(0, currentFolder.length - 1);
    currentFolder = trimmed.substring(0, trimmed.lastIndexOf('/') + 1);
    await refresh();
  }

  Future<void> goTo(String folder) async {
    currentFolder = folder;
    await refresh();
  }
}
