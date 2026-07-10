import 'package:flutter_test/flutter_test.dart';
import 'package:televault/screens/preview_screen.dart';

void main() {
  group('previewKindOf', () {
    test('images', () {
      expect(previewKindOf('photo.jpg'), PreviewKind.image);
      expect(previewKindOf('x.PNG'), PreviewKind.image);
    });

    test('text files', () {
      expect(previewKindOf('notes.txt'), PreviewKind.text);
      expect(previewKindOf('readme.md'), PreviewKind.text);
    });

    test('other', () {
      expect(previewKindOf('doc.pdf'), PreviewKind.pdf);
      expect(previewKindOf('clip.mp4'), PreviewKind.video);
      expect(previewKindOf('archive.zip'), PreviewKind.other);
    });
  });

  group('isDirectPreviewable', () {
    test('image and text only', () {
      expect(isDirectPreviewable('a.jpg'), isTrue);
      expect(isDirectPreviewable('b.txt'), isTrue);
      expect(isDirectPreviewable('c.pdf'), isFalse);
      expect(isDirectPreviewable('d.zip'), isFalse);
    });
  });
}
