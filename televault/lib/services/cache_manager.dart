class CachedFile {
  final int messageId;
  final int size;
  final DateTime lastUsed;
  final int? tdFileId;
  const CachedFile({
    required this.messageId,
    required this.size,
    required this.lastUsed,
    this.tdFileId,
  });
}

/// Chọn file cần xoá (cũ nhất trước) cho tới khi tổng size <= limit.
/// [protectedIds]: đang preview — không bao giờ xoá.
List<CachedFile> pickEvictions(List<CachedFile> cached,
    {required int limitBytes, Set<int> protectedIds = const {}}) {
  var total = cached.fold<int>(0, (s, e) => s + e.size);
  if (total <= limitBytes) return [];
  final candidates = cached.where((e) => !protectedIds.contains(e.messageId)).toList()
    ..sort((a, b) => a.lastUsed.compareTo(b.lastUsed));
  final out = <CachedFile>[];
  for (final e in candidates) {
    if (total <= limitBytes) break;
    out.add(e);
    total -= e.size;
  }
  return out;
}
