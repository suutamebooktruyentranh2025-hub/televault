import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/caption_codec.dart';
import 'package:televault/models/vault_entry.dart';

void main() {
  final file = VaultEntry(
    messageId: 100,
    path: '/Truyện/One Piece/tập-01.pdf',
    size: 245891072,
    sha256: 'a3f8b1',
    mtime: DateTime.utc(2026, 7, 3, 10, 15),
    tags: const ['manga', 'đã đọc'],
  );

  test('encode/decode file roundtrip', () {
    final caption = encodeCaption(file);
    final back = decodeCaption(100, caption);
    expect(back, isNotNull);
    expect(back!.path, file.path);
    expect(back.size, file.size);
    expect(back.sha256, file.sha256);
    expect(back.mtime, file.mtime);
    expect(back.tags, isEmpty);
    expect(back.isDir, isFalse);
    expect(back.messageId, 100);
  });

  test('encode/decode dir marker with tags roundtrip', () {
    final dir = VaultEntry.dirMarker(messageId: 5, path: '/Trống/', tags: ['work']);
    final back = decodeCaption(5, encodeCaption(dir));
    expect(back!.isDir, isTrue);
    expect(back.path, '/Trống/');
    expect(back.tags, ['work']);
  });

  test('encode/decode dir marker roundtrip', () {
    final dir = VaultEntry.dirMarker(messageId: 5, path: '/Trống/');
    final back = decodeCaption(5, encodeCaption(dir));
    expect(back!.isDir, isTrue);
    expect(back.path, '/Trống/');
  });

  test('entry name and parent', () {
    expect(file.name, 'tập-01.pdf');
    expect(file.parent, '/Truyện/One Piece/');
    expect(VaultEntry.dirMarker(messageId: 1, path: '/a/b/').name, 'b');
    expect(VaultEntry.dirMarker(messageId: 1, path: '/a/b/').parent, '/a/');
  });

  test('decode garbage returns null', () {
    expect(decodeCaption(1, 'hello world'), isNull);
    expect(decodeCaption(1, '{"v":99,"path":"/x"}'), isNull);
    expect(decodeCaption(1, '{"v":1}'), isNull); // thiếu path
    expect(decodeCaption(1, '{"v":1,"path":"no-slash"}'), isNull);
    expect(decodeCaption(1, ''), isNull);
    expect(decodeCaption(1, '{"v":1'), isNull); // JSON cụt
    // mtime sai kiểu -> không dùng được -> null
    expect(decodeCaption(1, '{"v":1,"path":"/a.txt","mtime":123}'), isNull);
  });

  test('decode wrong-typed optional fields falls back to defaults', () {
    final e = decodeCaption(
        1, '{"v":1,"path":"/a.txt","size":"10","sha256":true,"mtime":"2026-01-01T00:00:00Z"}');
    expect(e, isNotNull);
    expect(e!.size, 0);
    expect(e.sha256, '');
  });

  test('decode missing optional fields uses defaults', () {
    final e = decodeCaption(7, '{"v":1,"path":"/a.txt","size":10,"sha256":"x","mtime":"2026-01-01T00:00:00Z"}');
    expect(e!.tags, isEmpty);
  });
}
