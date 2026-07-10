import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../utils/search_text.dart';
import '../utils/tag_text.dart';
import 'tag_name_dialog.dart';

Future<List<String>?> showFolderTagEditorDialog(
  BuildContext context, {
  required String folderName,
  required List<String> initialTags,
  required List<String> knownTags,
}) {
  return showDialog<List<String>>(
    context: context,
    builder: (ctx) => _FolderTagEditorDialog(
      folderName: folderName,
      initialTags: List<String>.from(initialTags),
      knownTags: knownTags,
    ),
  );
}

class _FolderTagEditorDialog extends StatefulWidget {
  final String folderName;
  final List<String> initialTags;
  final List<String> knownTags;

  const _FolderTagEditorDialog({
    required this.folderName,
    required this.initialTags,
    required this.knownTags,
  });

  @override
  State<_FolderTagEditorDialog> createState() => _FolderTagEditorDialogState();
}

class _FolderTagEditorDialogState extends State<_FolderTagEditorDialog> {
  late List<String> _tags;
  final _input = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _tags = List<String>.from(widget.initialTags);
  }

  @override
  void dispose() {
    _input.dispose();
    _focus.dispose();
    super.dispose();
  }

  List<String> get _suggestions => filterTagSuggestions(
        knownTags: widget.knownTags,
        selectedTags: _tags,
        query: _input.text,
        matches: searchTextMatches,
      );

  void _addTag(String raw) {
    final tag = raw.trim();
    if (tag.isEmpty || _tags.contains(tag)) return;
    setState(() {
      _tags.add(tag);
      _input.clear();
    });
  }

  void _removeTag(String tag) {
    setState(() => _tags.remove(tag));
  }

  Future<void> _editTag(String oldTag) async {
    final settings = context.read<AppSettingsProvider>();
    final newName = await showTagNameDialog(context, title: settings.t('tag_edit'), initial: oldTag);
    if (newName == null || newName.isEmpty || newName == oldTag) return;
    if (_tags.contains(newName)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(settings.t('tag_duplicate_snack', {'name': newName}))),
        );
      }
      return;
    }
    setState(() {
      final i = _tags.indexOf(oldTag);
      if (i >= 0) _tags[i] = newName;
    });
  }

  void _onInputChanged(String value) {
    if (value.contains(',')) {
      final parts = value.split(',');
      for (var i = 0; i < parts.length - 1; i++) {
        _addTag(parts[i]);
      }
      _input.text = parts.last;
      _input.selection = TextSelection.collapsed(offset: _input.text.length);
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = context.watch<AppSettingsProvider>().labels;
    final suggestions = _suggestions;

    return AlertDialog(
      title: Text(s['tag_folder_title']!.replaceAll('{name}', widget.folderName)),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_tags.isNotEmpty)
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final tag in _tags)
                    InputChip(
                      label: Text(tag),
                      onPressed: () => _editTag(tag),
                      onDeleted: () => _removeTag(tag),
                    ),
                ],
              )
            else
              Text(
                s['tag_empty_hint']!,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _input,
              focusNode: _focus,
              autofocus: true,
              decoration: InputDecoration(
                hintText: s['tag_input_hint'],
                border: const OutlineInputBorder(),
                isDense: true,
              ),
              onChanged: _onInputChanged,
              onSubmitted: _addTag,
              textInputAction: TextInputAction.done,
            ),
            if (suggestions.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(s['tag_available']!, style: theme.textTheme.labelMedium),
              const SizedBox(height: 4),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 160),
                child: Material(
                  color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(8),
                  child: ListView.separated(
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                    itemCount: suggestions.length,
                    separatorBuilder: (_, __) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final tag = suggestions[i];
                      return ListTile(
                        dense: true,
                        leading: const Icon(Icons.label_outline, size: 20),
                        title: Text(tag),
                        onTap: () {
                          _addTag(tag);
                          _focus.requestFocus();
                        },
                      );
                    },
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(s['action_cancel']!)),
        FilledButton(onPressed: () => Navigator.pop(context, _tags), child: Text(s['action_save']!)),
      ],
    );
  }
}
