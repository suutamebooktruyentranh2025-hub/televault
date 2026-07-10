class VaultEntry {
  final int messageId;

  /// File: '/a/b.pdf'. Thư mục marker: '/a/b/'.
  final String path;
  final int size;
  final String sha256;
  final DateTime mtime;
  final List<String> tags;

  /// Điền sau từ IndexDB — đường dẫn file đã cache local (null nếu chưa tải).
  final String? localPath;

  const VaultEntry({
    required this.messageId,
    required this.path,
    required this.size,
    required this.sha256,
    required this.mtime,
    this.tags = const [],
    this.localPath,
  });

  factory VaultEntry.dirMarker({required int messageId, required String path, List<String> tags = const []}) {
    assert(path.endsWith('/'));
    return VaultEntry(
      messageId: messageId,
      path: path,
      size: 0,
      sha256: '',
      mtime: DateTime.now().toUtc(),
      tags: tags,
    );
  }

  bool get isDir => path.endsWith('/');

  String get name {
    final p = isDir ? path.substring(0, path.length - 1) : path;
    return p.substring(p.lastIndexOf('/') + 1);
  }

  /// Thư mục cha, luôn kết thúc '/'. Ví dụ '/a/b.pdf' -> '/a/', '/a/' -> '/'.
  String get parent {
    final p = isDir ? path.substring(0, path.length - 1) : path;
    final i = p.lastIndexOf('/');
    return i <= 0 ? '/' : p.substring(0, i + 1);
  }

  VaultEntry copyWith({String? path, List<String>? tags, String? localPath, int? messageId}) {
    return VaultEntry(
      messageId: messageId ?? this.messageId,
      path: path ?? this.path,
      size: size,
      sha256: sha256,
      mtime: mtime,
      tags: tags ?? this.tags,
      localPath: localPath ?? this.localPath,
    );
  }
}
