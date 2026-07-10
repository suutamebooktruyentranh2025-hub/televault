import 'package:flutter_test/flutter_test.dart';
import 'package:televault/utils/trash.dart';

void main() {
  group('pathInTrash', () {
    test('moves vault path under Rác preserving structure', () {
      expect(pathInTrash('/a/b.txt'), '/Rác/a/b.txt');
      expect(pathInTrash('/docs/'), '/Rác/docs/');
    });

    test('leaves paths already in trash unchanged', () {
      expect(pathInTrash('/Rác/x.txt'), '/Rác/x.txt');
    });
  });

  group('uniqueVaultPath', () {
    test('appends counter when taken', () {
      expect(
        uniqueVaultPath('/Rác/a.txt', ['/Rác/a.txt']),
        '/Rác/a (1).txt',
      );
    });
  });

  group('pathFromTrash', () {
    test('strips Rác prefix', () {
      expect(pathFromTrash('/Rác/a/b.txt'), '/a/b.txt');
      expect(pathFromTrash('/Rác/docs/'), '/docs/');
    });
  });

  group('isInTrash', () {
    test('folder marker is not in trash contents', () {
      expect(isInTrash(kTrashFolder), isFalse);
      expect(isInTrash('/Rác/file.txt'), isTrue);
    });
  });
}
