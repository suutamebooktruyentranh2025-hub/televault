import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/vault_ops.dart';

VaultEntry f(int id, String path, {List<String> tags = const []}) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: 'h', mtime: DateTime.utc(2026), tags: tags);

void main() {
  group('resolvePathConflicts', () {
    test('newer message wins, older renamed with conflict suffix', () {
      final fixes = resolvePathConflicts(
        [f(1, '/a.pdf'), f(2, '/a.pdf')],
        today: DateTime.utc(2026, 7, 3),
      );
      expect(fixes.single.entry.messageId, 1);
      expect(fixes.single.newPath, '/a (conflict 2026-07-03).pdf');
    });

    test('no conflicts -> empty', () {
      expect(resolvePathConflicts([f(1, '/a.pdf'), f(2, '/b.pdf')], today: DateTime.utc(2026)), isEmpty);
    });

    test('extension-less file gets suffix at end', () {
      final fixes = resolvePathConflicts([f(1, '/README'), f(2, '/README')], today: DateTime.utc(2026, 7, 3));
      expect(fixes.single.newPath, '/README (conflict 2026-07-03)');
    });

    test('idempotent: renamed entry no longer conflicts', () {
      final fixes = resolvePathConflicts(
        [f(1, '/a (conflict 2026-07-03).pdf'), f(2, '/a.pdf')],
        today: DateTime.utc(2026, 7, 3),
      );
      expect(fixes, isEmpty);
    });
  });

  group('planFolderRename', () {
    test('rewrites all descendant paths', () {
      final steps = planFolderRename(
        [f(1, '/x/a.pdf'), f(2, '/x/sub/b.pdf'), f(3, '/y/c.pdf'), VaultEntry.dirMarker(messageId: 4, path: '/x/sub2/')],
        from: '/x/', to: '/z/',
      );
      expect(steps, [
        const EditCaptionStep(1, '/z/a.pdf'),
        const EditCaptionStep(2, '/z/sub/b.pdf'),
        const EditCaptionStep(4, '/z/sub2/'),
      ]);
    });
  });

  group('planFolderDelete', () {
    test('deletes all descendants including markers', () {
      final steps = planFolderDelete(
        [f(1, '/x/a.pdf'), VaultEntry.dirMarker(messageId: 2, path: '/x/'), f(3, '/y/b.pdf')],
        folder: '/x/',
      );
      expect(steps.map((s) => s.messageId), [1, 2]);
    });
  });

  group('planTagRename / planTagDelete', () {
    test('rename tag rewrites tags of matching folder markers only', () {
      final steps = planTagRename(
        [
          VaultEntry.dirMarker(messageId: 1, path: '/a/', tags: ['old', 'k']),
          f(2, '/b.pdf', tags: ['old']),
        ],
        from: 'old',
        to: 'new',
      );
      expect(steps.single.messageId, 1);
      expect(steps.single.newTags, ['new', 'k']);
    });

    test('delete tag removes it from folder markers only', () {
      final steps = planTagDelete(
        [VaultEntry.dirMarker(messageId: 1, path: '/a/', tags: ['x', 'y'])],
        tag: 'x',
      );
      expect(steps.single.newTags, ['y']);
    });
  });
}
