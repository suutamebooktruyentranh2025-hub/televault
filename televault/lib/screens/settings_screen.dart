import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';
import '../services/save_as_access.dart';
import '../settings/app_settings.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  int _cacheLimitGb = 2;
  String? _saveAsDir;

  @override
  void initState() {
    super.initState();
    final db = context.read<SessionProvider>().boot.db;
    db.getCacheLimitBytes().then((b) {
      if (mounted) setState(() => _cacheLimitGb = b ~/ (1024 * 1024 * 1024));
    });
    db.getSaveAsDirectory().then((d) {
      if (mounted) setState(() => _saveAsDir = d);
    });
  }

  Future<void> _pickSaveAsDir(SessionProvider session, Map<String, String> s) async {
    try {
      final picked = await FilePicker.getDirectoryPath(dialogTitle: s['settings_save_as_dialog']);
      if (picked == null) return;
      final bookmark = await SaveAsAccess.createBookmark(picked);
      await session.boot.db.setSaveAsDirectory(picked, bookmark: bookmark);
      if (mounted) setState(() => _saveAsDir = picked);
      if (mounted && bookmark == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(s['settings_save_as_bookmark']!)),
        );
      }
    } on PlatformException catch (e) {
      if (!mounted) return;
      final settings = context.read<AppSettingsProvider>();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('folder_pick_error', {'error': e.message ?? e.code}))),
      );
    }
  }

  AppThemePreference _effectiveTheme(AppSettingsProvider settings, BuildContext context) {
    if (settings.themePreference != AppThemePreference.system) {
      return settings.themePreference;
    }
    return Theme.of(context).brightness == Brightness.dark
        ? AppThemePreference.dark
        : AppThemePreference.light;
  }

  Future<void> _confirmLogout(Map<String, String> s, SessionProvider session) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(s['logout_confirm']!),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s['action_cancel']!)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s['settings_logout']!)),
        ],
      ),
    );
    if (ok == true) await session.boot.auth.logOut();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionProvider>();
    final settings = context.watch<AppSettingsProvider>();
    final s = settings.labels;
    final theme = Theme.of(context);
    final onSurfaceVariant = theme.colorScheme.onSurfaceVariant;

    return Scaffold(
      backgroundColor: theme.colorScheme.surfaceContainerLowest,
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
            children: [
              Text(
                s['settings_title']!,
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w400),
              ),
              const SizedBox(height: 20),
              _SectionHeader(title: s['settings_section_appearance']!),
              _SettingsCard(children: [
                _GdDropdownRow(
                  title: s['settings_language']!,
                  value: settings.locale,
                  items: [
                    (AppLocale.vi, s['lang_vi']!),
                    (AppLocale.en, s['lang_en']!),
                  ],
                  onChanged: (v) => settings.setLocale(v),
                ),
                _GdDropdownRow(
                  title: s['settings_theme']!,
                  value: _effectiveTheme(settings, context),
                  items: [
                    (AppThemePreference.light, s['settings_theme_light']!),
                    (AppThemePreference.dark, s['settings_theme_dark']!),
                  ],
                  onChanged: (v) => settings.setThemePreference(v),
                ),
              ]),
              const SizedBox(height: 24),
              _SectionHeader(title: s['settings_section_storage']!),
              _SettingsCard(children: [
                _GdSwitchRow(
                  title: s['settings_auto_resume']!,
                  subtitle: s['settings_auto_resume_hint']!,
                  value: settings.autoResumeTransfers,
                  onChanged: settings.setAutoResumeTransfers,
                ),
                _GdDropdownRow<int>(
                  title: s['settings_transfers']!,
                  value: session.queue.maxConcurrent,
                  items: [for (final n in [1, 2, 3, 4, 5]) (n, '$n')],
                  onChanged: (n) => setState(() => session.queue.maxConcurrent = n),
                ),
                _GdDropdownRow<int>(
                  title: s['settings_cache']!,
                  value: _cacheLimitGb,
                  items: [for (final n in [1, 2, 5, 10]) (n, '$n GB')],
                  onChanged: (n) async {
                    await session.boot.db.setCacheLimitBytes(n * 1024 * 1024 * 1024);
                    setState(() => _cacheLimitGb = n);
                  },
                ),
                _GdSaveAsRow(
                  title: s['settings_save_as']!,
                  path: _saveAsDir,
                  emptyHint: s['settings_save_as_empty']!,
                  chooseLabel: s['settings_save_as_choose']!,
                  onChoose: () => _pickSaveAsDir(session, s),
                ),
              ]),
              const SizedBox(height: 24),
              _SectionHeader(title: s['settings_section_account']!),
              _SettingsCard(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  title: Text(
                    s['settings_logout']!,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.error,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  subtitle: Text(
                    s['settings_logout_hint']!,
                    style: theme.textTheme.bodySmall?.copyWith(color: onSurfaceVariant),
                  ),
                  trailing: Icon(Icons.chevron_right, color: onSurfaceVariant, size: 20),
                  onTap: () => _confirmLogout(s, session),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 12, bottom: 8),
      child: Text(
        title.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              letterSpacing: 0.8,
              fontWeight: FontWeight.w500,
            ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget>? children;
  final Widget? child;

  const _SettingsCard({this.children, this.child});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Theme.of(context).dividerColor),
      ),
      clipBehavior: Clip.antiAlias,
      child: child ?? Column(children: _withDividers(children!)),
    );
  }

  List<Widget> _withDividers(List<Widget> items) {
    final out = <Widget>[];
    for (var i = 0; i < items.length; i++) {
      if (i > 0) out.add(const Divider(height: 1));
      out.add(items[i]);
    }
    return out;
  }
}

class _GdDropdownRow<T> extends StatelessWidget {
  final String title;
  final T value;
  final List<(T, String)> items;
  final ValueChanged<T> onChanged;

  const _GdDropdownRow({
    required this.title,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.bodyMedium)),
          const SizedBox(width: 12),
          DropdownButtonHideUnderline(
            child: DropdownButton<T>(
              value: value,
              borderRadius: BorderRadius.circular(8),
              items: [
                for (final (v, label) in items)
                  DropdownMenuItem(value: v, child: Text(label)),
              ],
              onChanged: (v) {
                if (v != null) onChanged(v);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _GdSwitchRow extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _GdSwitchRow({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final secondary = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 2),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: secondary)),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

class _GdSaveAsRow extends StatelessWidget {
  final String title;
  final String? path;
  final String emptyHint;
  final String chooseLabel;
  final VoidCallback onChoose;

  const _GdSaveAsRow({
    required this.title,
    required this.path,
    required this.emptyHint,
    required this.chooseLabel,
    required this.onChoose,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              path ?? emptyHint,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: onChoose,
              icon: const Icon(Icons.folder_outlined, size: 18),
              label: Text(chooseLabel),
            ),
          ),
        ],
      ),
    );
  }
}
