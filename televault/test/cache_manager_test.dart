import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/cache_manager.dart';

void main() {
  test('evict returns oldest-used entries until under limit', () {
    final entries = [
      CachedFile(messageId: 1, size: 400, lastUsed: DateTime.utc(2026, 1, 1)),
      CachedFile(messageId: 2, size: 400, lastUsed: DateTime.utc(2026, 1, 3)),
      CachedFile(messageId: 3, size: 400, lastUsed: DateTime.utc(2026, 1, 2)),
    ];
    expect(pickEvictions(entries, limitBytes: 900).map((e) => e.messageId), [1]);
    expect(pickEvictions(entries, limitBytes: 500).map((e) => e.messageId), [1, 3]);
    expect(pickEvictions(entries, limitBytes: 2000), isEmpty);
  });

  test('protected ids never evicted', () {
    final entries = [
      CachedFile(messageId: 1, size: 400, lastUsed: DateTime.utc(2026, 1, 1)),
      CachedFile(messageId: 2, size: 400, lastUsed: DateTime.utc(2026, 1, 2)),
    ];
    final out = pickEvictions(entries, limitBytes: 100, protectedIds: {1});
    expect(out.map((e) => e.messageId), [2]);
  });
}
