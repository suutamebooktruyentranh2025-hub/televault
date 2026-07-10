import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/drive_ui_provider.dart';
import '../providers/session_provider.dart';
import '../providers/vault_provider.dart';
import '../screens/settings_screen.dart';
import '../utils/trash.dart';
import 'account_footer.dart';

class DriveSidebar extends StatelessWidget {
  const DriveSidebar({super.key});

  @override
  Widget build(BuildContext context) {
    final ui = context.watch<DriveUiProvider>();
    final vp = context.watch<VaultProvider>();
    final settings = context.watch<AppSettingsProvider>();
    final theme = Theme.of(context);
    final s = settings.labels;

    return IntrinsicWidth(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 220),
        child: Container(
          decoration: BoxDecoration(
            border: Border(right: BorderSide(color: theme.dividerColor)),
            color: theme.colorScheme.surface,
          ),
          child: SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 4),
                  child: Row(
                    children: [
                      Icon(Icons.inventory_2_outlined, color: theme.colorScheme.primary, size: 26),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s['app_name']!, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                            Text(s['app_subtitle']!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            const SizedBox(height: 8),
            _NavTile(
              icon: Icons.folder_outlined,
              label: s['nav_vault']!,
              selected: ui.section == DriveSection.vault &&
                  !ui.isSearching &&
                  !isTrashFolder(vp.currentFolder),
              onTap: () {
                ui.clearSearch();
                ui.setSection(DriveSection.vault);
                vp.goTo('/');
                _closeDrawerIfOpen(context);
              },
            ),
            _NavTile(
              icon: Icons.label_outline,
              label: s['nav_tags']!,
              selected: ui.section == DriveSection.tags && !ui.isSearching,
              onTap: () {
                ui.clearSearch();
                ui.setSection(DriveSection.tags);
                _closeDrawerIfOpen(context);
              },
            ),
            _NavTile(
              icon: Icons.delete_outline,
              label: s['nav_trash']!,
              selected: ui.section == DriveSection.vault &&
                  !ui.isSearching &&
                  isTrashFolder(vp.currentFolder),
              onTap: () {
                ui.clearSearch();
                ui.setSection(DriveSection.vault);
                vp.goTo(kTrashFolder);
                _closeDrawerIfOpen(context);
              },
            ),
            const Spacer(),
            AccountFooter(
              onSignOut: () => context.read<SessionProvider>().signOutAll(),
            ),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: Text(s['nav_settings']!),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12),
              visualDensity: VisualDensity.compact,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SettingsScreen()),
              ),
            ),
          ],
        ),
      ),
        ),
      ),
    );
  }
}

class DriveSidebarDrawer extends StatelessWidget {
  const DriveSidebarDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    return const Drawer(child: DriveSidebar());
  }
}

void _closeDrawerIfOpen(BuildContext context) {
  final scaffold = Scaffold.maybeOf(context);
  if (scaffold != null && scaffold.isDrawerOpen) {
    Navigator.of(context).pop();
  }
}

class _NavTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _NavTile({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bg = selected
        ? theme.colorScheme.primaryContainer.withValues(alpha: 0.55)
        : Colors.transparent;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          leading: Icon(icon, color: selected ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant),
          title: Text(
            label,
            style: TextStyle(
              fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
              color: selected ? theme.colorScheme.primary : null,
            ),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
          visualDensity: VisualDensity.compact,
          minLeadingWidth: 24,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          onTap: onTap,
        ),
      ),
    );
  }
}
