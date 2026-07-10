/// Chuẩn hoá chuỗi để tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt.
String normalizeForSearch(String input) {
  const from = 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
  const to = 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd';
  final combining = RegExp(r'[\u0300-\u036f]');
  final invisible = RegExp(r'[\u00AD\u200B-\u200D\uFEFF\u2060]');

  final buf = StringBuffer();
  for (final rune in input.replaceAll('Đ', 'd').replaceAll('đ', 'd').toLowerCase().runes) {
    final ch = String.fromCharCode(rune);
    if (combining.hasMatch(ch) || invisible.hasMatch(ch)) continue;
    final idx = from.indexOf(ch);
    buf.write(idx >= 0 ? to[idx] : ch);
  }
  return buf.toString();
}

bool searchTextMatches(String haystack, String needle) {
  final q = normalizeForSearch(needle.trim());
  if (q.isEmpty) return true;
  return normalizeForSearch(haystack).contains(q);
}

bool entryMatchesSearch(String path, List<String> tags, String query) {
  if (searchTextMatches(path, query)) return true;
  return tags.any((t) => searchTextMatches(t, query));
}
