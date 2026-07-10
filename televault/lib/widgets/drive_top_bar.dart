import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/drive_ui_provider.dart';

class DriveTopBar extends StatefulWidget {
  final bool showMenuButton;
  final VoidCallback? onMenuPressed;

  const DriveTopBar({
    super.key,
    this.showMenuButton = false,
    this.onMenuPressed,
  });

  @override
  State<DriveTopBar> createState() => _DriveTopBarState();
}

class _DriveTopBarState extends State<DriveTopBar> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ui = context.watch<DriveUiProvider>();
    final s = context.watch<AppSettingsProvider>().labels;
    if (_controller.text != ui.searchQuery) {
      _controller.value = TextEditingValue(
        text: ui.searchQuery,
        selection: TextSelection.collapsed(offset: ui.searchQuery.length),
      );
    }

    return Material(
      elevation: 0,
      color: Theme.of(context).colorScheme.surface,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 16, 6),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              if (widget.showMenuButton) ...[
                IconButton(
                  style: IconButton.styleFrom(
                    minimumSize: const Size(40, 40),
                    fixedSize: const Size(40, 40),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  icon: const Icon(Icons.menu, size: 22),
                  onPressed: widget.onMenuPressed,
                ),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: SizedBox(
                  height: 40,
                  child: TextField(
                    controller: _controller,
                    style: Theme.of(context).textTheme.bodyMedium,
                    decoration: InputDecoration(
                      hintText: s['search_hint'],
                      hintStyle: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                      prefixIcon: const Icon(Icons.search, size: 20),
                      suffixIcon: ui.isSearching
                          ? IconButton(
                              icon: const Icon(Icons.close, size: 18),
                              onPressed: () {
                                _controller.clear();
                                ui.clearSearch();
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                      isDense: true,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide.none,
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20),
                        borderSide: BorderSide(
                          color: Theme.of(context).colorScheme.primary,
                          width: 1.5,
                        ),
                      ),
                    ),
                    onChanged: ui.setSearchQuery,
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
