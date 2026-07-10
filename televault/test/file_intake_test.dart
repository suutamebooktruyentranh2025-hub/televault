import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/file_intake.dart';

void main() {
  test('single file goes directly into dest folder', () {
    expect(destPathFor('/Users/x/report.pdf', pickedRoot: null, destFolder: '/docs/'),
        '/docs/report.pdf');
  });

  test('file inside picked directory keeps relative structure', () {
    expect(
        destPathFor('/Users/x/manga/OnePiece/v1.cbz',
            pickedRoot: '/Users/x/manga', destFolder: '/'),
        '/manga/OnePiece/v1.cbz');
  });

  test('windows separators normalized', () {
    expect(
        destPathFor(r'C:\data\a\b.txt', pickedRoot: r'C:\data', destFolder: '/x/'),
        '/x/data/a/b.txt');
  });
}
