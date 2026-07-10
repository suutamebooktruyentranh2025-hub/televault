import 'package:flutter/foundation.dart';

import '../models/vault_tree.dart';

enum DriveSection { vault, tags }

enum VaultViewMode { list, grid }

class DriveUiProvider extends ChangeNotifier {
  DriveSection section = DriveSection.vault;
  VaultViewMode viewMode = VaultViewMode.list;
  VaultSortField sortField = VaultSortField.name;
  SortDirection sortDirection = SortDirection.ascending;
  bool uploadPanelExpanded = true;
  bool dragHover = false;
  String searchQuery = '';

  bool get isSearching => searchQuery.trim().isNotEmpty;

  final Set<int> selectedMessageIds = {};
  int? lastSelectedMessageId;

  bool isSelected(int messageId) => selectedMessageIds.contains(messageId);

  void selectOnly(int messageId) {
    selectedMessageIds
      ..clear()
      ..add(messageId);
    lastSelectedMessageId = messageId;
    notifyListeners();
  }

  void toggleSelected(int messageId) {
    if (selectedMessageIds.contains(messageId)) {
      selectedMessageIds.remove(messageId);
    } else {
      selectedMessageIds.add(messageId);
    }
    lastSelectedMessageId = messageId;
    notifyListeners();
  }

  void selectRange(List<int> orderedIds, int fromId, int toId) {
    final from = orderedIds.indexOf(fromId);
    final to = orderedIds.indexOf(toId);
    if (from < 0 || to < 0) {
      selectOnly(toId);
      return;
    }
    final lo = from < to ? from : to;
    final hi = from < to ? to : from;
    selectedMessageIds.addAll(orderedIds.sublist(lo, hi + 1));
    lastSelectedMessageId = toId;
    notifyListeners();
  }

  void clearSelection() {
    if (selectedMessageIds.isEmpty && lastSelectedMessageId == null) return;
    selectedMessageIds.clear();
    lastSelectedMessageId = null;
    notifyListeners();
  }

  void setSection(DriveSection value) {
    if (section == value) return;
    section = value;
    notifyListeners();
  }

  void setSearchQuery(String value) {
    if (searchQuery == value) return;
    searchQuery = value;
    notifyListeners();
  }

  void clearSearch() {
    if (searchQuery.isEmpty) return;
    searchQuery = '';
    notifyListeners();
  }

  void setViewMode(VaultViewMode value) {
    if (viewMode == value) return;
    viewMode = value;
    notifyListeners();
  }

  void toggleViewMode() {
    viewMode = viewMode == VaultViewMode.list ? VaultViewMode.grid : VaultViewMode.list;
    notifyListeners();
  }

  void setSort(VaultSortField field) {
    if (sortField == field) {
      sortDirection = sortDirection == SortDirection.ascending
          ? SortDirection.descending
          : SortDirection.ascending;
    } else {
      sortField = field;
      sortDirection = SortDirection.ascending;
    }
    notifyListeners();
  }

  void toggleUploadPanel() {
    uploadPanelExpanded = !uploadPanelExpanded;
    notifyListeners();
  }

  void setDragHover(bool value) {
    if (dragHover == value) return;
    dragHover = value;
    notifyListeners();
  }
}
