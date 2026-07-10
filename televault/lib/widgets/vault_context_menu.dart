import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import 'vault_menu_items.dart';

enum VaultContextAction { newFolder, uploadFile, uploadFolder }

enum VaultFileContextAction { download, move, delete, restore }

Future<VaultFileContextAction?> showVaultFileContextMenu(
  BuildContext context, {
  required Offset globalPosition,
  required bool inTrash,
  required int selectionCount,
}) async {
  final s = context.read<AppSettingsProvider>().labels;
  final suffix = selectionCount > 1 ? ' ($selectionCount)' : '';

  if (inTrash) {
    return showMenu<VaultFileContextAction>(
      context: context,
      position: RelativeRect.fromLTRB(
        globalPosition.dx,
        globalPosition.dy,
        globalPosition.dx + 1,
        globalPosition.dy + 1,
      ),
      items: [
        vaultPopupMenuItem(
          value: VaultFileContextAction.restore,
          icon: Icons.restore_from_trash_outlined,
          label: '${s['action_restore']!}$suffix',
        ),
        vaultPopupMenuItem(
          value: VaultFileContextAction.delete,
          icon: Icons.delete_forever_outlined,
          label: '${s['action_delete_forever']!}$suffix',
        ),
      ],
    );
  }

  return showMenu<VaultFileContextAction>(
    context: context,
    position: RelativeRect.fromLTRB(
      globalPosition.dx,
      globalPosition.dy,
      globalPosition.dx + 1,
      globalPosition.dy + 1,
    ),
    items: [
      vaultPopupMenuItem(
        value: VaultFileContextAction.download,
        icon: Icons.download_outlined,
        label: '${s['action_download']!}$suffix',
      ),
      vaultPopupMenuItem(
        value: VaultFileContextAction.move,
        icon: Icons.drive_file_move_outline,
        label: '${s['action_move']!}$suffix',
      ),
      vaultPopupMenuItem(
        value: VaultFileContextAction.delete,
        icon: Icons.delete_outline,
        label: '${s['action_trash']!}$suffix',
      ),
    ],
  );
}

Future<void> showVaultContextMenu(
  BuildContext context, {
  required Offset globalPosition,
  required void Function(VaultContextAction action) onAction,
}) async {
  final s = context.read<AppSettingsProvider>().labels;
  final selected = await showMenu<VaultContextAction>(
    context: context,
    position: RelativeRect.fromLTRB(
      globalPosition.dx,
      globalPosition.dy,
      globalPosition.dx + 1,
      globalPosition.dy + 1,
    ),
    items: [
      vaultPopupMenuItem(
        value: VaultContextAction.newFolder,
        icon: Icons.create_new_folder_outlined,
        label: s['ctx_new_folder']!,
      ),
      vaultPopupMenuItem(
        value: VaultContextAction.uploadFile,
        icon: Icons.upload_file,
        label: s['ctx_upload_file']!,
      ),
      vaultPopupMenuItem(
        value: VaultContextAction.uploadFolder,
        icon: Icons.drive_folder_upload_outlined,
        label: s['ctx_upload_folder']!,
      ),
    ],
  );
  if (selected != null && context.mounted) {
    onAction(selected);
  }
}

/// Bọc vùng nội dung vault — chuột phải mở menu (desktop).
class VaultContextMenuRegion extends StatelessWidget {
  final Widget child;
  final void Function(VaultContextAction action) onAction;
  final bool enabled;

  const VaultContextMenuRegion({
    super.key,
    required this.child,
    required this.onAction,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onSecondaryTapUp: enabled
          ? (details) => showVaultContextMenu(
                context,
                globalPosition: details.globalPosition,
                onAction: onAction,
              )
          : null,
      child: child,
    );
  }
}
