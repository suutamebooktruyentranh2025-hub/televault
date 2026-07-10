import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/drive_ui_provider.dart';

class DropUploadOverlay extends StatelessWidget {
  const DropUploadOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final hover = context.watch<DriveUiProvider>().dragHover;
    if (!hover) return const SizedBox.shrink();

    return IgnorePointer(
      child: Container(
        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.08),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Theme.of(context).colorScheme.primary,
                width: 2,
              ),
              boxShadow: const [BoxShadow(blurRadius: 24, spreadRadius: 2, color: Colors.black26)],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.file_upload_outlined,
                    size: 48, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 12),
                Text(
                  'Thả file hoặc thư mục để upload',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
