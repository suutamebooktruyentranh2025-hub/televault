import 'dart:io';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:open_filex/open_filex.dart';
import 'package:pdfx/pdfx.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../providers/app_settings_provider.dart';
import '../models/vault_entry.dart';

enum PreviewKind { image, text, pdf, video, other }

PreviewKind previewKindOf(String name) {
  final ext = name.contains('.') ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].contains(ext)) return PreviewKind.image;
  if (['txt', 'text', 'log', 'md', 'csv'].contains(ext)) return PreviewKind.text;
  if (ext == 'pdf') return PreviewKind.pdf;
  if (['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'flac', 'ogg'].contains(ext)) {
    return PreviewKind.video;
  }
  return PreviewKind.other;
}

/// Ảnh và text — click file mở preview trực tiếp (tải cache nếu cần).
bool isDirectPreviewable(String name) {
  final kind = previewKindOf(name);
  return kind == PreviewKind.image || kind == PreviewKind.text;
}

/// Hiện file đã có local (cache TDLib). Caller tải trước qua menu «Xem trước».
class PreviewScreen extends StatefulWidget {
  final VaultEntry entry;
  final String localPath;
  const PreviewScreen({super.key, required this.entry, required this.localPath});

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  Player? _player;
  VideoController? _video;
  PdfControllerPinch? _pdf;
  Future<String>? _textContent;

  @override
  void initState() {
    super.initState();
    switch (previewKindOf(widget.entry.name)) {
      case PreviewKind.video:
        MediaKit.ensureInitialized();
        _player = Player();
        _video = VideoController(_player!);
        _player!.open(Media('file://${widget.localPath}'));
      case PreviewKind.pdf:
        _pdf = PdfControllerPinch(document: PdfDocument.openFile(widget.localPath));
      case PreviewKind.text:
        _textContent = File(widget.localPath).readAsString();
      default:
    }
  }

  @override
  void dispose() {
    _player?.dispose();
    _pdf?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final kind = previewKindOf(widget.entry.name);
    final settings = context.watch<AppSettingsProvider>();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.entry.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: 'Lưu về máy / chia sẻ',
            onPressed: () => SharePlus.instance.share(ShareParams(files: [XFile(widget.localPath)])),
          ),
        ],
      ),
      body: switch (kind) {
        PreviewKind.image => InteractiveViewer(
            maxScale: 8,
            child: Center(child: Image.file(File(widget.localPath))),
          ),
        PreviewKind.text => FutureBuilder<String>(
            future: _textContent,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError) {
                return Center(child: Text(settings.t('preview_read_error', {'error': '${snap.error}'})));
              }
              return Scrollbar(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: SelectableText(
                    snap.data ?? '',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontFamily: 'monospace',
                          height: 1.4,
                        ),
                  ),
                ),
              );
            },
          ),
        PreviewKind.pdf => PdfViewPinch(controller: _pdf!),
        PreviewKind.video => Video(controller: _video!),
        PreviewKind.other => Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.insert_drive_file_outlined, size: 96),
              const SizedBox(height: 16),
              Text(widget.entry.name),
              const SizedBox(height: 16),
              FilledButton.icon(
                icon: const Icon(Icons.open_in_new),
                label: Text(settings.t('preview_open_external')),
                onPressed: () => OpenFilex.open(widget.localPath),
              ),
            ]),
          ),
      },
    );
  }
}
