import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../providers/app_settings_provider.dart';
import 'vault_menu_items.dart';

String formatSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}

class EntryTile extends StatelessWidget {
  final VaultEntry entry;
  final List<String>? displayTags;
  final VoidCallback onTap;
  final void Function(String action) onAction;

  const EntryTile({
    super.key,
    required this.entry,
    this.displayTags,
    required this.onTap,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(entry.localPath != null ? Icons.file_download_done : Icons.insert_drive_file_outlined),
      title: Text(entry.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Row(children: [
        Text(formatSize(entry.size)),
        const SizedBox(width: 8),
        ...(displayTags ?? entry.tags).take(3).map((t) => Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Chip(label: Text(t), visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
            )),
      ]),
      trailing: PopupMenuButton<String>(
        onSelected: onAction,
        itemBuilder: (context) {
          final s = context.read<AppSettingsProvider>().labels;
          return [
            vaultPopupMenuItem(
              value: 'preview',
              icon: Icons.visibility_outlined,
              label: s['action_preview']!,
            ),
            vaultPopupMenuItem(
              value: 'rename',
              icon: Icons.drive_file_rename_outline,
              label: s['action_rename']!,
            ),
            vaultPopupMenuItem(
              value: 'move',
              icon: Icons.drive_file_move_outline,
              label: s['action_move']!,
            ),
            vaultPopupMenuItem(
              value: 'save',
              icon: Icons.download_outlined,
              label: s['action_download']!,
            ),
            vaultPopupMenuItem(
              value: 'delete',
              icon: Icons.delete_outline,
              label: s['action_trash']!,
            ),
          ];
        },
      ),
      onTap: onTap,
    );
  }
}
