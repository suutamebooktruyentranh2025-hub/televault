import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/telegram/td_api_builders.dart';

void main() {
  test('legacy API sends inputFileLocal directly', () {
    final m = inputMessageDocument(
      filePath: '/tmp/a.cbz',
      captionText: '{}',
      legacyApi: true,
    );
    expect(m['document'], {'@type': 'inputFileLocal', 'path': '/tmp/a.cbz'});
  });

  test('modern API wraps inputFileLocal in inputDocument', () {
    final m = inputMessageDocument(
      filePath: '/tmp/a.cbz',
      captionText: '{}',
      legacyApi: false,
      disableContentTypeDetection: true,
    );
    final doc = m['document'] as Map<String, dynamic>;
    expect(doc['@type'], 'inputDocument');
    expect(doc['document'], {'@type': 'inputFileLocal', 'path': '/tmp/a.cbz'});
    expect(doc['disable_content_type_detection'], isTrue);
  });

  test('cbz triggers content type detection bypass', () {
    expect(shouldDisableContentTypeDetection('/x/file.cbz'), isTrue);
    expect(shouldDisableContentTypeDetection('/x/file.pdf'), isFalse);
  });
}
