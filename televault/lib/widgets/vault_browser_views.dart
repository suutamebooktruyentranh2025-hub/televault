import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../models/vault_entry.dart';
import '../models/vault_tree.dart';
import '../utils/trash.dart';
import 'entry_tile.dart';
import 'vault_menu_items.dart';

String formatMtime(DateTime dt) => DateFormat.yMMMd().format(dt.toLocal());

List<PopupMenuEntry<String>> fileMenuItems({
  required bool inTrash,
  required Map<String, String> labels,
}) {
  if (inTrash) {
    return [
      vaultPopupMenuItem(value: 'restore', icon: Icons.restore_from_trash_outlined, label: labels['action_restore']!),
      vaultPopupMenuItem(value: 'delete', icon: Icons.delete_forever_outlined, label: labels['action_delete_forever']!),
    ];
  }
  return [
    vaultPopupMenuItem(value: 'preview', icon: Icons.visibility_outlined, label: labels['action_preview']!),
    vaultPopupMenuItem(value: 'rename', icon: Icons.drive_file_rename_outline, label: labels['action_rename']!),
    vaultPopupMenuItem(value: 'move', icon: Icons.drive_file_move_outline, label: labels['action_move']!),
    vaultPopupMenuItem(value: 'save', icon: Icons.download_outlined, label: labels['action_download']!),
    vaultPopupMenuItem(value: 'delete', icon: Icons.delete_outline, label: labels['action_trash']!),
  ];
}

class VaultFolderListRow extends StatelessWidget {
  final String name;
  final DateTime mtime;
  final int size;
  final VoidCallback onOpen;
  final Widget? trailing;
  final void Function(TapUpDetails details)? onSecondaryTapUp;

  const VaultFolderListRow({
    super.key,
    required this.name,
    required this.mtime,
    required this.size,
    required this.onOpen,
    this.trailing,
    this.onSecondaryTapUp,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onSecondaryTapUp: onSecondaryTapUp,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.folder, color: Colors.amber, size: 28),
              const SizedBox(width: 12),
              Expanded(
                flex: 5,
                child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyLarge),
              ),
              Expanded(
                flex: 2,
                child: Text(
                  _formatFolderMtime(mtime),
                  style: theme.textTheme.bodySmall,
                  textAlign: TextAlign.start,
                ),
              ),
              Expanded(
                flex: 1,
                child: Text(
                  size > 0 ? formatSize(size) : '—',
                  style: theme.textTheme.bodySmall,
                  textAlign: TextAlign.end,
                ),
              ),
              if (trailing != null) trailing!,
            ],
          ),
        ),
      ),
    );
  }
}

String _formatFolderMtime(DateTime dt) {
  if (dt.millisecondsSinceEpoch == 0) return '—';
  return formatMtime(dt);
}

class VaultFileListRow extends StatelessWidget {
  final VaultEntry entry;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;
  final void Function(TapUpDetails details) onSecondaryTapUp;
  final void Function(String action) onAction;

  const VaultFileListRow({
    super.key,
    required this.entry,
    required this.selected,
    required this.onTap,
    required this.onDoubleTap,
    required this.onSecondaryTapUp,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = selected ? theme.colorScheme.primaryContainer.withValues(alpha: 0.55) : null;
    return GestureDetector(
      onSecondaryTapUp: onSecondaryTapUp,
      child: Material(
        color: bg,
        child: InkWell(
          onTap: onTap,
          onDoubleTap: onDoubleTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Icon(
                  entry.localPath != null ? Icons.file_download_done : Icons.insert_drive_file_outlined,
                  size: 28,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 5,
                  child: Text(entry.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    formatMtime(entry.mtime),
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.start,
                  ),
                ),
                Expanded(
                  flex: 1,
                  child: Text(
                    formatSize(entry.size),
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.end,
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: onAction,
                  itemBuilder: (_) => fileMenuItems(
                    inTrash: isInTrash(entry.path),
                    labels: context.read<AppSettingsProvider>().labels,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class VaultFolderGridTile extends StatelessWidget {
  final String name;
  final VoidCallback onOpen;
  final Widget? menu;
  final void Function(TapUpDetails details)? onSecondaryTapUp;

  const VaultFolderGridTile({
    super.key,
    required this.name,
    required this.onOpen,
    this.menu,
    this.onSecondaryTapUp,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onSecondaryTapUp: onSecondaryTapUp,
      child: Material(
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onOpen,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.folder, color: Colors.amber, size: 40),
                    const Spacer(),
                    Text(name, maxLines: 2, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              if (menu != null)
                Positioned(top: 0, right: 0, child: menu!),
            ],
          ),
        ),
      ),
    );
  }
}

class VaultFileGridTile extends StatelessWidget {
  final VaultEntry entry;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onDoubleTap;
  final void Function(TapUpDetails details) onSecondaryTapUp;
  final void Function(String action) onAction;

  const VaultFileGridTile({
    super.key,
    required this.entry,
    required this.selected,
    required this.onTap,
    required this.onDoubleTap,
    required this.onSecondaryTapUp,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = selected
        ? theme.colorScheme.primaryContainer.withValues(alpha: 0.55)
        : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35);
    return GestureDetector(
      onSecondaryTapUp: onSecondaryTapUp,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          onDoubleTap: onDoubleTap,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      entry.localPath != null ? Icons.file_download_done : Icons.insert_drive_file_outlined,
                      size: 40,
                      color: theme.colorScheme.primary,
                    ),
                    const Spacer(),
                    Text(entry.name, maxLines: 2, overflow: TextOverflow.ellipsis),
                    Text(formatSize(entry.size), style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              Positioned(
                top: 0,
                right: 0,
                child: PopupMenuButton<String>(
                  onSelected: onAction,
                  itemBuilder: (_) => fileMenuItems(
                    inTrash: isInTrash(entry.path),
                    labels: context.read<AppSettingsProvider>().labels,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class VaultListHeader extends StatelessWidget {
  final VaultSortField sortField;
  final SortDirection sortDirection;
  final void Function(VaultSortField field) onSort;
  final Map<String, String> labels;

  const VaultListHeader({
    super.key,
    required this.sortField,
    required this.sortDirection,
    required this.onSort,
    required this.labels,
  });

  Widget _headerCell(
    BuildContext context, {
    required String label,
    required VaultSortField field,
    required TextAlign align,
    required int flex,
  }) {
    final theme = Theme.of(context);
    final active = sortField == field;
    final arrow = sortDirection == SortDirection.ascending ? Icons.arrow_upward : Icons.arrow_downward;
    final style = theme.textTheme.bodyMedium?.copyWith(
      color: active ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
      fontWeight: active ? FontWeight.w600 : FontWeight.w500,
    );
    return Expanded(
      flex: flex,
      child: InkWell(
        onTap: () => onSort(field),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(
            mainAxisAlignment: align == TextAlign.end ? MainAxisAlignment.end : MainAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(child: Text(label, style: style, textAlign: align, overflow: TextOverflow.ellipsis)),
              if (active) Icon(arrow, size: 16, color: theme.colorScheme.primary),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
      child: Row(
        children: [
          _headerCell(context, label: labels['col_name']!, field: VaultSortField.name, align: TextAlign.start, flex: 5),
          _headerCell(context, label: labels['col_mtime']!, field: VaultSortField.mtime, align: TextAlign.start, flex: 2),
          _headerCell(context, label: labels['col_size']!, field: VaultSortField.size, align: TextAlign.end, flex: 1),
          const SizedBox(width: 48),
        ],
      ),
    );
  }
}

bool vaultMultiSelectModifierPressed() {
  final keys = HardwareKeyboard.instance.logicalKeysPressed;
  return keys.contains(LogicalKeyboardKey.controlLeft) ||
      keys.contains(LogicalKeyboardKey.controlRight) ||
      keys.contains(LogicalKeyboardKey.metaLeft) ||
      keys.contains(LogicalKeyboardKey.metaRight);
}

bool vaultRangeSelectModifierPressed() {
  final keys = HardwareKeyboard.instance.logicalKeysPressed;
  return keys.contains(LogicalKeyboardKey.shiftLeft) ||
      keys.contains(LogicalKeyboardKey.shiftRight);
}
