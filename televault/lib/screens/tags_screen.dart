import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';
import '../widgets/tag_name_dialog.dart';
import '../widgets/vault_menu_items.dart';

class TagsScreen extends StatefulWidget {
  const TagsScreen({super.key});

  @override
  State<TagsScreen> createState() => _TagsScreenState();
}

class _TagsScreenState extends State<TagsScreen> {
  Map<String, int> _tags = {};

  Future<void> _load() async {
    _tags = await context.read<SessionProvider>().boot.db.allTags();
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _editTag(String oldName) async {
    final vault = context.read<SessionProvider>().vault!;
    final s = context.read<AppSettingsProvider>().labels;
    final newName = await showTagNameDialog(context, title: s['tag_edit']!, initial: oldName);
    if (newName == null || newName.isEmpty || newName == oldName) return;
    await vault.renameTag(oldName, newName);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppSettingsProvider>().labels;
    final vault = context.read<SessionProvider>().vault!;

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        for (final entry in _tags.entries)
          ListTile(
            leading: Icon(Icons.label_outline, color: Theme.of(context).colorScheme.primary),
            title: Text(entry.key),
            subtitle: Text('${entry.value} ${s['tags_file_count']}'),
            onTap: () => _editTag(entry.key),
            trailing: PopupMenuButton<String>(
              onSelected: (a) async {
                if (a == 'rename') {
                  await _editTag(entry.key);
                } else if (a == 'delete') {
                  await vault.deleteTag(entry.key);
                  await _load();
                }
              },
              itemBuilder: (_) => [
                vaultPopupMenuItem(
                  value: 'rename',
                  icon: Icons.edit_outlined,
                  label: s['tag_edit']!,
                ),
                vaultPopupMenuItem(
                  value: 'delete',
                  icon: Icons.label_off_outlined,
                  label: s['tag_remove_all']!,
                ),
              ],
            ),
          ),
        if (_tags.isEmpty)
          Padding(
            padding: const EdgeInsets.all(48),
            child: Center(child: Text(s['tags_empty']!, style: Theme.of(context).textTheme.bodyLarge)),
          ),
      ],
    );
  }
}
