import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/session_provider.dart';
import '../providers/app_settings_provider.dart';
import '../services/transfer_service.dart';
import '../widgets/transfer_task_tile.dart';

class UploadActivityPanel extends StatelessWidget {
  const UploadActivityPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final queue = context.read<SessionProvider>().queue;
    final settings = context.watch<AppSettingsProvider>();
    return StreamBuilder<void>(
      stream: queue.changes.stream,
      builder: (context, _) {
        final uploads = queue.tasks.where((t) => t.kind == TransferKind.upload).toList();
        final downloads = queue.tasks.where((t) => t.kind == TransferKind.download).toList();
        final active = queue.tasks.where((t) =>
            t.status == TransferStatus.queued || t.status == TransferStatus.running);
        if (queue.tasks.isEmpty) return const SizedBox.shrink();

        return DefaultTabController(
          length: 2,
          child: Material(
            elevation: 8,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: SizedBox(
              width: 360,
              height: 320,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            active.isEmpty
                                ? settings.t('upload_panel_title_idle', {'count': '${queue.tasks.length}'})
                                : settings.t('upload_panel_title_active', {
                                    'active': '${active.length}',
                                    'total': '${queue.tasks.length}',
                                  }),
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                        ),
                        TextButton(
                          onPressed: queue.clearFinished,
                          child: Text(settings.t('upload_clear_finished')),
                        ),
                      ],
                    ),
                  ),
                  TabBar(
                    labelPadding: EdgeInsets.zero,
                    tabs: [
                      Tab(text: '${settings.t('upload_tab_upload')} (${uploads.length})'),
                      Tab(text: '${settings.t('upload_tab_download')} (${downloads.length})'),
                    ],
                  ),
                  Expanded(
                    child: TabBarView(
                      children: [
                        _TaskPane(tasks: uploads, queue: queue, settings: settings),
                        _TaskPane(tasks: downloads, queue: queue, settings: settings),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TaskPane extends StatelessWidget {
  final List<TransferTask> tasks;
  final TransferQueue queue;
  final AppSettingsProvider settings;

  const _TaskPane({required this.tasks, required this.queue, required this.settings});

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) {
      return Center(child: Text(settings.t('upload_no_tasks')));
    }
        return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: tasks.length,
      itemBuilder: (context, i) {
        final t = tasks[tasks.length - 1 - i];
        return TransferTaskTile(task: t, queue: queue, settings: settings);
      },
    );
  }
}
