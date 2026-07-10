import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import '../models/vault_entry.dart';
import '../providers/app_settings_provider.dart';
import '../providers/drive_ui_provider.dart';
import '../providers/session_provider.dart';
import '../providers/vault_provider.dart';
import '../services/cache_manager.dart';
import '../services/file_export.dart';
import '../services/file_intake.dart';
import '../widgets/drive_sidebar.dart';
import '../widgets/drive_top_bar.dart';
import '../widgets/drop_upload_overlay.dart';
import '../widgets/search_results_body.dart';
import '../widgets/upload_activity_panel.dart';
import 'browser_screen.dart';
import 'preview_screen.dart';
import 'tags_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late VaultProvider _vaultProvider;
  late DriveUiProvider _driveUi;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionProvider>();
    _vaultProvider = VaultProvider(session.boot.db);
    _driveUi = DriveUiProvider();
    _vaultProvider.refresh();
    session.channel!.changes.stream.listen((_) => _vaultProvider.refresh());

    if (Platform.isAndroid || Platform.isIOS) {
      final shareSession = session;
      ReceiveSharingIntent.instance.getMediaStream().listen((files) async {
        final vault = shareSession.vault;
        if (vault == null) return;
        for (final f in files) {
          final dest = destPathFor(f.path, destFolder: '/');
          if (!await shareSession.guardUpload(dest)) break;
          vault.enqueueUpload(File(f.path), dest);
        }
      });
    }
  }

  Future<void> _enqueueUploads(List<(String, String)> picked) async {
    if (picked.isEmpty) return;
    final session = context.read<SessionProvider>();
    await WakelockPlus.enable();
    var queued = 0;
    for (final (local, dest) in picked) {
      if (!await session.guardUpload(dest)) break;
      final vault = session.vault!;
      final digest = await sha256.bind(File(local).openRead()).first;
      final dup = await vault.checkDuplicate(digest.toString());
      if (dup != null && mounted) {
        final settings = context.read<AppSettingsProvider>();
        final go = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            content: Text(settings.t('dup_upload_message', {'path': dup.path})),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(settings.t('dup_skip'))),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(settings.t('dup_upload'))),
            ],
          ),
        );
        if (go != true) continue;
      }
      vault.enqueueUpload(File(local), dest);
      queued++;
    }
    if (queued > 0 && mounted) {
      final settings = context.read<AppSettingsProvider>();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('upload_queued_snack_panel', {'count': '$queued'}))),
      );
    }
  }

  Future<void> _uploadFiles() async {
    try {
      final picked = await pickFiles(_vaultProvider.currentFolder);
      await _enqueueUploads(picked);
    } on PlatformException catch (e) {
      if (!mounted) return;
      final settings = context.read<AppSettingsProvider>();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('picker_error', {'error': e.message ?? e.code}))),
      );
    }
  }

  Future<void> _uploadFolder() async {
    try {
      final picked = await pickDirectory(_vaultProvider.currentFolder);
      await _enqueueUploads(picked);
    } on PlatformException catch (e) {
      if (!mounted) return;
      final settings = context.read<AppSettingsProvider>();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('picker_error', {'error': e.message ?? e.code}))),
      );
    }
  }

  Future<void> _createFolderInCurrent() async {
    final session = context.read<SessionProvider>();
    final settings = context.read<AppSettingsProvider>();
    final parent = _vaultProvider.currentFolder;
    final c = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(settings.t('new_folder_title')),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(settings.t('action_cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: Text(settings.t('action_ok'))),
        ],
      ),
    );
    if (!mounted || name == null || name.isEmpty) return;
    await session.vault!.createFolder('$parent$name/');
    await _vaultProvider.refresh();
  }

  Future<void> _handleDrop(DropDoneDetails detail) async {
    _driveUi.setDragHover(false);
    final vp = _vaultProvider;
    final session = context.read<SessionProvider>();
    final vault = session.vault!;
    var queued = 0;
    try {
      for (final xfile in detail.files) {
        final f = File(xfile.path);
        if (f.statSync().type == FileSystemEntityType.directory) {
          for (final sub in Directory(xfile.path).listSync(recursive: true).whereType<File>()) {
            final dest = destPathFor(sub.path, pickedRoot: xfile.path, destFolder: vp.currentFolder);
            if (!await session.guardUpload(dest)) return;
            final staged = await stageLocalFile(sub.path);
            vault.enqueueUpload(
              File(staged),
              dest,
            );
            queued++;
          }
        } else {
          final dest = destPathFor(xfile.path, destFolder: vp.currentFolder);
          if (!await session.guardUpload(dest)) return;
          final staged = await stageLocalFile(xfile.path);
          vault.enqueueUpload(
            File(staged),
            dest,
          );
          queued++;
        }
      }
    } on FileSystemException catch (e) {
      if (!mounted) return;
      final settings = context.read<AppSettingsProvider>();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('read_file_error', {'error': e.message}))),
      );
      return;
    }
    if (queued > 0 && mounted) {
      final settings = context.read<AppSettingsProvider>();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('upload_queued_snack', {'count': '$queued'}))),
      );
    }
  }

  Future<void> _saveFolder(String folderPath) async {
    final session = context.read<SessionProvider>();
    final settings = context.read<AppSettingsProvider>();
    final vault = session.vault!;
    final folderName = folderExportName(folderPath);
    if (!mounted) return;

    final progress = ValueNotifier<String>(settings.t('save_folder_preparing'));
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => ValueListenableBuilder(
        valueListenable: progress,
        builder: (_, msg, __) => AlertDialog(
          title: Text(settings.t('save_folder_title', {'name': folderName})),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const LinearProgressIndicator(),
              const SizedBox(height: 12),
              Text(msg, textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );

    try {
      final result = await exportVaultFolder(
        db: session.boot.db,
        vault: vault,
        folderPrefix: folderPath,
        onProgress: (current, total, name) {
          progress.value = '$current/$total — $name';
        },
        onDownloading: (task, done) async {
          progress.value = settings.t('save_folder_downloading', {'name': task.label});
          await done;
        },
      );
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      if (result == null) return;
      final msg = result.failed == 0
          ? settings.t('save_folder_ok', {'saved': '${result.saved}', 'dest': result.destRoot})
          : settings.t('save_folder_partial', {
              'saved': '${result.saved}',
              'failed': '${result.failed}',
              'dest': result.destRoot,
            });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    } catch (err) {
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('save_folder_fail', {'error': '$err'}))),
      );
    }
  }

  Future<void> _saveFile(VaultEntry e) async {
    final session = context.read<SessionProvider>();
    final settings = context.read<AppSettingsProvider>();
    final vault = session.vault!;
    if (!mounted) return;
    try {
      final dest = await exportVaultEntry(
        db: session.boot.db,
        vault: vault,
        entry: e,
        onDownloading: (task, done) async {
          if (!mounted) return;
          showDialog<void>(
            context: context,
            barrierDismissible: false,
            builder: (ctx) => AlertDialog(
              title: Text(settings.t('downloading_title', {'name': e.name})),
              content: StreamBuilder<double>(
                stream: task.progress,
                builder: (_, s) => LinearProgressIndicator(value: s.data),
              ),
            ),
          );
          await done;
          if (mounted) Navigator.of(context, rootNavigator: true).pop();
        },
      );
      if (!mounted || dest == null) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('saved_to', {'dest': dest}))),
      );
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(settings.t('save_file_fail', {'error': '$err'}))),
      );
    }
  }

  Future<void> _pushPreview(VaultEntry e, String localPath) async {
    final session = context.read<SessionProvider>();
    await session.boot.db.touchLastUsed(e.messageId);
    final limit = await session.boot.db.getCacheLimitBytes();
    final cached = await session.boot.db.getCached();
    for (final victim in pickEvictions(cached, limitBytes: limit, protectedIds: {e.messageId})) {
      await session.boot.db.setLocalPath(victim.messageId, null);
      if (victim.tdFileId != null) {
        await session.boot.td.send({'@type': 'deleteFile', 'file_id': victim.tdFileId});
      }
    }
    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => PreviewScreen(entry: e, localPath: localPath)),
    );
  }

  /// Click file — ảnh/text mở preview trực tiếp; loại khác chỉ mở nếu đã cache.
  Future<void> _openFile(VaultEntry e) async {
    if (isDirectPreviewable(e.name)) {
      await _previewFile(e);
      return;
    }
    final vault = context.read<SessionProvider>().vault!;
    final localPath = e.localPath ?? await vault.readLocalPath(e.messageId);
    if (localPath != null && File(localPath).existsSync()) {
      await _pushPreview(e, localPath);
      return;
    }
    if (!mounted) return;
    final settings = context.read<AppSettingsProvider>();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(settings.t('file_not_cached'))),
    );
  }

  /// Menu «Xem trước» — tải về cache rồi mở preview.
  Future<void> _previewFile(VaultEntry e) async {
    final vault = context.read<SessionProvider>().vault!;
    final settings = context.read<AppSettingsProvider>();
    var localPath = e.localPath ?? await vault.readLocalPath(e.messageId);
    if (localPath == null || !File(localPath).existsSync()) {
      final (task, done) = vault.enqueueDownload(e);
      if (!mounted) return;
      showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: Text(settings.t('downloading_title', {'name': e.name})),
          content: StreamBuilder<double>(
            stream: task.progress,
            builder: (_, s) => LinearProgressIndicator(value: s.data),
          ),
        ),
      );
      await done;
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
      localPath = await vault.readLocalPath(e.messageId);
      if (localPath == null) return;
    }
    await _pushPreview(e, localPath);
  }

  Widget _mainContent() {
    return Consumer<DriveUiProvider>(
      builder: (context, ui, _) {
        if (ui.isSearching) {
          return SearchResultsBody(
            query: ui.searchQuery,
            onOpenFile: _openFile,
            onPreviewFile: _previewFile,
            onSaveFile: _saveFile,
          );
        }
        return switch (ui.section) {
          DriveSection.vault => BrowserScreen(
              onOpenFile: _openFile,
              onPreviewFile: _previewFile,
              onSaveFile: _saveFile,
              onSaveFolder: _saveFolder,
              onCreateFolderInCurrent: _createFolderInCurrent,
              onUploadFiles: _uploadFiles,
              onUploadFolder: _uploadFolder,
            ),
          DriveSection.tags => const TagsScreen(),
        };
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _vaultProvider),
        ChangeNotifierProvider.value(value: _driveUi),
      ],
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= 840;
          return Scaffold(
            drawer: wide ? null : const DriveSidebarDrawer(),
            body: DropTarget(
              onDragEntered: (_) => _driveUi.setDragHover(true),
              onDragExited: (_) => _driveUi.setDragHover(false),
              onDragDone: _handleDrop,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (wide) const DriveSidebar(),
                  Expanded(
                    child: Stack(
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Builder(
                              builder: (ctx) => DriveTopBar(
                                showMenuButton: !wide,
                                onMenuPressed: () => Scaffold.of(ctx).openDrawer(),
                              ),
                            ),
                            const Divider(height: 1),
                            Expanded(child: _mainContent()),
                          ],
                        ),
                        const Positioned(
                          right: 16,
                          bottom: 16,
                          child: UploadActivityPanel(),
                        ),
                        const DropUploadOverlay(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
