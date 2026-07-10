import 'package:flutter_test/flutter_test.dart';
import 'package:televault/utils/search_text.dart';
import 'package:televault/utils/tag_text.dart';

void main() {
  test('parseTagInput keeps spaces inside one tag', () {
    expect(parseTagInput('Kiếm Hiệp'), ['Kiếm Hiệp']);
  });

  test('parseTagInput splits on comma only', () {
    expect(parseTagInput('Kiếm Hiệp, manga, đã đọc'), ['Kiếm Hiệp', 'manga', 'đã đọc']);
  });

  test('parseTagInput trims and skips empty segments', () {
    expect(parseTagInput('  a , , b  '), ['a', 'b']);
    expect(parseTagInput(''), isEmpty);
  });

  test('formatTagsForInput roundtrips with comma', () {
    const tags = ['Kiếm Hiệp', 'manga'];
    expect(parseTagInput(formatTagsForInput(tags)), tags);
  });

  test('filterTagSuggestions excludes selected and matches query', () {
    const known = ['Kiếm Hiệp', 'manga', 'đã đọc'];
    expect(
      filterTagSuggestions(
        knownTags: known,
        selectedTags: ['manga'],
        query: 'kiem',
        matches: searchTextMatches,
      ),
      ['Kiếm Hiệp'],
    );
    expect(
      filterTagSuggestions(
        knownTags: known,
        selectedTags: const [],
        query: '',
        matches: (_, __) => true,
      ),
      known,
    );
  });
}
