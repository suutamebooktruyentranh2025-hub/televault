import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../providers/session_provider.dart';
import '../providers/app_settings_provider.dart';
import '../utils/folder_tags.dart';
import '../widgets/entry_tile.dart';

class SearchScreen extends StatefulWidget {
  final void Function(VaultEntry) onOpenFile;
  const SearchScreen({super.key, required this.onOpenFile});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String _query = '';
  final _selectedTags = <String>{};
  List<VaultEntry> _results = [];
  Map<String, int> _allTags = {};
  Map<String, List<String>> _folderTags = {};

  Future<void> _run() async {
    final db = context.read<SessionProvider>().boot.db;
    _allTags = await db.allTags();
    _folderTags = await db.folderTagsIndex();
    _results = (_query.isEmpty && _selectedTags.isEmpty)
        ? []
        : await db.search(query: _query, tags: _selectedTags.toList());
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppSettingsProvider>().labels;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            decoration: InputDecoration(
              hintText: s['search_field_hint'],
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(28)),
              filled: true,
            ),
            onChanged: (v) {
              _query = v;
              _run();
            },
          ),
        ),
        if (_allTags.isNotEmpty)
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: [
                for (final tag in _allTags.keys)
                  Padding(
                    padding: const EdgeInsets.all(4),
                    child: FilterChip(
                      label: Text('$tag (${_allTags[tag]})'),
                      selected: _selectedTags.contains(tag),
                      onSelected: (on) {
                        on ? _selectedTags.add(tag) : _selectedTags.remove(tag);
                        _run();
                      },
                    ),
                  ),
              ],
            ),
          ),
        Expanded(
          child: _results.isEmpty && _query.isEmpty && _selectedTags.isEmpty
              ? Center(
                  child: Text(s['search_hint_empty']!,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: Theme.of(context).colorScheme.outline,
                          )),
                )
              : ListView(
                  children: [
                    for (final e in _results.where((e) => !e.isDir))
                      EntryTile(
                        entry: e,
                        displayTags: effectiveTagsForPath(e.path, _folderTags),
                        onTap: () => widget.onOpenFile(e),
                        onAction: (_) {},
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
