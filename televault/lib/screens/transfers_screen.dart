import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';
import '../services/transfer_service.dart';
import '../widgets/transfer_task_tile.dart';

class TransfersScreen extends StatelessWidget {
  const TransfersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final queue = context.read<SessionProvider>().queue;
    final settings = context.watch<AppSettingsProvider>();
    return StreamBuilder<void>(
      stream: queue.changes.stream,
      builder: (context, _) {
        final uploads = queue.tasks.where((t) => t.kind == TransferKind.upload).toList();
        final downloads = queue.tasks.where((t) => t.kind == TransferKind.download).toList();
        return DefaultTabController(
          length: 2,
          child: Scaffold(
            appBar: AppBar(
              title: Text(settings.t('transfers_title')),
              bottom: TabBar(tabs: [
                Tab(text: '${settings.t('upload_tab_upload')} (${uploads.length})'),
                Tab(text: '${settings.t('upload_tab_download')} (${downloads.length})'),
              ]),
            ),
            body: TabBarView(children: [
              _TaskList(tasks: uploads, queue: queue, settings: settings),
              _TaskList(tasks: downloads, queue: queue, settings: settings),
            ]),
          ),
        );
      },
    );
  }
}

class _TaskList extends StatelessWidget {
  final List<TransferTask> tasks;
  final TransferQueue queue;
  final AppSettingsProvider settings;
  const _TaskList({required this.tasks, required this.queue, required this.settings});

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) return Center(child: Text(settings.t('transfers_empty')));
    return ListView(
      children: [
        for (final t in tasks.reversed)
          TransferTaskTile(task: t, queue: queue, settings: settings),
      ],
    );
  }
}
