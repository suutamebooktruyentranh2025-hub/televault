import 'package:flutter_test/flutter_test.dart';
import 'package:televault/widgets/vault_folder_picker.dart';

void main() {
  group('folder move picker helpers', () {
    test('excludes source folder and descendants from list', () {
      expect(isExcludedMoveDestination('/manga/', '/manga/'), isTrue);
      expect(isExcludedMoveDestination('/manga/a/', '/manga/'), isTrue);
      expect(isExcludedMoveDestination('/archive/', '/manga/'), isFalse);
    });

    test('canMoveFolderTo blocks same path and moving into self', () {
      expect(canMoveFolderTo('/', '/archive/manga/'), isTrue);
      expect(canMoveFolderTo('/dest/', '/archive/manga/'), isTrue);
      expect(canMoveFolderTo('/archive/', '/archive/manga/'), isFalse);
      expect(canMoveFolderTo('/manga/', '/manga/'), isFalse);
      expect(canMoveFolderTo('/manga/sub/', '/manga/'), isFalse);
      expect(canMoveFolderTo('/archive/', '/archive/'), isFalse);
    });
  });
}
