/// Phân tách chuỗi tag người dùng nhập. Nhiều tag cách nhau bằng dấu phẩy;
/// mỗi tag có thể chứa khoảng trắng (vd. "Kiếm Hiệp, manga").
List<String> parseTagInput(String input) {
  return input
      .split(',')
      .map((t) => t.trim())
      .where((t) => t.isNotEmpty)
      .toList();
}

String formatTagsForInput(Iterable<String> tags) => tags.join(', ');

/// Gợi ý tag có sẵn khi gõ (không phân biệt dấu/hoa thường).
List<String> filterTagSuggestions({
  required List<String> knownTags,
  required List<String> selectedTags,
  required String query,
  required bool Function(String haystack, String needle) matches,
}) {
  final selected = selectedTags.toSet();
  final q = query.trim();
  return knownTags
      .where((t) => !selected.contains(t))
      .where((t) => q.isEmpty || matches(t, q))
      .toList();
}

