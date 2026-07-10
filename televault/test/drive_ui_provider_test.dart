import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/vault_tree.dart';
import 'package:televault/providers/drive_ui_provider.dart';

void main() {
  test('selectOnly replaces selection', () {
    final ui = DriveUiProvider();
    ui.selectOnly(1);
    ui.toggleSelected(2);
    ui.selectOnly(3);
    expect(ui.selectedMessageIds, {3});
    expect(ui.lastSelectedMessageId, 3);
  });

  test('selectRange adds contiguous ids', () {
    final ui = DriveUiProvider();
    ui.selectOnly(10);
    ui.selectRange([10, 11, 12, 13], 10, 12);
    expect(ui.selectedMessageIds, {10, 11, 12});
  });

  test('setSort toggles direction on same field', () {
    final ui = DriveUiProvider();
    expect(ui.sortField, VaultSortField.name);
    expect(ui.sortDirection, SortDirection.ascending);
    ui.setSort(VaultSortField.name);
    expect(ui.sortDirection, SortDirection.descending);
    ui.setSort(VaultSortField.name);
    expect(ui.sortDirection, SortDirection.ascending);
  });

  test('setSort resets direction on new field', () {
    final ui = DriveUiProvider();
    ui.setSort(VaultSortField.size);
    ui.setSort(VaultSortField.size);
    ui.setSort(VaultSortField.mtime);
    expect(ui.sortField, VaultSortField.mtime);
    expect(ui.sortDirection, SortDirection.ascending);
  });

  test('toggleViewMode switches list and grid', () {
    final ui = DriveUiProvider();
    expect(ui.viewMode, VaultViewMode.list);
    ui.toggleViewMode();
    expect(ui.viewMode, VaultViewMode.grid);
    ui.toggleViewMode();
    expect(ui.viewMode, VaultViewMode.list);
  });

  test('clearSelection resets state', () {
    final ui = DriveUiProvider();
    ui.selectOnly(5);
    ui.clearSelection();
    expect(ui.selectedMessageIds, isEmpty);
    expect(ui.lastSelectedMessageId, isNull);
  });
}
