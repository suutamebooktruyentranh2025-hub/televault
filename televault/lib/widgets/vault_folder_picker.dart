import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../models/vault_tree.dart';
import '../providers/app_settings_provider.dart';
import '../services/index_db.dart';

/// Chọn thư mục đích trong kho (duyệt cây folder có sẵn). Trả về path kết thúc `/`.
Future<String?> pickVaultFolder(
  BuildContext context, {
  required IndexDb db,
  String initial = '/',
  String? excludeFolder,
}) {
  final start = initial.endsWith('/') ? initial : '$initial/';
  final exclude = excludeFolder != null
      ? (excludeFolder.endsWith('/') ? excludeFolder : '$excludeFolder/')
      : null;
  return showDialog<String>(
    context: context,
    builder: (ctx) => VaultFolderPickerDialog(
      db: db,
      initial: start,
      excludeFolder: exclude,
    ),
  );
}

/// Folder đích bị loại khỏi danh sách (không thể chọn / mở folder đang move).
bool isExcludedMoveDestination(String path, String excludeFolder) {
  final p = path.endsWith('/') ? path : '$path/';
  final ex = excludeFolder.endsWith('/') ? excludeFolder : '$excludeFolder/';
  return p == ex || p.startsWith(ex);
}

/// Có thể đặt folder nguồn [excludeFolder] vào [destParent] hay không.
bool canMoveFolderTo(String destParent, String excludeFolder) {
  final parent = destParent.endsWith('/') ? destParent : '$destParent/';
  final src = excludeFolder.endsWith('/') ? excludeFolder : '$excludeFolder/';
  final name = src.substring(0, src.length - 1).split('/').last;
  final to = '$parent$name/';
  if (to == src) return false;
  if (to.startsWith(src)) return false;
  return true;
}

class VaultFolderPickerDialog extends StatefulWidget {
  final IndexDb db;
  final String initial;
  final String? excludeFolder;

  const VaultFolderPickerDialog({
    super.key,
    required this.db,
    required this.initial,
    this.excludeFolder,
  });

  @override
  State<VaultFolderPickerDialog> createState() => _VaultFolderPickerDialogState();
}

class _VaultFolderPickerDialogState extends State<VaultFolderPickerDialog> {
  late String _current;
  var _all = <VaultEntry>[];
  var _loading = true;

  @override
  void initState() {
    super.initState();
    _current = widget.initial;
    _load();
  }

  Future<void> _load() async {
    final all = await widget.db.getAll();
    if (!mounted) return;
    setState(() {
      _all = all;
      _loading = false;
    });
  }

  void _enter(String name) => setState(() => _current = '$_current$name/');

  void _goTo(String path) => setState(() => _current = path.endsWith('/') ? path : '$path/');

  List<String> _breadcrumbPaths() {
    if (_current == '/') return ['/'];
    final parts = _current.split('/').where((s) => s.isNotEmpty).toList();
    final paths = <String>['/'];
    for (var i = 0; i < parts.length; i++) {
      paths.add('/${parts.sublist(0, i + 1).join('/')}/');
    }
    return paths;
  }

  List<String> _breadcrumbLabels(Map<String, String> s) {
    if (_current == '/') return [s['my_drive']!];
    return [s['my_drive']!, ..._current.split('/').where((p) => p.isNotEmpty)];
  }

  String _currentLabel(Map<String, String> s) {
    if (_current == '/') return s['my_drive']!;
    return _current.substring(0, _current.length - 1).split('/').last;
  }

  List<String> _visibleSubfolders(FolderListing listing) {
    final exclude = widget.excludeFolder;
    if (exclude == null) return listing.folders;
    return listing.folders.where((name) {
      final child = '$_current$name/';
      return !isExcludedMoveDestination(child, exclude);
    }).toList();
  }

  bool get _canMoveHere {
    final exclude = widget.excludeFolder;
    if (exclude == null) return true;
    return canMoveFolderTo(_current, exclude);
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettingsProvider>();
    final s = settings.labels;
    final isMove = widget.excludeFolder != null;
    final listing = _loading ? const FolderListing([], []) : listFolder(_all, _current);
    final subfolders = _visibleSubfolders(listing);
    final theme = Theme.of(context);

    return AlertDialog(
      title: Text(isMove ? s['pick_folder_move_title']! : s['pick_folder_title']!),
      content: SizedBox(
        width: 400,
        height: 360,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (var i = 0; i < _breadcrumbLabels(s).length; i++) ...[
                    if (i > 0)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          '>',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    InkWell(
                      borderRadius: BorderRadius.circular(4),
                      onTap: () => _goTo(_breadcrumbPaths()[i]),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                        child: Text(
                          _breadcrumbLabels(s)[i],
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: _breadcrumbPaths()[i] == _current ? FontWeight.w600 : FontWeight.normal,
                            color: _breadcrumbPaths()[i] == _current
                                ? theme.colorScheme.onSurface
                                : theme.colorScheme.primary,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(
                      children: [
                        Material(
                          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(12),
                          child: ListTile(
                            leading: Icon(
                              _current == '/' ? Icons.cloud_outlined : Icons.folder_outlined,
                              color: theme.colorScheme.primary,
                            ),
                            title: Text(
                              _currentLabel(s),
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                            trailing: FilledButton.tonal(
                              onPressed: _canMoveHere ? () => Navigator.pop(context, _current) : null,
                              child: Text(s['pick_folder_move_here']!),
                            ),
                          ),
                        ),
                        if (subfolders.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          ...subfolders.map(
                            (name) => ListTile(
                              leading: const Icon(Icons.folder_outlined),
                              title: Text(name),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => _enter(name),
                            ),
                          ),
                        ] else if (_current != '/') ...[
                          const SizedBox(height: 24),
                          Center(
                            child: Text(
                              s['pick_folder_empty']!,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s['action_cancel']!)),
      ],
    );
  }
}
