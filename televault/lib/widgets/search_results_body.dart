import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../models/vault_tree.dart';
import '../providers/app_settings_provider.dart';
import '../providers/drive_ui_provider.dart';
import '../providers/session_provider.dart';
import '../providers/vault_provider.dart';
import '../utils/trash.dart';
import 'vault_browser_views.dart';
import 'vault_context_menu.dart';
import 'vault_folder_picker.dart';

class SearchResultsBody extends StatefulWidget {
  final String query;
  final void Function(VaultEntry) onOpenFile;
  final void Function(VaultEntry) onPreviewFile;
  final Future<void> Function(VaultEntry) onSaveFile;

  const SearchResultsBody({
    super.key,
    required this.query,
    required this.onOpenFile,
    required this.onPreviewFile,
    required this.onSaveFile,
  });

  @override
  State<SearchResultsBody> createState() => _SearchResultsBodyState();
}

class _SearchResultsBodyState extends State<SearchResultsBody> {
  List<VaultEntry> _results = [];
  var _loading = false;

  @override
  void initState() {
    super.initState();
    _runSearch();
  }

  @override
  void didUpdateWidget(SearchResultsBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.query != widget.query) {
      context.read<DriveUiProvider>().clearSelection();
      _runSearch();
    }
  }

  Future<void> _runSearch() async {
    final trimmed = widget.query.trim();
    if (trimmed.isEmpty) {
      setState(() => _results = []);
      return;
    }
    setState(() => _loading = true);
    final db = context.read<SessionProvider>().boot.db;
    final results = await db.search(query: trimmed);
    if (mounted) {
      setState(() {
        _results = results.where((e) => !e.isDir).toList();
        _loading = false;
      });
    }
  }

  List<VaultEntry> _visibleFiles(DriveUiProvider ui) {
    return sortVaultEntries(
      _results,
      field: ui.sortField,
      direction: ui.sortDirection,
    );
  }

  List<VaultEntry> _selectedEntries(List<VaultEntry> files, DriveUiProvider ui) {
    final byId = {for (final e in files) e.messageId: e};
    return ui.selectedMessageIds.map((id) => byId[id]).whereType<VaultEntry>().toList();
  }

  List<VaultEntry> _targetsForAction(VaultEntry anchor, List<VaultEntry> files, DriveUiProvider ui) {
    final selected = _selectedEntries(files, ui);
    if (selected.isEmpty || !ui.isSelected(anchor.messageId)) return [anchor];
    return selected;
  }

  void _handleFileTap(VaultEntry entry, List<VaultEntry> visibleFiles) {
    final ui = context.read<DriveUiProvider>();
    if (vaultRangeSelectModifierPressed() && ui.lastSelectedMessageId != null) {
      ui.selectRange(
        visibleFiles.map((e) => e.messageId).toList(),
        ui.lastSelectedMessageId!,
        entry.messageId,
      );
    } else if (vaultMultiSelectModifierPressed()) {
      ui.toggleSelected(entry.messageId);
    } else {
      ui.selectOnly(entry.messageId);
    }
  }

  Future<String?> _prompt(BuildContext context, String title, {String initial = ''}) {
    final s = context.read<AppSettingsProvider>().labels;
    final c = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s['action_cancel']!)),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: Text(s['action_ok']!)),
        ],
      ),
    );
  }

  Future<bool> _confirm(BuildContext context, String message, {String? okLabel}) async {
    final s = context.read<AppSettingsProvider>().labels;
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            content: Text(message),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s['action_cancel']!)),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(okLabel ?? s['action_delete']!),
              ),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _moveFiles(BuildContext context, List<VaultEntry> entries) async {
    if (entries.isEmpty) return;
    final vault = context.read<SessionProvider>().vault!;
    final folder = await pickVaultFolder(
      context,
      db: context.read<SessionProvider>().boot.db,
      initial: entries.first.parent,
    );
    if (folder == null) return;
    for (final e in entries) {
      await vault.renameFile(e.messageId, '$folder${e.name}');
    }
  }

  Future<void> _restoreFiles(BuildContext context, List<VaultEntry> entries) async {
    if (entries.isEmpty) return;
    final vault = context.read<SessionProvider>().vault!;
    await vault.restoreEntries(entries.map((e) => e.messageId).toList());
  }

  Future<void> _deleteFiles(BuildContext context, List<VaultEntry> entries) async {
    if (entries.isEmpty) return;
    final vault = context.read<SessionProvider>().vault!;
    final settings = context.read<AppSettingsProvider>();
    final inTrash = entries.every((e) => isInTrash(e.path));
    final label = entries.length == 1 ? '"${entries.first.name}"' : '${entries.length} file';
    final ok = inTrash
        ? await _confirm(context, settings.t('confirm_delete_file_forever', {'label': label}),
            okLabel: settings.t('action_delete_forever'))
        : await _confirm(context, settings.t('confirm_trash_file', {'label': label}),
            okLabel: settings.t('action_trash'));
    if (!ok) return;
    await vault.deleteFilesOrTrash(entries);
  }

  Future<void> _afterFileMutation() async {
    final ui = context.read<DriveUiProvider>();
    ui.clearSelection();
    await context.read<VaultProvider>().refresh();
    await _runSearch();
  }

  Future<void> _onFileAction(BuildContext context, VaultEntry e, String action) async {
    final vault = context.read<SessionProvider>().vault!;
    final settings = context.read<AppSettingsProvider>();
    switch (action) {
      case 'restore':
        await _restoreFiles(context, [e]);
      case 'rename':
        final name = await _prompt(context, settings.t('prompt_new_name'), initial: e.name);
        if (name != null && name.isNotEmpty) {
          await vault.renameFile(e.messageId, '${e.parent}$name');
        }
      case 'move':
        await _moveFiles(context, [e]);
      case 'delete':
        await _deleteFiles(context, [e]);
      case 'preview':
        widget.onPreviewFile(e);
        return;
      case 'save':
        await widget.onSaveFile(e);
        return;
    }
    if (context.mounted) await _afterFileMutation();
  }

  Future<void> _showFileContextMenu(
    BuildContext context,
    VaultEntry entry,
    TapUpDetails details,
    List<VaultEntry> visibleFiles,
  ) async {
    final ui = context.read<DriveUiProvider>();
    if (!ui.isSelected(entry.messageId)) {
      ui.selectOnly(entry.messageId);
    }
    final targets = _targetsForAction(entry, visibleFiles, ui);
    final inTrash = targets.every((e) => isInTrash(e.path));
    final action = await showVaultFileContextMenu(
      context,
      globalPosition: details.globalPosition,
      inTrash: inTrash,
      selectionCount: targets.length,
    );
    if (action == null || !context.mounted) return;
    switch (action) {
      case VaultFileContextAction.download:
        for (final e in targets) {
          await widget.onSaveFile(e);
        }
        return;
      case VaultFileContextAction.move:
        await _moveFiles(context, targets);
      case VaultFileContextAction.restore:
        await _restoreFiles(context, targets);
      case VaultFileContextAction.delete:
        await _deleteFiles(context, targets);
    }
    if (context.mounted) await _afterFileMutation();
  }

  Widget _selectionBar(BuildContext context, DriveUiProvider ui, List<VaultEntry> files) {
    if (ui.selectedMessageIds.isEmpty) return const SizedBox.shrink();
    final selected = _selectedEntries(files, ui);
    if (selected.isEmpty) return const SizedBox.shrink();
    final count = selected.length;
    final inTrash = selected.every((e) => isInTrash(e.path));
    final s = context.watch<AppSettingsProvider>().labels;
    return Material(
      color: Theme.of(context).colorScheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          children: [
            Text(s['selection_count']!.replaceAll('{count}', '$count')),
            const Spacer(),
            if (inTrash) ...[
              TextButton.icon(
                icon: const Icon(Icons.restore_from_trash_outlined, size: 18),
                label: Text(s['action_restore']!),
                onPressed: () async {
                  await _restoreFiles(context, selected);
                  if (context.mounted) await _afterFileMutation();
                },
              ),
              TextButton.icon(
                icon: const Icon(Icons.delete_forever_outlined, size: 18),
                label: Text(s['action_delete_forever']!),
                onPressed: () async {
                  await _deleteFiles(context, selected);
                  if (context.mounted) await _afterFileMutation();
                },
              ),
            ] else ...[
              TextButton.icon(
                icon: const Icon(Icons.download_outlined, size: 18),
                label: Text(s['action_download']!),
                onPressed: () async {
                  for (final e in selected) {
                    await widget.onSaveFile(e);
                  }
                },
              ),
              TextButton.icon(
                icon: const Icon(Icons.drive_file_move_outline, size: 18),
                label: Text(s['action_move']!),
                onPressed: () async {
                  await _moveFiles(context, selected);
                  if (context.mounted) await _afterFileMutation();
                },
              ),
              TextButton.icon(
                icon: const Icon(Icons.delete_outline, size: 18),
                label: Text(s['action_trash']!),
                onPressed: () async {
                  await _deleteFiles(context, selected);
                  if (context.mounted) await _afterFileMutation();
                },
              ),
            ],
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              tooltip: s['deselect_tooltip'],
              onPressed: ui.clearSelection,
            ),
          ],
        ),
      ),
    );
  }

  Widget _searchTopBar(
    BuildContext context,
    DriveUiProvider ui,
    List<VaultEntry> files,
    AppSettingsProvider settings,
  ) {
    final selected = _selectedEntries(files, ui);
    if (selected.isNotEmpty) {
      return _selectionBar(context, ui, files);
    }
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Text(
        settings.t('search_results_count', {'count': '${files.length}'}),
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final trimmed = widget.query.trim();
    if (trimmed.isEmpty) return const SizedBox.shrink();

    final settings = context.watch<AppSettingsProvider>();
    final ui = context.watch<DriveUiProvider>();

    if (_loading) return const Center(child: CircularProgressIndicator());

    final files = _visibleFiles(ui);
    if (files.isEmpty) {
      return Center(child: Text(settings.t('search_no_results', {'query': trimmed})));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _searchTopBar(context, ui, files, settings),
        VaultListHeader(
          sortField: ui.sortField,
          sortDirection: ui.sortDirection,
          onSort: ui.setSort,
          labels: settings.labels,
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView(
            children: [
              for (final entry in files)
                VaultFileListRow(
                  entry: entry,
                  selected: ui.isSelected(entry.messageId),
                  onTap: () => _handleFileTap(entry, files),
                  onDoubleTap: isInTrash(entry.path) ? () {} : () => widget.onOpenFile(entry),
                  onSecondaryTapUp: (d) => _showFileContextMenu(context, entry, d, files),
                  onAction: (a) => _onFileAction(context, entry, a),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
