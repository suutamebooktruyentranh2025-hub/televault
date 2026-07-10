import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/vault_provider.dart';

/// Breadcrumb kiểu Google Drive: My Drive > folder > subfolder
class DriveBreadcrumb extends StatelessWidget {
  static const rootLabel = 'My Drive';

  const DriveBreadcrumb({super.key});

  @override
  Widget build(BuildContext context) {
    final vp = context.watch<VaultProvider>();
    final segments = vp.breadcrumbs.where((s) => s != '/').toList();
    final labels = [rootLabel, ...segments];
    final theme = Theme.of(context);

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++) ...[
            if (i > 0)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text('>', style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    )),
              ),
            InkWell(
              borderRadius: BorderRadius.circular(4),
              onTap: () {
                if (i == 0) {
                  vp.goTo('/');
                } else {
                  vp.goTo('/${segments.sublist(0, i).join('/')}/');
                }
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Text(
                  labels[i],
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: i == labels.length - 1 ? FontWeight.w600 : FontWeight.normal,
                    color: i == labels.length - 1
                        ? theme.colorScheme.onSurface
                        : theme.colorScheme.primary,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
