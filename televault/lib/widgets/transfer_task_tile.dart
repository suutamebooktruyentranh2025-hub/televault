import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';
import '../services/transfer_service.dart';
import '../services/vault_service.dart';
import '../utils/transfer_format.dart';

class TransferTaskTile extends StatelessWidget {
  final TransferTask task;
  final TransferQueue queue;
  final AppSettingsProvider settings;

  const TransferTaskTile({
    super.key,
    required this.task,
    required this.queue,
    required this.settings,
  });

  @override
  Widget build(BuildContext context) {
    final vault = context.read<SessionProvider>().vault;
    return StreamBuilder<TransferProgressInfo>(
      stream: task.stats,
      initialData: task.lastStats,
      builder: (context, statsSnap) {
        return StreamBuilder<double>(
          stream: task.progress,
          initialData: task.lastProgress,
          builder: (context, progressSnap) {
            final stats = statsSnap.data ?? TransferProgressInfo.empty;
            final fraction = progressSnap.data ?? 0;
            return ListTile(
              dense: true,
              leading: Icon(
                switch (task.status) {
                  TransferStatus.done => Icons.check_circle,
                  TransferStatus.failed => Icons.error_outline,
                  TransferStatus.cancelled => Icons.cancel_outlined,
                  TransferStatus.paused => Icons.pause_circle_outline,
                  TransferStatus.running => Icons.sync,
                  TransferStatus.queued => Icons.schedule,
                },
                size: 20,
                color: switch (task.status) {
                  TransferStatus.done => Colors.green,
                  TransferStatus.failed => Colors.red,
                  _ => null,
                },
              ),
              title: Text(task.label, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: _subtitle(task, stats, fraction),
              trailing: _trailing(vault, task),
            );
          },
        );
      },
    );
  }

  Widget? _trailing(VaultService? vault, TransferTask task) {
    if (task.status == TransferStatus.queued) {
      return IconButton(
        icon: const Icon(Icons.close, size: 18),
        onPressed: () => queue.cancel(task.id),
      );
    }
    if (vault == null) return null;
    if (task.status == TransferStatus.failed) {
      return IconButton(
        icon: const Icon(Icons.refresh, size: 18),
        tooltip: settings.t('transfer_retry'),
        onPressed: () => vault.retryTransfer(task),
      );
    }
    if (task.status == TransferStatus.paused) {
      return IconButton(
        icon: const Icon(Icons.play_arrow, size: 18),
        tooltip: settings.t('transfer_resume'),
        onPressed: () => vault.resumeTransfer(task),
      );
    }
    return null;
  }

  Widget _subtitle(TransferTask task, TransferProgressInfo stats, double fraction) {
    switch (task.status) {
      case TransferStatus.running:
        final pct = (fraction * 100).round();
        final speed = formatTransferSpeed(stats.bytesPerSecond);
        final eta = formatTransferEta(stats.eta);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            LinearProgressIndicator(value: fraction > 0 ? fraction : null),
            const SizedBox(height: 4),
            Text(settings.t('transfer_progress_line', {
              'pct': '$pct',
              'speed': speed,
              'eta': eta,
            })),
          ],
        );
      case TransferStatus.failed:
        return Text(
          task.error?.toString() ?? settings.t('upload_status_failed'),
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
        );
      case TransferStatus.paused:
        return Text(settings.t('upload_status_paused'));
      case TransferStatus.queued:
        return Text(settings.t('upload_status_queued'));
      case TransferStatus.done:
        return Text(settings.t('upload_status_done'));
      case TransferStatus.cancelled:
        return Text(settings.t('upload_status_cancelled'));
    }
  }
}
