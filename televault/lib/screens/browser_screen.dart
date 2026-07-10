import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../models/vault_tree.dart';
import '../providers/app_settings_provider.dart';
import '../providers/drive_ui_provider.dart';
import '../providers/session_provider.dart';
import '../providers/vault_provider.dart';
import '../services/vault_service.dart';
import '../services/telegram/td_client.dart';
import '../utils/trash.dart';
import '../widgets/folder_tag_editor_dialog.dart';
import '../widgets/drive_breadcrumb.dart';
import '../widgets/vault_browser_views.dart';
import '../widgets/vault_context_menu.dart';
import '../widgets/vault_folder_picker.dart';
import '../widgets/vault_menu_items.dart';

class BrowserScreen extends StatefulWidget {
  final void Function(VaultEntry entry) onOpenFile;
  final void Function(VaultEntry entry) onPreviewFile;
  final Future<void> Function(VaultEntry entry) onSaveFile;
  final void Function(String folderPath) onSaveFolder;
  final VoidCallback onCreateFolderInCurrent;
  final VoidCallback onUploadFiles;
  final VoidCallback onUploadFolder;

  const BrowserScreen({
    super.key,
    required this.onOpenFile,
    required this.onPreviewFile,
    required this.onSaveFile,
    required this.onSaveFolder,
    required this.onCreateFolderInCurrent,
    required this.onUploadFiles,
    required this.onUploadFolder,
  });

  @override
  State<BrowserScreen> createState() => _BrowserScreenState();
}

class _BrowserScreenState extends State<BrowserScreen> {
  String? _lastFolder;

  void _onContextAction(VaultContextAction action) {
    switch (action) {
      case VaultContextAction.newFolder:
        widget.onCreateFolderInCurrent();
      case VaultContextAction.uploadFile:
        widget.onUploadFiles();
      case VaultContextAction.uploadFolder:
        widget.onUploadFolder();
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

  List<VaultEntry> _selectedEntries(VaultProvider vp, DriveUiProvider ui) {
    final byId = {for (final e in vp.listing.files) e.messageId: e};
    return ui.selectedMessageIds.map((id) => byId[id]).whereType<VaultEntry>().toList();
  }

  List<VaultEntry> _targetsForAction(VaultEntry anchor, VaultProvider vp, DriveUiProvider ui) {
    final selected = _selectedEntries(vp, ui);
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

  Future<void> _showFileContextMenu(
    BuildContext context,
    VaultEntry entry,
    TapUpDetails details,
    List<VaultEntry> visibleFiles,
  ) async {
    final ui = context.read<DriveUiProvider>();
    final vp = context.read<VaultProvider>();
    if (!ui.isSelected(entry.messageId)) {
      ui.selectOnly(entry.messageId);
    }
    final targets = _targetsForAction(entry, vp, ui);
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
      case VaultFileContextAction.move:
        await _moveFiles(context, targets);
      case VaultFileContextAction.restore:
        await _restoreFiles(context, targets);
      case VaultFileContextAction.delete:
        await _deleteFiles(context, targets);
    }
    if (context.mounted) {
      ui.clearSelection();
      await vp.refresh();
    }
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

  Future<void> _moveFolder(BuildContext context, String folderPath) async {
    final vault = context.read<SessionProvider>().vault!;
    final settings = context.read<AppSettingsProvider>();
    final destParent = await pickVaultFolder(
      context,
      db: context.read<SessionProvider>().boot.db,
      initial: '/',
      excludeFolder: folderPath,
    );
    if (destParent == null || !context.mounted) return;
    try {
      await vault.moveFolder(folderPath, destParent);
    } on FolderMoveException {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('move_folder_invalid'))),
      );
    } on TdException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${settings.t('action_move')}: ${e.message}')),
      );
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

  Future<void> _onFileAction(BuildContext context, VaultEntry e, String action) async {
    final vault = context.read<SessionProvider>().vault!;
    final vp = context.read<VaultProvider>();
    final ui = context.read<DriveUiProvider>();
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
      case 'save':
        widget.onSaveFile(e);
    }
    ui.clearSelection();
    await vp.refresh();
  }

  Future<void> _onFolderAction(BuildContext context, String folderPath, String action) async {
    final vault = context.read<SessionProvider>().vault!;
    final vp = context.read<VaultProvider>();
    final ui = context.read<DriveUiProvider>();
    final settings = context.read<AppSettingsProvider>();
    final name = folderPath.substring(0, folderPath.length - 1).split('/').last;
    final parentPath = folderPath.substring(0, folderPath.length - name.length - 1);
    final inTrash = isTrashFolder(folderPath) || isInTrash(folderPath);
    switch (action) {
      case 'restore':
        await vault.restoreFolder(folderPath);
      case 'rename':
        final newName = await _prompt(context, settings.t('prompt_new_folder_name'), initial: name);
        if (newName != null && newName.isNotEmpty) {
          await vault.renameFolder(folderPath, '$parentPath$newName/');
        }
      case 'move':
        await _moveFolder(context, folderPath);
      case 'delete':
        final ok = inTrash
            ? await _confirm(context, settings.t('confirm_delete_folder_forever', {'name': name}),
                okLabel: settings.t('action_delete_forever'))
            : await _confirm(context, settings.t('confirm_trash_folder', {'name': name}),
                okLabel: settings.t('action_trash'));
        if (ok) await vault.deleteFolder(folderPath);
      case 'tags':
        final db = context.read<SessionProvider>().boot.db;
        final index = await db.folderTagsIndex();
        final current = index[folderPath] ?? const <String>[];
        final known = await db.allTagNames();
        final tags = await showFolderTagEditorDialog(
          context,
          folderName: name,
          initialTags: current,
          knownTags: known,
        );
        if (tags != null) {
          await vault.setFolderTags(folderPath, tags);
        }
      case 'save':
        widget.onSaveFolder(folderPath);
    }
    ui.clearSelection();
    await vp.refresh();
  }

  Widget _folderMenu(BuildContext context, String folderPath) {
    final inTrash = isTrashFolder(folderPath) || isInTrash(folderPath);
    final s = context.read<AppSettingsProvider>().labels;
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert, size: 20),
      onSelected: (a) => _onFolderAction(context, folderPath, a),
      itemBuilder: (_) => inTrash
          ? [
              vaultPopupMenuItem(
                value: 'restore',
                icon: Icons.restore_from_trash_outlined,
                label: s['action_restore']!,
              ),
              vaultPopupMenuItem(
                value: 'delete',
                icon: Icons.delete_forever_outlined,
                label: s['action_delete_forever']!,
              ),
            ]
          : [
              vaultPopupMenuItem(
                value: 'save',
                icon: Icons.download_outlined,
                label: s['action_save_folder']!,
              ),
              vaultPopupMenuItem(
                value: 'tags',
                icon: Icons.label_outline,
                label: s['action_tags']!,
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
                value: 'delete',
                icon: Icons.delete_outline,
                label: s['action_trash']!,
              ),
            ],
    );
  }

  Widget _selectionBar(BuildContext context, DriveUiProvider ui, VaultProvider vp) {
    if (ui.selectedMessageIds.isEmpty) return const SizedBox.shrink();
    final count = ui.selectedMessageIds.length;
    final sample = _selectedEntries(vp, ui).firstOrNull;
    final inTrash = sample != null && isInTrash(sample.path);
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
                  await _restoreFiles(context, _selectedEntries(vp, ui));
                  if (context.mounted) {
                    ui.clearSelection();
                    await vp.refresh();
                  }
                },
              ),
              TextButton.icon(
                icon: const Icon(Icons.delete_forever_outlined, size: 18),
                label: Text(s['action_delete_forever']!),
                onPressed: () async {
                  await _deleteFiles(context, _selectedEntries(vp, ui));
                  if (context.mounted) {
                    ui.clearSelection();
                    await vp.refresh();
                  }
                },
              ),
            ] else ...[
              TextButton.icon(
                icon: const Icon(Icons.download_outlined, size: 18),
                label: Text(s['action_download']!),
                onPressed: () async {
                  for (final e in _selectedEntries(vp, ui)) {
                    await widget.onSaveFile(e);
                  }
                },
              ),
              TextButton.icon(
                icon: const Icon(Icons.drive_file_move_outline, size: 18),
                label: Text(s['action_move']!),
                onPressed: () async {
                  await _moveFiles(context, _selectedEntries(vp, ui));
                  if (context.mounted) {
                    ui.clearSelection();
                    await vp.refresh();
                  }
                },
              ),
              TextButton.icon(
                icon: const Icon(Icons.delete_outline, size: 18),
                label: Text(s['action_trash']!),
                onPressed: () async {
                  await _deleteFiles(context, _selectedEntries(vp, ui));
                  if (context.mounted) {
                    ui.clearSelection();
                    await vp.refresh();
                  }
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

  Widget _listBody(BuildContext context, VaultProvider vp, DriveUiProvider ui) {
    final listing = vp.sortedListing(ui.sortField, ui.sortDirection);
    final s = context.watch<AppSettingsProvider>().labels;
    if (listing.folders.isEmpty && listing.files.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.folder_open_outlined, size: 64, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 12),
            Text(isTrashFolder(vp.currentFolder) ? s['empty_trash']! : s['empty_folder']!),
            const SizedBox(height: 8),
            if (!isTrashFolder(vp.currentFolder))
              Text(s['empty_folder_hint']!,
                  style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _selectionBar(context, ui, vp),
        VaultListHeader(
          sortField: ui.sortField,
          sortDirection: ui.sortDirection,
          onSort: ui.setSort,
          labels: context.watch<AppSettingsProvider>().labels,
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView(
            children: [
              ...listing.folders.map((name) {
                final folderPath = '${vp.currentFolder}$name/';
                final all = vp.allEntries;
                return VaultFolderListRow(
                  name: name,
                  mtime: folderMtime(all, folderPath),
                  size: folderSize(all, folderPath),
                  onOpen: () {
                    ui.clearSelection();
                    vp.goTo(folderPath);
                  },
                  trailing: _folderMenu(context, folderPath),
                );
              }),
              ...listing.files.map(
                (entry) => VaultFileListRow(
                  entry: entry,
                  selected: ui.isSelected(entry.messageId),
                  onTap: () => _handleFileTap(entry, listing.files),
                  onDoubleTap: isInTrash(entry.path) ? () {} : () => widget.onOpenFile(entry),
                  onSecondaryTapUp: (d) => _showFileContextMenu(context, entry, d, listing.files),
                  onAction: (a) => _onFileAction(context, entry, a),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _gridBody(BuildContext context, VaultProvider vp, DriveUiProvider ui) {
    final listing = vp.sortedListing(ui.sortField, ui.sortDirection);
    if (listing.folders.isEmpty && listing.files.isEmpty) {
      return _listBody(context, vp, ui);
    }
    final items = <Widget>[
      ...listing.folders.map((name) {
        final folderPath = '${vp.currentFolder}$name/';
        return VaultFolderGridTile(
          name: name,
          onOpen: () {
            ui.clearSelection();
            vp.goTo(folderPath);
          },
          menu: _folderMenu(context, folderPath),
        );
      }),
      ...listing.files.map(
        (entry) => VaultFileGridTile(
          entry: entry,
          selected: ui.isSelected(entry.messageId),
          onTap: () => _handleFileTap(entry, listing.files),
          onDoubleTap: isInTrash(entry.path) ? () {} : () => widget.onOpenFile(entry),
          onSecondaryTapUp: (d) => _showFileContextMenu(context, entry, d, listing.files),
          onAction: (a) => _onFileAction(context, entry, a),
        ),
      ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _selectionBar(context, ui, vp),
        VaultListHeader(
          sortField: ui.sortField,
          sortDirection: ui.sortDirection,
          onSort: ui.setSort,
          labels: context.watch<AppSettingsProvider>().labels,
        ),
        const Divider(height: 1),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 160,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 0.95,
            ),
            itemCount: items.length,
            itemBuilder: (_, i) => items[i],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final vp = context.watch<VaultProvider>();
    final ui = context.watch<DriveUiProvider>();
    final s = context.watch<AppSettingsProvider>().labels;
    final viewMode = ui.viewMode;

    if (_lastFolder != vp.currentFolder) {
      _lastFolder = vp.currentFolder;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.read<DriveUiProvider>().clearSelection();
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            children: [
              Expanded(child: DriveBreadcrumb()),
              IconButton(
                tooltip: viewMode == VaultViewMode.list ? s['view_grid_tooltip'] : s['view_list_tooltip'],
                icon: Icon(viewMode == VaultViewMode.list ? Icons.grid_view : Icons.view_list),
                onPressed: ui.toggleViewMode,
              ),
              const SizedBox(width: 8),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: VaultContextMenuRegion(
            enabled: !isTrashFolder(vp.currentFolder),
            onAction: _onContextAction,
            child: viewMode == VaultViewMode.list
                ? _listBody(context, vp, ui)
                : _gridBody(context, vp, ui),
          ),
        ),
      ],
    );
  }
}
