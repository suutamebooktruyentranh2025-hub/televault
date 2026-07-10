# TeleVault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ứng dụng Flutter đa nền tảng (macOS/Windows/Linux/iOS/Android) dùng Telegram làm cloud storage cá nhân: kho file ảo, upload/download file tới 2GB, đồng bộ metadata realtime giữa thiết bị, tag, tìm kiếm, preview.

**Architecture:** TDLib (giao diện JSON `td_json_client`) qua `dart:ffi` với wrapper tự viết; mỗi file = 1 message trong kênh Telegram private (caption = JSON metadata); SQLite làm index local; hàng đợi truyền tải có journal; UI Provider responsive.

**Tech Stack:** Flutter, Provider, dart:ffi + TDLib prebuilt, sqflite (+ sqflite_common_ffi trên desktop/test), crypto (SHA-256), file_picker, desktop_drop, receive_sharing_intent, pdfx, media_kit, flutter_secure_storage, wakelock_plus, open_filex.

**Spec:** `docs/superpowers/specs/2026-07-03-televault-design.md`

---

## Bối cảnh cho người thực hiện (đọc trước khi làm)

**TDLib là gì ở đây:** thư viện C++ chính thức của Telegram. Ta KHÔNG gọi HTTP API; ta nạp dynamic library (`libtdjson.dylib`/`.so`/`.dll`) và nói chuyện bằng chuỗi JSON qua 3 hàm C: `td_create_client_id()`, `td_send(client_id, json)`, `td_receive(timeout)`. Mọi request là JSON có trường `"@type"`; response/update trả về qua `td_receive`. Ghép request↔response bằng trường `"@extra"` (ta tự đặt UUID).

**Lấy binary TDLib:**
- **macOS (dev chính):** `brew install tdlib` → `/opt/homebrew/lib/libtdjson.dylib` (Apple Silicon) hoặc `/usr/local/lib/libtdjson.dylib` (Intel).
- **Android:** prebuilt `.so` (arm64-v8a, armeabi-v7a, x86_64) đặt vào `android/app/src/main/jniLibs/<abi>/libtdjson.so`. Nguồn: build theo https://github.com/tdlib/td/tree/master/example/android hoặc lấy từ release của các project prebuilt cộng đồng (ví dụ `ivk1800/td-json-client-prebuilt`).
- **Windows:** `tdjson.dll` (+ deps openssl/zlib dll) cạnh file exe.
- **Linux:** `libtdjson.so` cạnh binary hoặc system lib.
- **iOS:** build static/dynamic framework theo https://github.com/tdlib/td/tree/master/example/ios (làm ở Task 15, không chặn các task khác).

Task 1–5 KHÔNG cần binary TDLib (toàn logic thuần + SQLite). Task 6 trở đi cần (dev trên macOS với brew là đủ).

**api_id / api_hash:** đăng ký tại https://my.telegram.org → API development tools (miễn phí). Truyền vào app khi build qua `--dart-define=TG_API_ID=xxx --dart-define=TG_API_HASH=yyy`. KHÔNG commit giá trị thật vào git.

**Quy ước path trong kho:** file = `/Truyện/One Piece/tập-01.pdf`; thư mục marker = `/Truyện/One Piece/` (kết thúc `/`). Path luôn bắt đầu `/`, phân cách `/`, không có `//`.

**Chạy test:** `flutter test` từ thư mục `televault/`. Test thuần logic nằm ở `test/`, không cần thiết bị.

---

### Task 1: Scaffold project Flutter

**Files:**
- Create: `televault/` (toàn bộ project qua `flutter create`)
- Modify: `televault/pubspec.yaml`
- Create: `televault/lib/main.dart` (thay nội dung mặc định)
- Create: `televault/.gitignore` (flutter create tự sinh — giữ nguyên)

- [ ] **Step 1: Tạo project**

Chạy từ root workspace:

```bash
flutter create --org com.televault --project-name televault --platforms=android,ios,macos,windows,linux televault
cd televault && flutter test
```

Expected: project tạo xong, test mẫu `widget_test.dart` PASS.

- [ ] **Step 2: Khai báo dependencies**

Thay khối `dependencies`/`dev_dependencies` trong `televault/pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  ffi: ^2.1.3
  path: ^1.9.0
  path_provider: ^2.1.5
  provider: ^6.1.2
  sqflite: ^2.4.1
  sqflite_common_ffi: ^2.3.4
  crypto: ^3.0.6
  uuid: ^4.5.1
  file_picker: ^11.0.2
  desktop_drop: ^0.6.1
  receive_sharing_intent: ^1.8.1
  share_plus: ^12.0.2
  open_filex: ^4.7.0
  pdfx: ^2.9.2
  media_kit: ^1.2.0
  media_kit_video: ^1.3.0
  media_kit_libs_video: ^1.0.6
  flutter_secure_storage: ^9.2.2
  wakelock_plus: ^1.3.3
  intl: ^0.20.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
```

Chạy: `flutter pub get`
Expected: resolve thành công. Nếu version conflict, chạy `flutter pub upgrade --major-versions` cho package bị kẹt và ghi lại version chốt.

- [ ] **Step 3: Xoá test mẫu, tạo main.dart tối thiểu**

Xoá `televault/test/widget_test.dart`. Thay `televault/lib/main.dart`:

```dart
import 'package:flutter/material.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TeleVaultApp());
}

class TeleVaultApp extends StatelessWidget {
  const TeleVaultApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TeleVault',
      theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
      home: const Scaffold(body: Center(child: Text('TeleVault'))),
    );
  }
}
```

Chạy: `cd televault && flutter analyze`
Expected: No issues found.

- [ ] **Step 4: Commit**

```bash
git add televault && git commit -m "feat: scaffold TeleVault Flutter project with dependencies"
```

---

### Task 2: Model VaultEntry + caption codec

Caption trên Telegram là nguồn chân lý. Codec phải bền: caption rác/không phải của app → decode trả `null`, không throw.

**Files:**
- Create: `televault/lib/models/vault_entry.dart`
- Create: `televault/lib/models/caption_codec.dart`
- Test: `televault/test/caption_codec_test.dart`

- [ ] **Step 1: Viết test fail**

`televault/test/caption_codec_test.dart`:

```dart
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
    expect(back.tags, file.tags);
    expect(back.isDir, isFalse);
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
  });

  test('decode missing optional fields uses defaults', () {
    final e = decodeCaption(7, '{"v":1,"path":"/a.txt","size":10,"sha256":"x","mtime":"2026-01-01T00:00:00Z"}');
    expect(e!.tags, isEmpty);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/caption_codec_test.dart`
Expected: FAIL (file không tồn tại / symbol chưa định nghĩa).

- [ ] **Step 3: Implement**

`televault/lib/models/vault_entry.dart`:

```dart
class VaultEntry {
  final int messageId;

  /// File: '/a/b.pdf'. Thư mục marker: '/a/b/'.
  final String path;
  final int size;
  final String sha256;
  final DateTime mtime;
  final List<String> tags;

  /// Điền sau từ IndexDB — đường dẫn file đã cache local (null nếu chưa tải).
  final String? localPath;

  const VaultEntry({
    required this.messageId,
    required this.path,
    required this.size,
    required this.sha256,
    required this.mtime,
    this.tags = const [],
    this.localPath,
  });

  factory VaultEntry.dirMarker({required int messageId, required String path}) {
    assert(path.endsWith('/'));
    return VaultEntry(
      messageId: messageId,
      path: path,
      size: 0,
      sha256: '',
      mtime: DateTime.now().toUtc(),
    );
  }

  bool get isDir => path.endsWith('/');

  String get name {
    final p = isDir ? path.substring(0, path.length - 1) : path;
    return p.substring(p.lastIndexOf('/') + 1);
  }

  /// Thư mục cha, luôn kết thúc '/'. Ví dụ '/a/b.pdf' -> '/a/', '/a/' -> '/'.
  String get parent {
    final p = isDir ? path.substring(0, path.length - 1) : path;
    final i = p.lastIndexOf('/');
    return i <= 0 ? '/' : p.substring(0, i + 1);
  }

  VaultEntry copyWith({String? path, List<String>? tags, String? localPath, int? messageId}) {
    return VaultEntry(
      messageId: messageId ?? this.messageId,
      path: path ?? this.path,
      size: size,
      sha256: sha256,
      mtime: mtime,
      tags: tags ?? this.tags,
      localPath: localPath ?? this.localPath,
    );
  }
}
```

`televault/lib/models/caption_codec.dart`:

```dart
import 'dart:convert';

import 'vault_entry.dart';

const int captionVersion = 1;

String encodeCaption(VaultEntry e) {
  if (e.isDir) return jsonEncode({'v': captionVersion, 'dir': e.path});
  return jsonEncode({
    'v': captionVersion,
    'path': e.path,
    'size': e.size,
    'sha256': e.sha256,
    'mtime': e.mtime.toUtc().toIso8601String(),
    if (e.tags.isNotEmpty) 'tags': e.tags,
  });
}

/// Trả null nếu caption không phải metadata hợp lệ của app (không throw).
VaultEntry? decodeCaption(int messageId, String caption) {
  Map<String, dynamic> m;
  try {
    final d = jsonDecode(caption);
    if (d is! Map<String, dynamic>) return null;
    m = d;
  } catch (_) {
    return null;
  }
  if (m['v'] != captionVersion) return null;

  final dir = m['dir'];
  if (dir is String && dir.startsWith('/') && dir.endsWith('/')) {
    return VaultEntry.dirMarker(messageId: messageId, path: dir);
  }

  final path = m['path'];
  if (path is! String || !path.startsWith('/') || path.endsWith('/')) return null;
  final mtime = DateTime.tryParse(m['mtime'] as String? ?? '');
  if (mtime == null) return null;
  return VaultEntry(
    messageId: messageId,
    path: path,
    size: (m['size'] as num?)?.toInt() ?? 0,
    sha256: m['sha256'] as String? ?? '',
    mtime: mtime.toUtc(),
    tags: (m['tags'] as List?)?.whereType<String>().toList() ?? const [],
  );
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/caption_codec_test.dart`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/models televault/test/caption_codec_test.dart
git commit -m "feat: VaultEntry model and Telegram caption codec"
```

---

### Task 3: Dựng cây thư mục ảo từ danh sách path

Kho là danh sách entry phẳng; UI cần "liệt kê nội dung 1 thư mục": file trực tiếp + tên thư mục con (suy từ path sâu hơn + dir marker).

**Files:**
- Create: `televault/lib/models/vault_tree.dart`
- Test: `televault/test/vault_tree_test.dart`

- [ ] **Step 1: Viết test fail**

`televault/test/vault_tree_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/models/vault_tree.dart';

VaultEntry f(int id, String path) => VaultEntry(
      messageId: id, path: path, size: 1, sha256: 'h',
      mtime: DateTime.utc(2026), tags: const [],
    );

void main() {
  final entries = [
    f(1, '/a.txt'),
    f(2, '/Truyện/One Piece/tập-01.pdf'),
    f(3, '/Truyện/One Piece/tập-02.pdf'),
    f(4, '/Truyện/Naruto/tập-01.pdf'),
    VaultEntry.dirMarker(messageId: 5, path: '/Trống/'),
  ];

  test('list root', () {
    final r = listFolder(entries, '/');
    expect(r.folders, ['Truyện', 'Trống']);
    expect(r.files.map((e) => e.name), ['a.txt']);
  });

  test('list nested folder', () {
    final r = listFolder(entries, '/Truyện/');
    expect(r.folders, ['Naruto', 'One Piece']);
    expect(r.files, isEmpty);
  });

  test('folders sorted, files sorted by name', () {
    final r = listFolder(entries, '/Truyện/One Piece/');
    expect(r.files.map((e) => e.name), ['tập-01.pdf', 'tập-02.pdf']);
  });

  test('empty-dir marker shows as folder but not as file', () {
    final r = listFolder(entries, '/Trống/');
    expect(r.folders, isEmpty);
    expect(r.files, isEmpty);
  });
}
```

Lưu ý test root: `folders` kỳ vọng `['Truyện', 'Trống']` — sắp theo `compareTo` chuẩn của Dart (không locale-aware; chấp nhận ở v1).

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/vault_tree_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/models/vault_tree.dart`:

```dart
import 'vault_entry.dart';

class FolderListing {
  final List<String> folders; // tên thư mục con, đã sort
  final List<VaultEntry> files; // file trực tiếp, sort theo tên
  const FolderListing(this.folders, this.files);
}

/// [folder] luôn kết thúc '/'. Trả về nội dung trực tiếp của thư mục đó.
FolderListing listFolder(List<VaultEntry> all, String folder) {
  assert(folder.endsWith('/'));
  final folders = <String>{};
  final files = <VaultEntry>[];
  for (final e in all) {
    if (!e.path.startsWith(folder) || e.path == folder) continue;
    final rest = e.path.substring(folder.length);
    final slash = rest.indexOf('/');
    if (slash == -1) {
      files.add(e); // file trực tiếp
    } else {
      folders.add(rest.substring(0, slash)); // con gián tiếp -> chỉ lấy tên thư mục con cấp 1
    }
  }
  final sortedFolders = folders.toList()..sort();
  files.sort((a, b) => a.name.compareTo(b.name));
  return FolderListing(sortedFolders, files);
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/vault_tree_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/models/vault_tree.dart televault/test/vault_tree_test.dart
git commit -m "feat: virtual folder tree listing from flat vault paths"
```

### Task 4: IndexDB — SQLite index + journal

Bản chiếu local của kho. Test chạy bằng `sqflite_common_ffi` (in-memory, không cần thiết bị).

**Files:**
- Create: `televault/lib/services/index_db.dart`
- Test: `televault/test/index_db_test.dart`

- [ ] **Step 1: Viết test fail**

`televault/test/index_db_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/index_db.dart';

VaultEntry f(int id, String path, {List<String> tags = const [], String sha = 'h'}) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: sha, mtime: DateTime.utc(2026), tags: tags);

void main() {
  late IndexDb db;

  setUp(() async {
    sqfliteFfiInit();
    db = await IndexDb.open(databaseFactoryFfi, inMemoryDatabasePath);
  });

  tearDown(() => db.close());

  test('upsert and getAll', () async {
    await db.upsert(f(1, '/a.txt', tags: ['x']));
    await db.upsert(f(2, '/b.txt'));
    final all = await db.getAll();
    expect(all.length, 2);
    expect(all.firstWhere((e) => e.messageId == 1).tags, ['x']);
  });

  test('upsert same messageId replaces', () async {
    await db.upsert(f(1, '/a.txt'));
    await db.upsert(f(1, '/renamed.txt'));
    final all = await db.getAll();
    expect(all.single.path, '/renamed.txt');
  });

  test('delete removes entry and tags', () async {
    await db.upsert(f(1, '/a.txt', tags: ['x']));
    await db.delete(1);
    expect(await db.getAll(), isEmpty);
    expect(await db.allTags(), isEmpty);
  });

  test('search by name matches path segments', () async {
    await db.upsert(f(1, '/Truyện/One Piece/tập-01.pdf'));
    await db.upsert(f(2, '/khác.txt'));
    final r = await db.search(query: 'one piece');
    expect(r.single.messageId, 1);
  });

  test('search filters by tags with AND', () async {
    await db.upsert(f(1, '/a.pdf', tags: ['manga', 'đã đọc']));
    await db.upsert(f(2, '/b.pdf', tags: ['manga']));
    final r = await db.search(tags: ['manga', 'đã đọc']);
    expect(r.single.messageId, 1);
  });

  test('allTags returns tag with file counts', () async {
    await db.upsert(f(1, '/a.pdf', tags: ['manga']));
    await db.upsert(f(2, '/b.pdf', tags: ['manga', 'hay']));
    final tags = await db.allTags();
    expect(tags['manga'], 2);
    expect(tags['hay'], 1);
  });

  test('findBySha finds duplicate', () async {
    await db.upsert(f(1, '/a.pdf', sha: 'dup'));
    final hit = await db.findBySha('dup');
    expect(hit!.messageId, 1);
    expect(await db.findBySha('none'), isNull);
  });

  test('localPath set and cleared', () async {
    await db.upsert(f(1, '/a.pdf'));
    await db.setLocalPath(1, '/tmp/cache/a.pdf');
    expect((await db.getAll()).single.localPath, '/tmp/cache/a.pdf');
    await db.setLocalPath(1, null);
    expect((await db.getAll()).single.localPath, isNull);
  });

  test('journal add, list, remove', () async {
    final id = await db.journalAdd('editCaption', {'messageId': 9, 'newPath': '/x'});
    final pending = await db.journalPending();
    expect(pending.single.op, 'editCaption');
    expect(pending.single.args['messageId'], 9);
    await db.journalRemove(id);
    expect(await db.journalPending(), isEmpty);
  });

  test('lastMessageId persists', () async {
    expect(await db.getLastMessageId(), 0);
    await db.setLastMessageId(555);
    expect(await db.getLastMessageId(), 555);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/index_db_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/services/index_db.dart`:

```dart
import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../models/vault_entry.dart';

class JournalItem {
  final int id;
  final String op;
  final Map<String, dynamic> args;
  const JournalItem(this.id, this.op, this.args);
}

class IndexDb {
  final Database _db;
  IndexDb._(this._db);

  static Future<IndexDb> open(DatabaseFactory factory, String path) async {
    final db = await factory.openDatabase(path,
        options: OpenDatabaseOptions(
          version: 1,
          onCreate: (db, _) async {
            await db.execute('''
              CREATE TABLE files(
                message_id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                mtime TEXT NOT NULL,
                local_path TEXT
              )''');
            await db.execute('CREATE INDEX idx_files_path ON files(path)');
            await db.execute('CREATE INDEX idx_files_sha ON files(sha256)');
            await db.execute('''
              CREATE TABLE file_tags(
                message_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY(message_id, tag)
              )''');
            await db.execute('''
              CREATE TABLE journal(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                op TEXT NOT NULL,
                args TEXT NOT NULL
              )''');
            await db.execute('CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          },
        ));
    return IndexDb._(db);
  }

  Future<void> close() => _db.close();

  Future<void> upsert(VaultEntry e) async {
    await _db.transaction((tx) async {
      await tx.insert(
        'files',
        {
          'message_id': e.messageId,
          'path': e.path,
          'size': e.size,
          'sha256': e.sha256,
          'mtime': e.mtime.toIso8601String(),
          'local_path': e.localPath,
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
      await tx.delete('file_tags', where: 'message_id = ?', whereArgs: [e.messageId]);
      for (final t in e.tags) {
        await tx.insert('file_tags', {'message_id': e.messageId, 'tag': t});
      }
    });
  }

  Future<void> delete(int messageId) async {
    await _db.transaction((tx) async {
      await tx.delete('files', where: 'message_id = ?', whereArgs: [messageId]);
      await tx.delete('file_tags', where: 'message_id = ?', whereArgs: [messageId]);
    });
  }

  Future<List<VaultEntry>> getAll() async {
    final rows = await _db.query('files');
    return Future.wait(rows.map(_toEntry));
  }

  Future<VaultEntry> _toEntry(Map<String, Object?> r) async {
    final id = r['message_id'] as int;
    final tagRows = await _db.query('file_tags', where: 'message_id = ?', whereArgs: [id]);
    return VaultEntry(
      messageId: id,
      path: r['path'] as String,
      size: r['size'] as int,
      sha256: r['sha256'] as String,
      mtime: DateTime.parse(r['mtime'] as String),
      tags: tagRows.map((t) => t['tag'] as String).toList(),
      localPath: r['local_path'] as String?,
    );
  }

  /// Tìm theo từ khoá tên (LIKE trên path, không phân biệt hoa thường)
  /// và/hoặc lọc tag (nhiều tag = AND).
  Future<List<VaultEntry>> search({String? query, List<String> tags = const []}) async {
    final where = <String>[];
    final args = <Object>[];
    if (query != null && query.trim().isNotEmpty) {
      where.add('LOWER(path) LIKE ?');
      args.add('%${query.trim().toLowerCase()}%');
    }
    for (final t in tags) {
      where.add('message_id IN (SELECT message_id FROM file_tags WHERE tag = ?)');
      args.add(t);
    }
    final rows = await _db.query('files',
        where: where.isEmpty ? null : where.join(' AND '),
        whereArgs: args.isEmpty ? null : args,
        orderBy: 'path');
    return Future.wait(rows.map(_toEntry));
  }

  Future<Map<String, int>> allTags() async {
    final rows = await _db.rawQuery('SELECT tag, COUNT(*) AS n FROM file_tags GROUP BY tag ORDER BY tag');
    return {for (final r in rows) r['tag'] as String: r['n'] as int};
  }

  Future<VaultEntry?> findBySha(String sha256) async {
    final rows = await _db.query('files', where: 'sha256 = ?', whereArgs: [sha256], limit: 1);
    return rows.isEmpty ? null : _toEntry(rows.first);
  }

  Future<void> setLocalPath(int messageId, String? localPath) async {
    await _db.update('files', {'local_path': localPath},
        where: 'message_id = ?', whereArgs: [messageId]);
  }

  // --- journal thao tác hàng loạt dở dang ---

  Future<int> journalAdd(String op, Map<String, dynamic> args) =>
      _db.insert('journal', {'op': op, 'args': jsonEncode(args)});

  Future<List<JournalItem>> journalPending() async {
    final rows = await _db.query('journal', orderBy: 'id');
    return rows
        .map((r) => JournalItem(r['id'] as int, r['op'] as String,
            jsonDecode(r['args'] as String) as Map<String, dynamic>))
        .toList();
  }

  Future<void> journalRemove(int id) async {
    await _db.delete('journal', where: 'id = ?', whereArgs: [id]);
  }

  // --- kv: mốc quét kênh ---

  Future<int> getLastMessageId() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['last_message_id']);
    return rows.isEmpty ? 0 : int.parse(rows.first['value'] as String);
  }

  Future<void> setLastMessageId(int id) async {
    await _db.insert('kv', {'key': 'last_message_id', 'value': '$id'},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/index_db_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/services/index_db.dart televault/test/index_db_test.dart
git commit -m "feat: SQLite index with tags, search, journal, and scan checkpoint"
```

---

### Task 5: Logic xung đột + kế hoạch thao tác hàng loạt (thuần, không I/O)

Hai bộ logic thuần để test kỹ trước khi đấu vào Telegram:
1. **Xung đột**: 2 entry cùng `path` → message_id lớn hơn (mới hơn) giữ path, message_id nhỏ hơn bị đổi tên `tên (conflict YYYY-MM-DD).ext`. Idempotent.
2. **Kế hoạch hàng loạt**: đổi tên/di chuyển/xoá thư mục, đổi tên/xoá tag → danh sách bước `EditCaption`/`DeleteMessage` để TransferService thực thi + ghi journal.

**Files:**
- Create: `televault/lib/services/vault_ops.dart`
- Test: `televault/test/vault_ops_test.dart`

- [ ] **Step 1: Viết test fail**

`televault/test/vault_ops_test.dart`:

```dart
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
    test('rename tag rewrites tags of matching files only', () {
      final steps = planTagRename(
        [f(1, '/a.pdf', tags: ['old', 'k']), f(2, '/b.pdf', tags: ['k'])],
        from: 'old', to: 'new',
      );
      expect(steps.single.messageId, 1);
      expect(steps.single.newTags, ['new', 'k']);
    });

    test('delete tag removes it from all files', () {
      final steps = planTagDelete([f(1, '/a.pdf', tags: ['x', 'y'])], tag: 'x');
      expect(steps.single.newTags, ['y']);
    });
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/vault_ops_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/services/vault_ops.dart`:

```dart
import 'package:collection/collection.dart';

import '../models/vault_entry.dart';

class ConflictFix {
  final VaultEntry entry;
  final String newPath;
  const ConflictFix(this.entry, this.newPath);
}

class EditCaptionStep {
  final int messageId;
  final String newPath;
  const EditCaptionStep(this.messageId, this.newPath);

  @override
  bool operator ==(Object o) => o is EditCaptionStep && o.messageId == messageId && o.newPath == newPath;
  @override
  int get hashCode => Object.hash(messageId, newPath);
  @override
  String toString() => 'EditCaptionStep($messageId, $newPath)';
}

class DeleteStep {
  final int messageId;
  const DeleteStep(this.messageId);
}

class RetagStep {
  final int messageId;
  final List<String> newTags;
  const RetagStep(this.messageId, this.newTags);
}

/// Cùng path -> message_id lớn nhất giữ nguyên, các bản cũ hơn đổi tên.
/// Deterministic theo message_id nên mọi thiết bị chạy ra cùng kết quả (idempotent).
List<ConflictFix> resolvePathConflicts(List<VaultEntry> entries, {required DateTime today}) {
  final fixes = <ConflictFix>[];
  final byPath = groupBy(entries.where((e) => !e.isDir), (VaultEntry e) => e.path);
  final date =
      '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
  for (final group in byPath.values.where((g) => g.length > 1)) {
    final sorted = [...group]..sort((a, b) => a.messageId.compareTo(b.messageId));
    for (final loser in sorted.sublist(0, sorted.length - 1)) {
      final p = loser.path;
      final dot = p.lastIndexOf('.');
      final slash = p.lastIndexOf('/');
      final hasExt = dot > slash;
      final stem = hasExt ? p.substring(0, dot) : p;
      final ext = hasExt ? p.substring(dot) : '';
      fixes.add(ConflictFix(loser, '$stem (conflict $date)$ext'));
    }
  }
  return fixes;
}

List<EditCaptionStep> planFolderRename(List<VaultEntry> entries, {required String from, required String to}) {
  assert(from.endsWith('/') && to.endsWith('/'));
  return entries
      .where((e) => e.path.startsWith(from))
      .map((e) => EditCaptionStep(e.messageId, to + e.path.substring(from.length)))
      .toList();
}

List<DeleteStep> planFolderDelete(List<VaultEntry> entries, {required String folder}) {
  assert(folder.endsWith('/'));
  return entries.where((e) => e.path.startsWith(folder)).map((e) => DeleteStep(e.messageId)).toList();
}

List<RetagStep> planTagRename(List<VaultEntry> entries, {required String from, required String to}) {
  return entries
      .where((e) => e.tags.contains(from))
      .map((e) => RetagStep(e.messageId, e.tags.map((t) => t == from ? to : t).toList()))
      .toList();
}

List<RetagStep> planTagDelete(List<VaultEntry> entries, {required String tag}) {
  return entries
      .where((e) => e.tags.contains(tag))
      .map((e) => RetagStep(e.messageId, e.tags.where((t) => t != tag).toList()))
      .toList();
}
```

Thêm `collection: ^1.19.0` vào `dependencies` trong `pubspec.yaml` (nếu chưa có transitively) rồi `flutter pub get`.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/vault_ops_test.dart`
Expected: PASS. Lưu ý: idempotency đạt được vì tên đã đổi `(conflict ...)` khác path gốc nên lần chạy sau không còn nhóm trùng.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/services/vault_ops.dart televault/test/vault_ops_test.dart televault/pubspec.yaml
git commit -m "feat: deterministic conflict resolution and batch operation planners"
```

---

### Task 6: TDLib FFI client

Wrapper mỏng quanh `td_json_client` (API mới: `td_create_client_id`/`td_send`/`td_receive`). Một receive-loop duy nhất chạy trong Isolate, phân phối: response theo `@extra`, update ra Stream.

**Files:**
- Create: `televault/lib/services/telegram/td_ffi.dart` (binding C thuần)
- Create: `televault/lib/services/telegram/td_client.dart` (send/receive, @extra matching, update stream)
- Test: `televault/test/td_client_matching_test.dart` (logic ghép @extra — mock, không cần binary)

- [ ] **Step 1: Viết test fail cho logic ghép request/response**

Tách logic "phân loại object nhận được" thành hàm thuần để test không cần binary:

`televault/test/td_client_matching_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/telegram/td_client.dart';

void main() {
  test('classify: object with @extra is a response', () {
    final r = classifyIncoming({'@type': 'ok', '@extra': 'req-1'});
    expect(r.extra, 'req-1');
    expect(r.isUpdate, isFalse);
  });

  test('classify: object without @extra is an update', () {
    final r = classifyIncoming({'@type': 'updateNewMessage'});
    expect(r.extra, isNull);
    expect(r.isUpdate, isTrue);
  });

  test('TdError detected from response', () {
    expect(isTdError({'@type': 'error', 'code': 429, 'message': 'Too Many Requests'}), isTrue);
    expect(isTdError({'@type': 'ok'}), isFalse);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/td_client_matching_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement binding FFI**

`televault/lib/services/telegram/td_ffi.dart`:

```dart
import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

typedef _CreateC = Int32 Function();
typedef _CreateDart = int Function();
typedef _SendC = Void Function(Int32, Pointer<Utf8>);
typedef _SendDart = void Function(int, Pointer<Utf8>);
typedef _ReceiveC = Pointer<Utf8> Function(Double);
typedef _ReceiveDart = Pointer<Utf8> Function(double);
typedef _ExecuteC = Pointer<Utf8> Function(Pointer<Utf8>);
typedef _ExecuteDart = Pointer<Utf8> Function(Pointer<Utf8>);

/// Binding thô tới libtdjson. Chỉ dùng từ TdClient.
class TdFfi {
  final DynamicLibrary _lib;
  late final _CreateDart createClientId =
      _lib.lookupFunction<_CreateC, _CreateDart>('td_create_client_id');
  late final _SendDart _send = _lib.lookupFunction<_SendC, _SendDart>('td_send');
  late final _ReceiveDart _receive = _lib.lookupFunction<_ReceiveC, _ReceiveDart>('td_receive');
  late final _ExecuteDart _execute = _lib.lookupFunction<_ExecuteC, _ExecuteDart>('td_execute');

  TdFfi._(this._lib);

  factory TdFfi.open() => TdFfi._(_openLib());

  static DynamicLibrary _openLib() {
    if (Platform.isMacOS) {
      // Ưu tiên bundle trong app (Frameworks), fallback Homebrew khi dev.
      for (final p in [
        'libtdjson.dylib',
        '/opt/homebrew/lib/libtdjson.dylib',
        '/usr/local/lib/libtdjson.dylib',
      ]) {
        try {
          return DynamicLibrary.open(p);
        } catch (_) {}
      }
      throw StateError('libtdjson.dylib not found — brew install tdlib');
    }
    if (Platform.isWindows) return DynamicLibrary.open('tdjson.dll');
    if (Platform.isIOS) return DynamicLibrary.process(); // static-link vào app
    return DynamicLibrary.open('libtdjson.so'); // Android (jniLibs) & Linux
  }

  void send(int clientId, String json) {
    final p = json.toNativeUtf8();
    try {
      _send(clientId, p);
    } finally {
      malloc.free(p);
    }
  }

  /// Blocking tới [timeout] giây — chỉ gọi từ Isolate riêng.
  String? receive(double timeout) {
    final p = _receive(timeout);
    return p == nullptr ? null : p.toDartString();
  }

  String? execute(String json) {
    final p = json.toNativeUtf8();
    try {
      final r = _execute(p);
      return r == nullptr ? null : r.toDartString();
    } finally {
      malloc.free(p);
    }
  }
}
```

- [ ] **Step 4: Implement TdClient**

`televault/lib/services/telegram/td_client.dart`:

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:isolate';

import 'package:uuid/uuid.dart';

import 'td_ffi.dart';

class Incoming {
  final String? extra;
  final Map<String, dynamic> object;
  const Incoming(this.extra, this.object);
  bool get isUpdate => extra == null;
}

Incoming classifyIncoming(Map<String, dynamic> obj) =>
    Incoming(obj['@extra'] as String?, obj);

bool isTdError(Map<String, dynamic> obj) => obj['@type'] == 'error';

class TdException implements Exception {
  final int code;
  final String message;
  TdException(this.code, this.message);
  @override
  String toString() => 'TdException($code, $message)';
}

/// Receive-loop chạy trong Isolate (td_receive blocking).
void _receiveLoop(SendPort out) {
  final ffi = TdFfi.open();
  while (true) {
    final s = ffi.receive(10.0);
    if (s != null) out.send(s);
  }
}

class TdClient {
  final TdFfi _ffi;
  late final int _clientId;
  final _uuid = const Uuid();
  final _pending = <String, Completer<Map<String, dynamic>>>{};
  final _updates = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get updates => _updates.stream;

  TdClient._(this._ffi);

  static Future<TdClient> start() async {
    final c = TdClient._(TdFfi.open());
    // Giảm log TDLib trước khi tạo client.
    c._ffi.execute(jsonEncode({'@type': 'setLogVerbosityLevel', 'new_verbosity_level': 1}));
    c._clientId = c._ffi.createClientId();
    final port = ReceivePort();
    await Isolate.spawn(_receiveLoop, port.sendPort);
    port.listen((raw) => c._onIncoming(raw as String));
    // Kick client: request đầu tiên kích hoạt vòng đời client này.
    c._ffi.send(c._clientId, jsonEncode({'@type': 'getOption', 'name': 'version'}));
    return c;
  }

  void _onIncoming(String raw) {
    final obj = jsonDecode(raw) as Map<String, dynamic>;
    // Nhiều client id có thể tồn tại — chỉ nhận của mình.
    if (obj['@client_id'] != null && obj['@client_id'] != _clientId) return;
    final inc = classifyIncoming(obj);
    if (inc.isUpdate) {
      _updates.add(inc.object);
    } else {
      final completer = _pending.remove(inc.extra);
      if (completer == null) return;
      if (isTdError(inc.object)) {
        completer.completeError(
            TdException(inc.object['code'] as int? ?? 0, inc.object['message'] as String? ?? ''));
      } else {
        completer.complete(inc.object);
      }
    }
  }

  /// Gửi request và chờ response (ghép bằng @extra).
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) {
    final extra = _uuid.v4();
    final completer = Completer<Map<String, dynamic>>();
    _pending[extra] = completer;
    _ffi.send(_clientId, jsonEncode({...request, '@extra': extra}));
    return completer.future;
  }
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/td_client_matching_test.dart`
Expected: PASS (test chỉ đụng hàm thuần, không mở binary).

- [ ] **Step 6: Smoke test thủ công với binary thật (macOS)**

```bash
brew install tdlib
```

Tạo file tạm `televault/tool/td_smoke.dart`:

```dart
import 'package:televault/services/telegram/td_client.dart';

Future<void> main() async {
  final c = await TdClient.start();
  final v = await c.send({'@type': 'getOption', 'name': 'version'});
  print('TDLib version: ${v['value']}');
}
```

Run: `cd televault && dart run tool/td_smoke.dart`
Expected: in ra `TDLib version: 1.8.x`. Giữ file này lại (dùng chẩn đoán sau này).

- [ ] **Step 7: Commit**

```bash
git add televault/lib/services/telegram televault/test/td_client_matching_test.dart televault/tool/td_smoke.dart
git commit -m "feat: TDLib FFI binding and JSON client with request/response matching"
```

---

### Task 7: AuthService — luồng đăng nhập TDLib

TDLib điều khiển auth qua update `updateAuthorizationState`; app chỉ phản hồi trạng thái hiện tại. Map sang enum đơn giản cho UI.

**Files:**
- Create: `televault/lib/services/telegram/auth_service.dart`
- Test: `televault/test/auth_service_test.dart`

- [ ] **Step 1: Viết test fail**

`televault/test/auth_service_test.dart`:

```dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/telegram/auth_service.dart';

/// Fake TdClient: ghi lại request, cho phép bơm update.
class FakeTd implements TdSender {
  final sent = <Map<String, dynamic>>[];
  final updateCtrl = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get updates => updateCtrl.stream;

  @override
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) async {
    sent.add(request);
    return {'@type': 'ok'};
  }

  void pushAuthState(String type) =>
      updateCtrl.add({'@type': 'updateAuthorizationState', 'authorization_state': {'@type': type}});
}

void main() {
  late FakeTd td;
  late AuthService auth;

  setUp(() {
    td = FakeTd();
    auth = AuthService(td,
        apiId: 1, apiHash: 'h', databaseDirectory: '/tmp/td', filesDirectory: '/tmp/td/files',
        databaseEncryptionKey: 'k');
  });

  test('waitTdlibParameters -> sends setTdlibParameters', () async {
    td.pushAuthState('authorizationStateWaitTdlibParameters');
    await Future<void>.delayed(Duration.zero);
    expect(td.sent.single['@type'], 'setTdlibParameters');
    expect(td.sent.single['api_id'], 1);
  });

  test('state stream maps TDLib states to app states', () async {
    final states = <AuthState>[];
    auth.states.listen(states.add);
    td.pushAuthState('authorizationStateWaitPhoneNumber');
    td.pushAuthState('authorizationStateWaitCode');
    td.pushAuthState('authorizationStateWaitPassword');
    td.pushAuthState('authorizationStateReady');
    await Future<void>.delayed(Duration.zero);
    expect(states, [AuthState.waitPhone, AuthState.waitCode, AuthState.waitPassword, AuthState.ready]);
  });

  test('submitPhone/code/password send right requests', () async {
    await auth.submitPhone('+84900000001');
    await auth.submitCode('12345');
    await auth.submitPassword('secret');
    expect(td.sent.map((r) => r['@type']),
        ['setAuthenticationPhoneNumber', 'checkAuthenticationCode', 'checkAuthenticationPassword']);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/auth_service_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

Trước hết thêm interface `TdSender` vào cuối `televault/lib/services/telegram/td_client.dart` và cho `TdClient` implement nó (để mock được):

```dart
/// Interface tối thiểu để service khác dùng và test mock được.
abstract class TdSender {
  Stream<Map<String, dynamic>> get updates;
  Future<Map<String, dynamic>> send(Map<String, dynamic> request);
}
```

Sửa khai báo class: `class TdClient implements TdSender {`.

`televault/lib/services/telegram/auth_service.dart`:

```dart
import 'dart:async';

import 'td_client.dart';

enum AuthState { starting, waitPhone, waitCode, waitPassword, ready, loggedOut }

class AuthService {
  final TdSender _td;
  final int apiId;
  final String apiHash;
  final String databaseDirectory;
  final String filesDirectory;
  final String databaseEncryptionKey;

  final _states = StreamController<AuthState>.broadcast();
  Stream<AuthState> get states => _states.stream;
  AuthState current = AuthState.starting;

  AuthService(this._td,
      {required this.apiId,
      required this.apiHash,
      required this.databaseDirectory,
      required this.filesDirectory,
      required this.databaseEncryptionKey}) {
    _td.updates
        .where((u) => u['@type'] == 'updateAuthorizationState')
        .listen((u) => _onAuthState(u['authorization_state'] as Map<String, dynamic>));
  }

  void _emit(AuthState s) {
    current = s;
    _states.add(s);
  }

  Future<void> _onAuthState(Map<String, dynamic> st) async {
    switch (st['@type'] as String) {
      case 'authorizationStateWaitTdlibParameters':
        await _td.send({
          '@type': 'setTdlibParameters',
          'database_directory': databaseDirectory,
          'files_directory': filesDirectory,
          'database_encryption_key': databaseEncryptionKey,
          'use_file_database': true,
          'use_chat_info_database': true,
          'use_message_database': true,
          'api_id': apiId,
          'api_hash': apiHash,
          'system_language_code': 'vi',
          'device_model': 'TeleVault',
          'application_version': '1.0.0',
        });
      case 'authorizationStateWaitPhoneNumber':
        _emit(AuthState.waitPhone);
      case 'authorizationStateWaitCode':
        _emit(AuthState.waitCode);
      case 'authorizationStateWaitPassword':
        _emit(AuthState.waitPassword);
      case 'authorizationStateReady':
        _emit(AuthState.ready);
      case 'authorizationStateClosed':
      case 'authorizationStateLoggingOut':
        _emit(AuthState.loggedOut);
    }
  }

  Future<void> submitPhone(String phone) =>
      _td.send({'@type': 'setAuthenticationPhoneNumber', 'phone_number': phone});

  Future<void> submitCode(String code) =>
      _td.send({'@type': 'checkAuthenticationCode', 'code': code});

  Future<void> submitPassword(String password) =>
      _td.send({'@type': 'checkAuthenticationPassword', 'password': password});

  Future<void> logOut() => _td.send({'@type': 'logOut'});
}
```

Ghi chú cho người thực hiện: `databaseEncryptionKey` sinh ngẫu nhiên lần đầu (32 byte hex) và cất trong `flutter_secure_storage` — làm ở Task 11 khi nối UI; ở đây service chỉ nhận chuỗi.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/auth_service_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/services/telegram televault/test/auth_service_test.dart
git commit -m "feat: TDLib authorization flow service with mockable TdSender interface"
```

### Task 8: ChannelService — tìm/tạo kênh kho, quét lịch sử, nghe update

**Files:**
- Create: `televault/lib/services/telegram/channel_service.dart`
- Test: `televault/test/channel_service_test.dart`

**Kiến thức TDLib cần dùng:**
- Tạo kênh: `createNewSupergroupChat` với `is_channel: true`, `description: '#televault-v1'`.
- Tìm kênh đã có: duyệt `getChats` (chat list main) → với mỗi chat type `chatTypeSupergroup` có `is_channel`, lấy `getSupergroupFullInfo` xem `description` chứa `#televault-v1`.
- Quét lịch sử: `getChatHistory` với `from_message_id` lùi dần (page ~100), lặp tới khi trả rỗng.
- Update realtime: `updateNewMessage` (thêm), `updateMessageContent` (sửa caption), `updateDeleteMessages` (xoá).
- Message file có `content.@type == 'messageDocument'`, caption ở `content.caption.text`, file id TDLib ở `content.document.document.id`. Dir marker là `messageText` với text ở `content.text.text`.

- [ ] **Step 1: Viết test fail**

`televault/test/channel_service_test.dart`:

```dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/services/index_db.dart';
import 'package:televault/services/telegram/channel_service.dart';
import 'package:televault/services/telegram/td_client.dart';

class ScriptedTd implements TdSender {
  final Map<String, List<Map<String, dynamic>>> responses = {};
  final sent = <Map<String, dynamic>>[];
  final updateCtrl = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get updates => updateCtrl.stream;

  @override
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) async {
    sent.add(request);
    final type = request['@type'] as String;
    final queue = responses[type];
    if (queue == null || queue.isEmpty) return {'@type': 'ok'};
    return queue.removeAt(0);
  }
}

Map<String, dynamic> docMessage(int id, String caption) => {
      '@type': 'message',
      'id': id,
      'chat_id': -100,
      'content': {
        '@type': 'messageDocument',
        'document': {'document': {'id': id * 10}},
        'caption': {'text': caption},
      },
    };

void main() {
  late ScriptedTd td;
  late IndexDb db;
  late ChannelService svc;

  setUp(() async {
    sqfliteFfiInit();
    td = ScriptedTd();
    db = await IndexDb.open(databaseFactoryFfi, inMemoryDatabasePath);
    svc = ChannelService(td, db);
  });

  test('createVaultChannel sends createNewSupergroupChat with marker', () async {
    td.responses['createNewSupergroupChat'] = [{'@type': 'chat', 'id': -100}];
    final chatId = await svc.createVaultChannel();
    expect(chatId, -100);
    final req = td.sent.singleWhere((r) => r['@type'] == 'createNewSupergroupChat');
    expect(req['is_channel'], true);
    expect((req['description'] as String).contains('#televault-v1'), isTrue);
  });

  test('scanHistory pages until empty and fills index', () async {
    td.responses['getChatHistory'] = [
      {'@type': 'messages', 'messages': [
        docMessage(3, '{"v":1,"path":"/c.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
        docMessage(2, 'không phải metadata — bỏ qua'),
      ]},
      {'@type': 'messages', 'messages': [
        docMessage(1, '{"v":1,"path":"/a.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
      ]},
      {'@type': 'messages', 'messages': []},
    ];
    await svc.scanHistory(-100);
    final all = await db.getAll();
    expect(all.map((e) => e.path).toSet(), {'/a.txt', '/c.txt'});
    expect(await db.getLastMessageId(), 3);
  });

  test('listen applies new/edit/delete updates to index', () async {
    svc.listenUpdates(-100);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message':
        docMessage(7, '{"v":1,"path":"/n.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}')});
    await Future<void>.delayed(Duration.zero);
    expect((await db.getAll()).single.path, '/n.txt');

    td.updateCtrl.add({'@type': 'updateMessageContent', 'chat_id': -100, 'message_id': 7,
        'new_content': {'@type': 'messageDocument', 'document': {'document': {'id': 70}},
          'caption': {'text': '{"v":1,"path":"/renamed.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'}}});
    await Future<void>.delayed(Duration.zero);
    expect((await db.getAll()).single.path, '/renamed.txt');

    td.updateCtrl.add({'@type': 'updateDeleteMessages', 'chat_id': -100,
        'message_ids': [7], 'is_permanent': true});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
  });

  test('updates for other chats ignored', () async {
    svc.listenUpdates(-100);
    td.updateCtrl.add({'@type': 'updateNewMessage', 'message': {
      ...docMessage(9, '{"v":1,"path":"/x.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'),
      'chat_id': -999,
    }});
    await Future<void>.delayed(Duration.zero);
    expect(await db.getAll(), isEmpty);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/channel_service_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/services/telegram/channel_service.dart`:

```dart
import 'dart:async';

import '../../models/caption_codec.dart';
import '../../models/vault_entry.dart';
import '../index_db.dart';
import 'td_client.dart';

const vaultMarker = '#televault-v1';

class ChannelService {
  final TdSender _td;
  final IndexDb _db;

  /// Bắn ra mỗi khi index thay đổi (UI reload qua Provider).
  final changes = StreamController<void>.broadcast();

  ChannelService(this._td, this._db);

  Future<int> createVaultChannel() async {
    final chat = await _td.send({
      '@type': 'createNewSupergroupChat',
      'title': 'TeleVault Storage',
      'is_channel': true,
      'description': 'Kho file TeleVault — không xoá kênh này. $vaultMarker',
    });
    return chat['id'] as int;
  }

  /// Duyệt danh sách chat tìm kênh có marker. Trả null nếu chưa có.
  Future<int?> findVaultChannel() async {
    final chats = await _td.send({'@type': 'getChats', 'limit': 200});
    for (final chatId in (chats['chat_ids'] as List? ?? const [])) {
      final chat = await _td.send({'@type': 'getChat', 'chat_id': chatId});
      final type = chat['type'] as Map<String, dynamic>?;
      if (type?['@type'] != 'chatTypeSupergroup' || type?['is_channel'] != true) continue;
      final full = await _td.send({
        '@type': 'getSupergroupFullInfo',
        'supergroup_id': type!['supergroup_id'],
      });
      if ((full['description'] as String? ?? '').contains(vaultMarker)) {
        return chatId as int;
      }
    }
    return null;
  }

  /// Entry từ 1 message TDLib; null nếu không phải metadata của app.
  VaultEntry? entryFromMessage(Map<String, dynamic> msg) {
    final content = msg['content'] as Map<String, dynamic>?;
    final id = msg['id'] as int;
    switch (content?['@type']) {
      case 'messageDocument':
        final caption = (content!['caption'] as Map<String, dynamic>?)?['text'] as String? ?? '';
        return decodeCaption(id, caption);
      case 'messageText':
        final text = (content!['text'] as Map<String, dynamic>?)?['text'] as String? ?? '';
        return decodeCaption(id, text); // dir marker
    }
    return null;
  }

  /// TDLib file id của document trong message (cần cho download).
  int? tdFileIdFromMessage(Map<String, dynamic> msg) {
    final content = msg['content'] as Map<String, dynamic>?;
    if (content?['@type'] != 'messageDocument') return null;
    return ((content!['document'] as Map<String, dynamic>?)?['document']
        as Map<String, dynamic>?)?['id'] as int?;
  }

  /// Quét toàn bộ lịch sử kênh (lùi dần), điền IndexDb.
  Future<void> scanHistory(int chatId, {void Function(int scanned)? onProgress}) async {
    var fromMessageId = 0;
    var scanned = 0;
    var maxId = await _db.getLastMessageId();
    while (true) {
      final page = await _td.send({
        '@type': 'getChatHistory',
        'chat_id': chatId,
        'from_message_id': fromMessageId,
        'offset': 0,
        'limit': 100,
        'only_local': false,
      });
      final messages = (page['messages'] as List? ?? const []).cast<Map<String, dynamic>>();
      if (messages.isEmpty) break;
      for (final msg in messages) {
        final entry = entryFromMessage(msg);
        if (entry != null) await _db.upsert(entry);
        scanned++;
        if ((msg['id'] as int) > maxId) maxId = msg['id'] as int;
      }
      fromMessageId = messages.last['id'] as int;
      onProgress?.call(scanned);
    }
    await _db.setLastMessageId(maxId);
    changes.add(null);
  }

  /// Nghe update realtime của kênh, áp vào IndexDb.
  void listenUpdates(int chatId) {
    _td.updates.listen((u) async {
      switch (u['@type']) {
        case 'updateNewMessage':
          final msg = u['message'] as Map<String, dynamic>;
          if (msg['chat_id'] != chatId) return;
          final entry = entryFromMessage(msg);
          if (entry != null) {
            await _db.upsert(entry);
            changes.add(null);
          }
        case 'updateMessageContent':
          if (u['chat_id'] != chatId) return;
          final entry = entryFromMessage({
            'id': u['message_id'],
            'content': u['new_content'],
          });
          if (entry != null) {
            await _db.upsert(entry);
            changes.add(null);
          }
        case 'updateDeleteMessages':
          if (u['chat_id'] != chatId || u['is_permanent'] != true) return;
          for (final id in (u['message_ids'] as List? ?? const [])) {
            await _db.delete(id as int);
          }
          changes.add(null);
      }
    });
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/channel_service_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/services/telegram/channel_service.dart televault/test/channel_service_test.dart
git commit -m "feat: vault channel discovery, history scan, and realtime index updates"
```

---

### Task 9: TransferService — hàng đợi upload/download/batch với retry

**Files:**
- Create: `televault/lib/services/transfer_service.dart`
- Test: `televault/test/transfer_service_test.dart`

**Kiến thức TDLib cần dùng:**
- Upload: `sendMessage` với `input_message_content = {'@type':'inputMessageDocument', 'document': {'@type':'inputFileLocal','path': localPath}, 'caption': {'@type':'formattedText','text': caption}}`. Progress qua update `updateFile` (`file.local.uploaded_size` — thực tế là `file.remote.uploaded_size`; dùng `expected_size`/`size` làm mẫu số). Message hoàn tất khi nhận `updateMessageSendSucceeded` (chứa `old_message_id` tạm và message thật — dùng message thật để lấy `message_id` chính thức đưa vào index; ChannelService đã nghe `updateNewMessage`/`updateMessageSendSucceeded` không cần đợi ở đây, nhưng TransferService phải chờ `updateMessageSendSucceeded` để biết task xong).
- Download: `downloadFile` với `file_id`, `priority: 1`, `synchronous: false`. Progress + hoàn tất qua `updateFile` (`file.local.is_downloading_completed == true`, đường dẫn tại `file.local.path`).
- Sửa caption: `editMessageCaption`. Xoá: `deleteMessages` với `revoke: true`.
- Dir marker: `sendMessage` với `inputMessageText`.

- [ ] **Step 1: Viết test fail**

`televault/test/transfer_service_test.dart`:

```dart
import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/transfer_service.dart';

void main() {
  group('TransferQueue (logic thuần)', () {
    test('runs at most maxConcurrent tasks', () async {
      var running = 0, peak = 0;
      final q = TransferQueue(maxConcurrent: 2);
      final done = <Future<void>>[];
      for (var i = 0; i < 5; i++) {
        done.add(q.add(TransferTask(
          id: 't$i', kind: TransferKind.upload, label: 'f$i',
          run: (_) async {
            running++; peak = peak > running ? peak : running;
            await Future<void>.delayed(const Duration(milliseconds: 20));
            running--;
          },
        )));
      }
      await Future.wait(done);
      expect(peak, 2);
    });

    test('retries 3 times with backoff then marks failed', () async {
      var attempts = 0;
      final q = TransferQueue(maxConcurrent: 1, baseBackoff: Duration.zero);
      final task = TransferTask(
        id: 'x', kind: TransferKind.download, label: 'f',
        run: (_) async { attempts++; throw Exception('net'); },
      );
      await q.add(task);
      expect(attempts, 3);
      expect(task.status, TransferStatus.failed);
    });

    test('cancelled task does not run', () async {
      final q = TransferQueue(maxConcurrent: 1);
      var ran = false;
      // Chiếm slot bằng task chậm.
      final slow = q.add(TransferTask(id: 's', kind: TransferKind.upload, label: 's',
          run: (_) => Future<void>.delayed(const Duration(milliseconds: 50))));
      final t = TransferTask(id: 'c', kind: TransferKind.upload, label: 'c',
          run: (_) async { ran = true; });
      final fut = q.add(t);
      q.cancel('c');
      await Future.wait([slow, fut]);
      expect(ran, isFalse);
      expect(t.status, TransferStatus.cancelled);
    });

    test('progress reported through task', () async {
      final q = TransferQueue(maxConcurrent: 1);
      final t = TransferTask(id: 'p', kind: TransferKind.upload, label: 'p',
          run: (report) async { report(0.5); report(1.0); });
      final seen = <double>[];
      t.progress.listen(seen.add);
      await q.add(t);
      await Future<void>.delayed(Duration.zero);
      expect(seen, [0.5, 1.0]);
    });
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/transfer_service_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/services/transfer_service.dart`:

```dart
import 'dart:async';
import 'dart:collection';

enum TransferKind { upload, download, batch }

enum TransferStatus { queued, running, done, failed, cancelled }

typedef ProgressReporter = void Function(double fraction);
typedef TaskBody = Future<void> Function(ProgressReporter report);

class TransferTask {
  final String id;
  final TransferKind kind;
  final String label;
  final TaskBody run;

  TransferStatus status = TransferStatus.queued;
  Object? error;
  final _progress = StreamController<double>.broadcast();
  Stream<double> get progress => _progress.stream;
  double lastProgress = 0;

  TransferTask({required this.id, required this.kind, required this.label, required this.run});

  void _report(double f) {
    lastProgress = f;
    _progress.add(f);
  }
}

/// Hàng đợi generic: giới hạn song song, retry 3 lần backoff, huỷ được.
class TransferQueue {
  int maxConcurrent; // mutable: chỉnh được từ Settings, áp dụng cho task kế tiếp
  final Duration baseBackoff;
  final int maxAttempts;

  final _waiting = Queue<(TransferTask, Completer<void>)>();
  final tasks = <TransferTask>[]; // để UI liệt kê
  int _running = 0;

  /// Bắn khi có thay đổi trạng thái bất kỳ (UI rebuild).
  final changes = StreamController<void>.broadcast();

  TransferQueue({this.maxConcurrent = 2, this.baseBackoff = const Duration(seconds: 2), this.maxAttempts = 3});

  Future<void> add(TransferTask task) {
    final completer = Completer<void>();
    tasks.add(task);
    _waiting.add((task, completer));
    changes.add(null);
    _pump();
    return completer.future;
  }

  void cancel(String taskId) {
    for (final (task, _) in _waiting) {
      if (task.id == taskId && task.status == TransferStatus.queued) {
        task.status = TransferStatus.cancelled;
        changes.add(null);
      }
    }
  }

  void _pump() {
    while (_running < maxConcurrent && _waiting.isNotEmpty) {
      final (task, completer) = _waiting.removeFirst();
      if (task.status == TransferStatus.cancelled) {
        completer.complete();
        continue;
      }
      _running++;
      _execute(task).whenComplete(() {
        _running--;
        completer.complete();
        changes.add(null);
        _pump();
      });
    }
  }

  Future<void> _execute(TransferTask task) async {
    task.status = TransferStatus.running;
    changes.add(null);
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await task.run(task._report);
        task.status = TransferStatus.done;
        return;
      } catch (e) {
        task.error = e;
        if (attempt == maxAttempts) {
          task.status = TransferStatus.failed;
          return;
        }
        await Future<void>.delayed(baseBackoff * attempt);
      }
    }
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/transfer_service_test.dart`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/services/transfer_service.dart televault/test/transfer_service_test.dart
git commit -m "feat: transfer queue with concurrency limit, retry backoff, cancel, progress"
```

---

### Task 10: VaultService — facade nối mọi thứ với Telegram

Service mà UI gọi. Nhận `TdSender + IndexDb + ChannelService + TransferQueue`, cung cấp: uploadFiles, download, deleteEntries, renameFile, renameFolder, deleteFolder, createFolder, setTags, renameTag, deleteTag, upload dedup check. Batch ops ghi journal trước, xoá journal từng bước sau khi thành công; khi khởi động chạy nốt journal dở.

**Files:**
- Create: `televault/lib/services/vault_service.dart`
- Test: `televault/test/vault_service_test.dart`

- [ ] **Step 1: Viết test fail**

`televault/test/vault_service_test.dart` (dùng lại `ScriptedTd` — chuyển nó sang file helper `test/helpers/scripted_td.dart` và import từ cả hai test):

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/services/index_db.dart';
import 'package:televault/services/telegram/channel_service.dart';
import 'package:televault/services/transfer_service.dart';
import 'package:televault/services/vault_service.dart';

import 'helpers/scripted_td.dart';

VaultEntry f(int id, String path, {List<String> tags = const []}) =>
    VaultEntry(messageId: id, path: path, size: 1, sha256: 'h', mtime: DateTime.utc(2026), tags: tags);

void main() {
  late ScriptedTd td;
  late IndexDb db;
  late VaultService vault;

  setUp(() async {
    sqfliteFfiInit();
    td = ScriptedTd();
    db = await IndexDb.open(databaseFactoryFfi, inMemoryDatabasePath);
    vault = VaultService(
      td: td, db: db,
      channel: ChannelService(td, db),
      queue: TransferQueue(maxConcurrent: 1, baseBackoff: Duration.zero),
      chatId: -100,
    );
  });

  test('renameFile edits caption with new path', () async {
    await db.upsert(f(1, '/old.txt'));
    await vault.renameFile(1, '/new.txt');
    final req = td.sent.singleWhere((r) => r['@type'] == 'editMessageCaption');
    expect(req['chat_id'], -100);
    expect(req['message_id'], 1);
    expect((req['caption'] as Map)['text'], contains('"/new.txt"'));
  });

  test('deleteEntries sends deleteMessages with revoke', () async {
    await db.upsert(f(1, '/a.txt'));
    await vault.deleteEntries([1]);
    final req = td.sent.singleWhere((r) => r['@type'] == 'deleteMessages');
    expect(req['message_ids'], [1]);
    expect(req['revoke'], true);
  });

  test('renameFolder edits caption of every descendant and journals', () async {
    await db.upsert(f(1, '/x/a.txt'));
    await db.upsert(f(2, '/x/b/c.txt'));
    await db.upsert(f(3, '/y/d.txt'));
    await vault.renameFolder('/x/', '/z/');
    final edits = td.sent.where((r) => r['@type'] == 'editMessageCaption').toList();
    expect(edits.length, 2);
    expect(await db.journalPending(), isEmpty); // journal đã dọn sau khi xong
  });

  test('setTags edits caption preserving path', () async {
    await db.upsert(f(1, '/a.txt'));
    await vault.setTags(1, ['manga']);
    final req = td.sent.singleWhere((r) => r['@type'] == 'editMessageCaption');
    expect((req['caption'] as Map)['text'], contains('"manga"'));
    expect((req['caption'] as Map)['text'], contains('"/a.txt"'));
  });

  test('createFolder sends marker text message', () async {
    await vault.createFolder('/mới/');
    final req = td.sent.singleWhere((r) => r['@type'] == 'sendMessage');
    final content = req['input_message_content'] as Map;
    expect(content['@type'], 'inputMessageText');
    expect(((content['text'] as Map)['text'] as String), contains('"/mới/"'));
  });

  test('checkDuplicate returns existing entry by sha', () async {
    await db.upsert(VaultEntry(messageId: 1, path: '/a.pdf', size: 9,
        sha256: 'dup', mtime: DateTime.utc(2026)));
    final hit = await vault.checkDuplicate('dup');
    expect(hit!.path, '/a.pdf');
  });

  test('resumePendingJournal replays remaining steps', () async {
    await db.journalAdd('editCaption', {'messageId': 5, 'caption': '{"v":1,"path":"/j.txt","size":1,"sha256":"h","mtime":"2026-01-01T00:00:00Z"}'});
    await vault.resumePendingJournal();
    expect(td.sent.single['@type'], 'editMessageCaption');
    expect(await db.journalPending(), isEmpty);
  });
}
```

`televault/test/helpers/scripted_td.dart` — copy class `ScriptedTd` từ `channel_service_test.dart` sang đây và sửa `channel_service_test.dart` import từ helper (xoá bản inline).

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/vault_service_test.dart test/channel_service_test.dart`
Expected: vault FAIL, channel vẫn PASS sau khi chuyển helper.

- [ ] **Step 3: Implement**

`televault/lib/services/vault_service.dart`:

```dart
import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';

import '../models/caption_codec.dart';
import '../models/vault_entry.dart';
import 'index_db.dart';
import 'telegram/channel_service.dart';
import 'telegram/td_client.dart';
import 'transfer_service.dart';
import 'vault_ops.dart';

class VaultService {
  final TdSender td;
  final IndexDb db;
  final ChannelService channel;
  final TransferQueue queue;
  final int chatId;

  VaultService({required this.td, required this.db, required this.channel,
      required this.queue, required this.chatId});

  // ---------- thao tác đơn ----------

  Future<void> _editCaption(int messageId, String caption) async {
    await td.send({
      '@type': 'editMessageCaption',
      'chat_id': chatId,
      'message_id': messageId,
      'caption': {'@type': 'formattedText', 'text': caption},
    });
  }

  Future<void> renameFile(int messageId, String newPath) async {
    final entry = (await db.getAll()).firstWhere((e) => e.messageId == messageId);
    await _editCaption(messageId, encodeCaption(entry.copyWith(path: newPath)));
    await db.upsert(entry.copyWith(path: newPath));
  }

  Future<void> setTags(int messageId, List<String> tags) async {
    final entry = (await db.getAll()).firstWhere((e) => e.messageId == messageId);
    await _editCaption(messageId, encodeCaption(entry.copyWith(tags: tags)));
    await db.upsert(entry.copyWith(tags: tags));
  }

  Future<void> deleteEntries(List<int> messageIds) async {
    await td.send({
      '@type': 'deleteMessages',
      'chat_id': chatId,
      'message_ids': messageIds,
      'revoke': true,
    });
    for (final id in messageIds) {
      await db.delete(id);
    }
  }

  Future<void> createFolder(String path) async {
    assert(path.endsWith('/'));
    final marker = VaultEntry.dirMarker(messageId: 0, path: path);
    await td.send({
      '@type': 'sendMessage',
      'chat_id': chatId,
      'input_message_content': {
        '@type': 'inputMessageText',
        'text': {'@type': 'formattedText', 'text': encodeCaption(marker)},
      },
    });
    // Index cập nhật khi updateNewMessage về (qua ChannelService).
  }

  Future<VaultEntry?> checkDuplicate(String sha256) => db.findBySha(sha256);

  // ---------- batch qua journal ----------

  Future<void> _runJournaled(List<(String, Map<String, dynamic>)> steps) async {
    final ids = <int>[];
    for (final (op, args) in steps) {
      ids.add(await db.journalAdd(op, args));
    }
    for (var i = 0; i < steps.length; i++) {
      await _applyJournalStep(steps[i].$1, steps[i].$2);
      await db.journalRemove(ids[i]);
    }
  }

  Future<void> _applyJournalStep(String op, Map<String, dynamic> args) async {
    switch (op) {
      case 'editCaption':
        await _editCaption(args['messageId'] as int, args['caption'] as String);
        final e = decodeCaption(args['messageId'] as int, args['caption'] as String);
        if (e != null) await db.upsert(e);
      case 'delete':
        await td.send({'@type': 'deleteMessages', 'chat_id': chatId,
            'message_ids': [args['messageId']], 'revoke': true});
        await db.delete(args['messageId'] as int);
    }
  }

  /// Gọi khi khởi động: chạy nốt batch dở dang từ lần trước.
  Future<void> resumePendingJournal() async {
    for (final item in await db.journalPending()) {
      await _applyJournalStep(item.op, item.args);
      await db.journalRemove(item.id);
    }
  }

  /// Phát hiện 2 entry cùng path và tự sửa (bản cũ đổi tên conflict).
  /// Gọi sau scanHistory và mỗi khi channel.changes bắn (debounce phía caller không cần —
  /// resolvePathConflicts idempotent nên chạy thừa vô hại).
  Future<void> resolveConflictsNow() async {
    final fixes = resolvePathConflicts(await db.getAll(), today: DateTime.now().toUtc());
    for (final fix in fixes) {
      await _editCaption(fix.entry.messageId, encodeCaption(fix.entry.copyWith(path: fix.newPath)));
      await db.upsert(fix.entry.copyWith(path: fix.newPath));
    }
  }

  Future<void> renameFolder(String from, String to) async {
    final all = await db.getAll();
    final steps = planFolderRename(all, from: from, to: to);
    final byId = {for (final e in all) e.messageId: e};
    await _runJournaled([
      for (final s in steps)
        ('editCaption', {
          'messageId': s.messageId,
          'caption': encodeCaption(byId[s.messageId]!.copyWith(path: s.newPath)),
        })
    ]);
  }

  Future<void> deleteFolder(String folder) async {
    final steps = planFolderDelete(await db.getAll(), folder: folder);
    await _runJournaled([for (final s in steps) ('delete', {'messageId': s.messageId})]);
  }

  Future<void> renameTag(String from, String to) async {
    final all = await db.getAll();
    final steps = planTagRename(all, from: from, to: to);
    final byId = {for (final e in all) e.messageId: e};
    await _runJournaled([
      for (final s in steps)
        ('editCaption', {
          'messageId': s.messageId,
          'caption': encodeCaption(byId[s.messageId]!.copyWith(tags: s.newTags)),
        })
    ]);
  }

  Future<void> deleteTag(String tag) async {
    final all = await db.getAll();
    final steps = planTagDelete(all, tag: tag);
    final byId = {for (final e in all) e.messageId: e};
    await _runJournaled([
      for (final s in steps)
        ('editCaption', {
          'messageId': s.messageId,
          'caption': encodeCaption(byId[s.messageId]!.copyWith(tags: s.newTags)),
        })
    ]);
  }

  // ---------- upload / download ----------

  Future<String> _sha256Of(File file) async {
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString();
  }

  /// Upload 1 file local vào [destFolder] (kết thúc '/'). Trả về task đã enqueue.
  TransferTask enqueueUpload(File local, String destFolder) {
    final name = local.uri.pathSegments.last;
    final task = TransferTask(
      id: 'up:${local.path}:${DateTime.now().microsecondsSinceEpoch}',
      kind: TransferKind.upload,
      label: name,
      run: (report) async {
        final sha = await _sha256Of(local);
        final entry = VaultEntry(
          messageId: 0,
          path: '$destFolder$name',
          size: await local.length(),
          sha256: sha,
          mtime: DateTime.now().toUtc(),
        );
        final sent = await td.send({
          '@type': 'sendMessage',
          'chat_id': chatId,
          'input_message_content': {
            '@type': 'inputMessageDocument',
            'document': {'@type': 'inputFileLocal', 'path': local.path},
            'caption': {'@type': 'formattedText', 'text': encodeCaption(entry)},
          },
        });
        // Chờ send succeeded cho message tạm này (progress qua updateFile).
        final tempId = sent['id'] as int;
        await _awaitSendSucceeded(tempId, report);
      },
    );
    queue.add(task);
    return task;
  }

  Future<void> _awaitSendSucceeded(int tempMessageId, ProgressReporter report) async {
    final completer = Completer<void>();
    late StreamSubscription sub;
    sub = td.updates.listen((u) {
      switch (u['@type']) {
        case 'updateFile':
          final file = u['file'] as Map<String, dynamic>;
          final remote = file['remote'] as Map<String, dynamic>? ?? const {};
          final size = (file['size'] as num?)?.toDouble() ?? 0;
          final up = (remote['uploaded_size'] as num?)?.toDouble() ?? 0;
          if (size > 0) report((up / size).clamp(0, 1));
        case 'updateMessageSendSucceeded':
          if (u['old_message_id'] == tempMessageId) {
            report(1);
            sub.cancel();
            completer.complete();
          }
        case 'updateMessageSendFailed':
          if (u['old_message_id'] == tempMessageId) {
            sub.cancel();
            completer.completeError(Exception('send failed: ${u['error_message']}'));
          }
      }
    });
    return completer.future;
  }

  /// Download file của [entry] vào cache TDLib, trả về đường dẫn local.
  TransferTask enqueueDownload(VaultEntry entry) {
    final task = TransferTask(
      id: 'down:${entry.messageId}',
      kind: TransferKind.download,
      label: entry.name,
      run: (report) async {
        final msg = await td.send({'@type': 'getMessage', 'chat_id': chatId, 'message_id': entry.messageId});
        final fileId = channel.tdFileIdFromMessage(msg);
        if (fileId == null) throw Exception('message has no document');
        final completer = Completer<String>();
        late StreamSubscription sub;
        sub = td.updates.listen((u) {
          if (u['@type'] != 'updateFile') return;
          final file = u['file'] as Map<String, dynamic>;
          if (file['id'] != fileId) return;
          final local = file['local'] as Map<String, dynamic>? ?? const {};
          final size = (file['size'] as num?)?.toDouble() ?? 0;
          final got = (local['downloaded_size'] as num?)?.toDouble() ?? 0;
          if (size > 0) report((got / size).clamp(0, 1));
          if (local['is_downloading_completed'] == true) {
            sub.cancel();
            completer.complete(local['path'] as String);
          }
        });
        await td.send({'@type': 'downloadFile', 'file_id': fileId, 'priority': 1, 'synchronous': false});
        final path = await completer.future;
        await db.setLocalPath(entry.messageId, path);
        report(1);
      },
    );
    queue.add(task);
    return task;
  }
}
```

- [ ] **Step 4: Chạy toàn bộ test, xác nhận pass**

Run: `cd televault && flutter test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add televault/lib/services televault/test
git commit -m "feat: VaultService facade with journaled batch ops, upload/download tasks"
```

### Task 11: Bootstrap app + màn hình đăng nhập + đồng bộ lần đầu

**Files:**
- Create: `televault/lib/app_bootstrap.dart`
- Create: `televault/lib/providers/session_provider.dart`
- Create: `televault/lib/screens/auth_screen.dart`
- Modify: `televault/lib/main.dart`
- Test: `televault/test/auth_screen_test.dart`

- [ ] **Step 1: Viết widget test fail cho AuthScreen**

`televault/test/auth_screen_test.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:televault/screens/auth_screen.dart';
import 'package:televault/services/telegram/auth_service.dart';

void main() {
  testWidgets('shows phone form on waitPhone and submits', (tester) async {
    String? submittedPhone;
    await tester.pumpWidget(MaterialApp(
      home: AuthScreen(
        state: AuthState.waitPhone,
        onPhone: (p) async => submittedPhone = p,
        onCode: (_) async {},
        onPassword: (_) async {},
      ),
    ));
    expect(find.textContaining('Số điện thoại'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '+84900000001');
    await tester.tap(find.byType(FilledButton));
    await tester.pump();
    expect(submittedPhone, '+84900000001');
  });

  testWidgets('shows code form on waitCode', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: AuthScreen(
        state: AuthState.waitCode,
        onPhone: (_) async {}, onCode: (_) async {}, onPassword: (_) async {},
      ),
    ));
    expect(find.textContaining('Mã xác nhận'), findsOneWidget);
  });

  testWidgets('shows password form on waitPassword', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: AuthScreen(
        state: AuthState.waitPassword,
        onPhone: (_) async {}, onCode: (_) async {}, onPassword: (_) async {},
      ),
    ));
    expect(find.textContaining('Mật khẩu'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/auth_screen_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement AuthScreen (widget thuần, nhận callback — dễ test)**

`televault/lib/screens/auth_screen.dart`:

```dart
import 'package:flutter/material.dart';

import '../services/telegram/auth_service.dart';

class AuthScreen extends StatefulWidget {
  final AuthState state;
  final Future<void> Function(String) onPhone;
  final Future<void> Function(String) onCode;
  final Future<void> Function(String) onPassword;
  final String? errorText;

  const AuthScreen({super.key, required this.state, required this.onPhone,
      required this.onCode, required this.onPassword, this.errorText});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _controller = TextEditingController(text: '+84');
  bool _busy = false;

  @override
  void didUpdateWidget(AuthScreen old) {
    super.didUpdateWidget(old);
    if (old.state != widget.state) {
      _controller.text = widget.state == AuthState.waitPhone ? '+84' : '';
      _busy = false;
    }
  }

  (String, String, bool) get _labels => switch (widget.state) {
        AuthState.waitCode => ('Mã xác nhận', 'Nhập mã Telegram vừa gửi cho bạn', false),
        AuthState.waitPassword => ('Mật khẩu 2FA', 'Nhập mật khẩu cloud của tài khoản', true),
        _ => ('Số điện thoại', 'Ví dụ +84901234567', false),
      };

  Future<void> _submit() async {
    setState(() => _busy = true);
    final text = _controller.text.trim();
    try {
      switch (widget.state) {
        case AuthState.waitCode:
          await widget.onCode(text);
        case AuthState.waitPassword:
          await widget.onPassword(text);
        default:
          await widget.onPhone(text);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (label, hint, obscure) = _labels;
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.cloud_outlined, size: 64),
                const SizedBox(height: 12),
                Text('TeleVault', textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 24),
                Text(label, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                TextField(
                  controller: _controller,
                  obscureText: obscure,
                  autofocus: true,
                  decoration: InputDecoration(hintText: hint, errorText: widget.errorText,
                      border: const OutlineInputBorder()),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Tiếp tục'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Implement bootstrap + SessionProvider**

`televault/lib/app_bootstrap.dart`:

```dart
import 'dart:io';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'services/index_db.dart';
import 'services/telegram/auth_service.dart';
import 'services/telegram/td_client.dart';

const _apiId = int.fromEnvironment('TG_API_ID');
const _apiHash = String.fromEnvironment('TG_API_HASH');

class Bootstrap {
  final TdClient td;
  final AuthService auth;
  final IndexDb db;
  const Bootstrap(this.td, this.auth, this.db);
}

Future<Bootstrap> bootstrap() async {
  assert(_apiId != 0 && _apiHash.isNotEmpty,
      'Chạy với --dart-define=TG_API_ID=... --dart-define=TG_API_HASH=...');

  final support = await getApplicationSupportDirectory();
  final tdDir = Directory(p.join(support.path, 'td'))..createSync(recursive: true);

  const storage = FlutterSecureStorage();
  var key = await storage.read(key: 'td_db_key');
  if (key == null) {
    final rnd = Random.secure();
    key = List.generate(32, (_) => rnd.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
    await storage.write(key: 'td_db_key', value: key);
  }

  final td = await TdClient.start();
  final auth = AuthService(td,
      apiId: _apiId,
      apiHash: _apiHash,
      databaseDirectory: tdDir.path,
      filesDirectory: p.join(tdDir.path, 'files'),
      databaseEncryptionKey: key);

  final DatabaseFactory factory;
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    sqfliteFfiInit();
    factory = databaseFactoryFfi;
  } else {
    factory = databaseFactory; // sqflite mặc định trên Android/iOS
  }
  final db = await IndexDb.open(factory, p.join(support.path, 'index.db'));

  return Bootstrap(td, auth, db);
}
```

`televault/lib/providers/session_provider.dart`:

```dart
import 'package:flutter/foundation.dart';

import '../app_bootstrap.dart';
import '../services/telegram/auth_service.dart';
import '../services/telegram/channel_service.dart';
import '../services/transfer_service.dart';
import '../services/vault_service.dart';

enum SessionPhase { booting, auth, syncing, ready }

class SessionProvider extends ChangeNotifier {
  SessionPhase phase = SessionPhase.booting;
  AuthState authState = AuthState.starting;
  String? authError;
  int scannedCount = 0;

  late Bootstrap boot;
  VaultService? vault;
  ChannelService? channel;
  final queue = TransferQueue();

  Future<void> start() async {
    boot = await bootstrap();
    boot.auth.states.listen(_onAuth);
    phase = SessionPhase.auth;
    notifyListeners();
  }

  Future<void> _onAuth(AuthState s) async {
    authState = s;
    if (s == AuthState.ready) {
      phase = SessionPhase.syncing;
      notifyListeners();
      final ch = ChannelService(boot.td, boot.db);
      var chatId = await ch.findVaultChannel();
      chatId ??= await ch.createVaultChannel();
      ch.listenUpdates(chatId);
      await ch.scanHistory(chatId, onProgress: (n) {
        scannedCount = n;
        notifyListeners();
      });
      channel = ch;
      vault = VaultService(td: boot.td, db: boot.db, channel: ch, queue: queue, chatId: chatId);
      await vault!.resumePendingJournal();
      await vault!.resolveConflictsNow();
      ch.changes.stream.listen((_) => vault!.resolveConflictsNow());
      phase = SessionPhase.ready;
    }
    notifyListeners();
  }

  Future<void> _guard(Future<void> Function() f) async {
    try {
      authError = null;
      await f();
    } catch (e) {
      authError = e.toString();
    }
    notifyListeners();
  }

  Future<void> submitPhone(String v) => _guard(() => boot.auth.submitPhone(v));
  Future<void> submitCode(String v) => _guard(() => boot.auth.submitCode(v));
  Future<void> submitPassword(String v) => _guard(() => boot.auth.submitPassword(v));
}
```

`televault/lib/main.dart` (thay toàn bộ):

```dart
import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:provider/provider.dart';

import 'providers/session_provider.dart';
import 'screens/auth_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => SessionProvider()..start(),
      child: const TeleVaultApp(),
    ),
  );
}

class TeleVaultApp extends StatelessWidget {
  const TeleVaultApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TeleVault',
      theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
      home: Consumer<SessionProvider>(
        builder: (context, s, _) => switch (s.phase) {
          SessionPhase.booting => const Scaffold(body: Center(child: CircularProgressIndicator())),
          SessionPhase.auth => AuthScreen(
              state: s.authState,
              errorText: s.authError,
              onPhone: s.submitPhone,
              onCode: s.submitCode,
              onPassword: s.submitPassword,
            ),
          SessionPhase.syncing => Scaffold(
              body: Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                const CircularProgressIndicator(),
                const SizedBox(height: 16),
                Text('Đang đồng bộ kho... ${s.scannedCount} mục'),
              ]))),
          SessionPhase.ready => const Placeholder(), // BrowserScreen ở Task 12
        },
      ),
    );
  }
}
```

- [ ] **Step 5: Chạy test + analyze**

Run: `cd televault && flutter test && flutter analyze`
Expected: PASS, no issues. (`Placeholder` sẽ thay ở Task 12.)

- [ ] **Step 6: Chạy thử app thật trên macOS (thủ công)**

```bash
cd televault && flutter run -d macos --dart-define=TG_API_ID=<id> --dart-define=TG_API_HASH=<hash>
```

Lưu ý macOS cần network entitlement: mở `televault/macos/Runner/DebugProfile.entitlements` và `Release.entitlements`, thêm:

```xml
<key>com.apple.security.network.client</key>
<true/>
```

Expected: màn hình nhập SĐT → OTP → (2FA) → "Đang đồng bộ kho..." → Placeholder. Kiểm tra trong app Telegram: kênh "TeleVault Storage" được tạo.

- [ ] **Step 7: Commit**

```bash
git add televault && git commit -m "feat: app bootstrap, session provider, auth and first-sync screens"
```

---

### Task 12: BrowserScreen — duyệt kho, thao tác file/thư mục, tag, tìm kiếm

**Files:**
- Create: `televault/lib/providers/vault_provider.dart`
- Create: `televault/lib/screens/browser_screen.dart`
- Create: `televault/lib/screens/search_screen.dart`
- Create: `televault/lib/screens/tags_screen.dart`
- Create: `televault/lib/widgets/entry_tile.dart`
- Modify: `televault/lib/main.dart` (thay `Placeholder` bằng `HomeShell`)
- Create: `televault/lib/screens/home_shell.dart`
- Test: `televault/test/vault_provider_test.dart`

- [ ] **Step 1: Viết test fail cho VaultProvider**

`televault/test/vault_provider_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:televault/models/vault_entry.dart';
import 'package:televault/providers/vault_provider.dart';
import 'package:televault/services/index_db.dart';

void main() {
  late IndexDb db;
  late VaultProvider p;

  setUp(() async {
    sqfliteFfiInit();
    db = await IndexDb.open(databaseFactoryFfi, inMemoryDatabasePath);
    await db.upsert(VaultEntry(messageId: 1, path: '/docs/a.pdf', size: 1,
        sha256: 'h', mtime: DateTime.utc(2026)));
    await db.upsert(VaultEntry(messageId: 2, path: '/b.txt', size: 1,
        sha256: 'h2', mtime: DateTime.utc(2026)));
    p = VaultProvider(db);
    await p.refresh();
  });

  test('starts at root with folders and files', () {
    expect(p.currentFolder, '/');
    expect(p.listing.folders, ['docs']);
    expect(p.listing.files.single.name, 'b.txt');
  });

  test('openFolder navigates down, goUp navigates up', () async {
    await p.openFolder('docs');
    expect(p.currentFolder, '/docs/');
    expect(p.listing.files.single.name, 'a.pdf');
    await p.goUp();
    expect(p.currentFolder, '/');
  });

  test('breadcrumbs derived from currentFolder', () async {
    await p.openFolder('docs');
    expect(p.breadcrumbs, ['/', 'docs']);
  });
}
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/vault_provider_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement VaultProvider**

`televault/lib/providers/vault_provider.dart`:

```dart
import 'package:flutter/foundation.dart';

import '../models/vault_entry.dart';
import '../models/vault_tree.dart';
import '../services/index_db.dart';

class VaultProvider extends ChangeNotifier {
  final IndexDb db;
  String currentFolder = '/';
  List<VaultEntry> _all = [];
  FolderListing listing = const FolderListing([], []);

  VaultProvider(this.db);

  List<String> get breadcrumbs =>
      ['/', ...currentFolder.split('/').where((s) => s.isNotEmpty)];

  Future<void> refresh() async {
    _all = await db.getAll();
    listing = listFolder(_all, currentFolder);
    notifyListeners();
  }

  Future<void> openFolder(String name) async {
    currentFolder = '$currentFolder$name/';
    await refresh();
  }

  Future<void> goUp() async {
    if (currentFolder == '/') return;
    final trimmed = currentFolder.substring(0, currentFolder.length - 1);
    currentFolder = trimmed.substring(0, trimmed.lastIndexOf('/') + 1);
    await refresh();
  }

  Future<void> goTo(String folder) async {
    currentFolder = folder;
    await refresh();
  }
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/vault_provider_test.dart`
Expected: PASS.

- [ ] **Step 5: Implement UI screens**

`televault/lib/widgets/entry_tile.dart`:

```dart
import 'package:flutter/material.dart';

import '../models/vault_entry.dart';

String formatSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
  return '${(bytes / 1024 / 1024 / 1024).toStringAsFixed(2)} GB';
}

class EntryTile extends StatelessWidget {
  final VaultEntry entry;
  final VoidCallback onTap;
  final void Function(String action) onAction; // 'rename'|'move'|'delete'|'tags'|'save'

  const EntryTile({super.key, required this.entry, required this.onTap, required this.onAction});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(entry.localPath != null ? Icons.file_download_done : Icons.insert_drive_file_outlined),
      title: Text(entry.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Row(children: [
        Text(formatSize(entry.size)),
        const SizedBox(width: 8),
        ...entry.tags.take(3).map((t) => Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Chip(label: Text(t), visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap),
            )),
      ]),
      trailing: PopupMenuButton<String>(
        onSelected: onAction,
        itemBuilder: (_) => const [
          PopupMenuItem(value: 'rename', child: Text('Đổi tên')),
          PopupMenuItem(value: 'move', child: Text('Di chuyển')),
          PopupMenuItem(value: 'tags', child: Text('Tag...')),
          PopupMenuItem(value: 'save', child: Text('Lưu về máy')),
          PopupMenuItem(value: 'delete', child: Text('Xoá')),
        ],
      ),
      onTap: onTap,
    );
  }
}
```

`televault/lib/screens/browser_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../providers/session_provider.dart';
import '../providers/vault_provider.dart';
import '../widgets/entry_tile.dart';

class BrowserScreen extends StatelessWidget {
  final void Function(VaultEntry entry) onOpenFile;
  final VoidCallback onAddFiles;

  const BrowserScreen({super.key, required this.onOpenFile, required this.onAddFiles});

  Future<String?> _prompt(BuildContext context, String title, {String initial = ''}) {
    final c = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(controller: c, autofocus: true),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Huỷ')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('OK')),
        ],
      ),
    );
  }

  Future<bool> _confirm(BuildContext context, String message) async {
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            content: Text(message),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Huỷ')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Xoá')),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _onFileAction(BuildContext context, VaultEntry e, String action) async {
    final vault = context.read<SessionProvider>().vault!;
    final vp = context.read<VaultProvider>();
    switch (action) {
      case 'rename':
        final name = await _prompt(context, 'Tên mới', initial: e.name);
        if (name != null && name.isNotEmpty) {
          await vault.renameFile(e.messageId, '${e.parent}$name');
        }
      case 'move':
        final folder = await _prompt(context, 'Chuyển tới thư mục (vd /Truyện/)', initial: e.parent);
        if (folder != null && folder.startsWith('/') && folder.endsWith('/')) {
          await vault.renameFile(e.messageId, '$folder${e.name}');
        }
      case 'delete':
        if (await _confirm(context, 'Xoá "${e.name}" khỏi kho? Không khôi phục được.')) {
          await vault.deleteEntries([e.messageId]);
        }
      case 'tags':
        final tags = await _prompt(context, 'Tag (phân cách bằng dấu cách)', initial: e.tags.join(' '));
        if (tags != null) {
          await vault.setTags(e.messageId,
              tags.split(' ').map((t) => t.trim()).where((t) => t.isNotEmpty).toList());
        }
      case 'save':
        onOpenFile(e); // màn preview có nút lưu
    }
    await vp.refresh();
  }

  Future<void> _onFolderAction(BuildContext context, String name, String action) async {
    final vault = context.read<SessionProvider>().vault!;
    final vp = context.read<VaultProvider>();
    final full = '${vp.currentFolder}$name/';
    switch (action) {
      case 'rename':
        final newName = await _prompt(context, 'Tên thư mục mới', initial: name);
        if (newName != null && newName.isNotEmpty) {
          await vault.renameFolder(full, '${vp.currentFolder}$newName/');
        }
      case 'delete':
        if (await _confirm(context, 'Xoá thư mục "$name" và toàn bộ nội dung?')) {
          await vault.deleteFolder(full);
        }
    }
    await vp.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final vp = context.watch<VaultProvider>();
    return Scaffold(
      appBar: AppBar(
        leading: vp.currentFolder == '/' ? null
            : IconButton(icon: const Icon(Icons.arrow_back), onPressed: vp.goUp),
        title: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (var i = 0; i < vp.breadcrumbs.length; i++) ...[
              if (i > 0) const Icon(Icons.chevron_right, size: 18),
              TextButton(
                onPressed: () {
                  final parts = vp.breadcrumbs.sublist(1, i + 1);
                  vp.goTo(parts.isEmpty ? '/' : '/${parts.join('/')}/');
                },
                child: Text(vp.breadcrumbs[i] == '/' ? 'Kho' : vp.breadcrumbs[i]),
              ),
            ],
          ]),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.create_new_folder_outlined),
            onPressed: () async {
              final name = await _prompt(context, 'Tên thư mục mới');
              if (name != null && name.isNotEmpty) {
                await context.read<SessionProvider>().vault!
                    .createFolder('${vp.currentFolder}$name/');
                await vp.refresh();
              }
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: onAddFiles,
        child: const Icon(Icons.upload_file),
      ),
      body: ListView(
        children: [
          for (final folder in vp.listing.folders)
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: Text(folder),
              trailing: PopupMenuButton<String>(
                onSelected: (a) => _onFolderAction(context, folder, a),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'rename', child: Text('Đổi tên')),
                  PopupMenuItem(value: 'delete', child: Text('Xoá')),
                ],
              ),
              onTap: () => vp.openFolder(folder),
            ),
          for (final file in vp.listing.files)
            EntryTile(
              entry: file,
              onTap: () => onOpenFile(file),
              onAction: (a) => _onFileAction(context, file, a),
            ),
          if (vp.listing.folders.isEmpty && vp.listing.files.isEmpty)
            const Padding(
              padding: EdgeInsets.all(48),
              child: Center(child: Text('Thư mục trống — bấm nút upload để thêm file')),
            ),
        ],
      ),
    );
  }
}
```

`televault/lib/screens/search_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../providers/session_provider.dart';
import '../widgets/entry_tile.dart';

class SearchScreen extends StatefulWidget {
  final void Function(VaultEntry) onOpenFile;
  const SearchScreen({super.key, required this.onOpenFile});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String _query = '';
  final _selectedTags = <String>{};
  List<VaultEntry> _results = [];
  Map<String, int> _allTags = {};

  Future<void> _run() async {
    final db = context.read<SessionProvider>().boot.db;
    _allTags = await db.allTags();
    _results = (_query.isEmpty && _selectedTags.isEmpty)
        ? []
        : await db.search(query: _query, tags: _selectedTags.toList());
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          decoration: const InputDecoration(hintText: 'Tìm theo tên file hoặc thư mục...'),
          onChanged: (v) {
            _query = v;
            _run();
          },
        ),
      ),
      body: Column(children: [
        if (_allTags.isNotEmpty)
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: [
                for (final tag in _allTags.keys)
                  Padding(
                    padding: const EdgeInsets.all(4),
                    child: FilterChip(
                      label: Text('$tag (${_allTags[tag]})'),
                      selected: _selectedTags.contains(tag),
                      onSelected: (on) {
                        on ? _selectedTags.add(tag) : _selectedTags.remove(tag);
                        _run();
                      },
                    ),
                  ),
              ],
            ),
          ),
        Expanded(
          child: ListView(children: [
            for (final e in _results.where((e) => !e.isDir))
              EntryTile(entry: e, onTap: () => widget.onOpenFile(e), onAction: (_) {}),
          ]),
        ),
      ]),
    );
  }
}
```

`televault/lib/screens/tags_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/session_provider.dart';

class TagsScreen extends StatefulWidget {
  const TagsScreen({super.key});

  @override
  State<TagsScreen> createState() => _TagsScreenState();
}

class _TagsScreenState extends State<TagsScreen> {
  Map<String, int> _tags = {};

  Future<void> _load() async {
    _tags = await context.read<SessionProvider>().boot.db.allTags();
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final vault = context.read<SessionProvider>().vault!;
    return Scaffold(
      appBar: AppBar(title: const Text('Quản lý tag')),
      body: ListView(children: [
        for (final entry in _tags.entries)
          ListTile(
            leading: const Icon(Icons.label_outline),
            title: Text(entry.key),
            subtitle: Text('${entry.value} file'),
            trailing: PopupMenuButton<String>(
              onSelected: (a) async {
                if (a == 'rename') {
                  final c = TextEditingController(text: entry.key);
                  final newName = await showDialog<String>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Đổi tên tag'),
                      content: TextField(controller: c, autofocus: true),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Huỷ')),
                        FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('OK')),
                      ],
                    ),
                  );
                  if (newName != null && newName.isNotEmpty) {
                    await vault.renameTag(entry.key, newName);
                  }
                } else if (a == 'delete') {
                  await vault.deleteTag(entry.key);
                }
                await _load();
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'rename', child: Text('Đổi tên')),
                PopupMenuItem(value: 'delete', child: Text('Gỡ khỏi mọi file')),
              ],
            ),
          ),
        if (_tags.isEmpty)
          const Padding(padding: EdgeInsets.all(48), child: Center(child: Text('Chưa có tag nào'))),
      ]),
    );
  }
}
```

`televault/lib/screens/home_shell.dart` — khung điều hướng (transfers screen thêm ở Task 13, preview ở Task 14; tạm thời tab Truyền tải là `SizedBox`, mở file là no-op — đánh dấu bằng callback truyền xuống):

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/vault_entry.dart';
import '../providers/session_provider.dart';
import '../providers/vault_provider.dart';
import 'browser_screen.dart';
import 'search_screen.dart';
import 'tags_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  void _openFile(VaultEntry e) {} // Task 14: preview
  void _addFiles() {} // Task 13: picker + upload

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionProvider>();
    return ChangeNotifierProvider(
      create: (_) {
        final vp = VaultProvider(session.boot.db);
        vp.refresh();
        session.channel!.changes.stream.listen((_) => vp.refresh());
        return vp;
      },
      child: Scaffold(
        body: IndexedStack(index: _tab, children: [
          BrowserScreen(onOpenFile: _openFile, onAddFiles: _addFiles),
          SearchScreen(onOpenFile: _openFile),
          const SizedBox(), // Task 13: TransfersScreen
          const TagsScreen(),
        ]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.folder_outlined), label: 'Kho'),
            NavigationDestination(icon: Icon(Icons.search), label: 'Tìm'),
            NavigationDestination(icon: Icon(Icons.swap_vert), label: 'Truyền tải'),
            NavigationDestination(icon: Icon(Icons.label_outline), label: 'Tag'),
          ],
        ),
      ),
    );
  }
}
```

Trong `main.dart`, thay `SessionPhase.ready => const Placeholder(),` bằng `SessionPhase.ready => const HomeShell(),` và thêm import `screens/home_shell.dart`.

- [ ] **Step 6: Chạy test + analyze**

Run: `cd televault && flutter test && flutter analyze`
Expected: PASS, no issues.

- [ ] **Step 7: Commit**

```bash
git add televault && git commit -m "feat: browser, search, and tag management screens with folder navigation"
```

### Task 13: Thêm file vào kho + màn hình Truyền tải

**Files:**
- Create: `televault/lib/screens/transfers_screen.dart`
- Create: `televault/lib/services/file_intake.dart`
- Modify: `televault/lib/screens/home_shell.dart` (nối `_addFiles`, thay `SizedBox` bằng `TransfersScreen`, bọc kéo-thả desktop)
- Test: `televault/test/file_intake_test.dart`

- [ ] **Step 1: Viết test fail cho logic gom file giữ cấu trúc thư mục**

`televault/lib/services/file_intake.dart` sẽ có hàm thuần `destPathFor`: từ file gốc + thư mục gốc được chọn + thư mục đích trong kho → path đích (giữ cấu trúc con).

`televault/test/file_intake_test.dart`:

```dart
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
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/file_intake_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/services/file_intake.dart`:

```dart
import 'dart:io';

import 'package:file_picker/file_picker.dart';

String _norm(String p) => p.replaceAll('\\', '/');

/// Path đích trong kho cho 1 file local.
/// [pickedRoot] != null khi người dùng chọn cả thư mục — giữ cấu trúc từ tên thư mục gốc trở xuống.
String destPathFor(String localPath, {String? pickedRoot, required String destFolder}) {
  assert(destFolder.startsWith('/') && destFolder.endsWith('/'));
  final local = _norm(localPath);
  if (pickedRoot == null) {
    return '$destFolder${local.substring(local.lastIndexOf('/') + 1)}';
  }
  final root = _norm(pickedRoot);
  final parentOfRoot = root.substring(0, root.lastIndexOf('/') + 1);
  return '$destFolder${local.substring(parentOfRoot.length)}';
}

/// Mở picker chọn nhiều file; trả về danh sách (localPath, destPath).
Future<List<(String local, String dest)>> pickFiles(String destFolder) async {
  final result = await FilePicker.platform.pickFiles(allowMultiple: true);
  if (result == null) return [];
  return [
    for (final f in result.files)
      if (f.path != null) (f.path!, destPathFor(f.path!, destFolder: destFolder)),
  ];
}

/// Mở picker chọn 1 thư mục; liệt kê đệ quy mọi file bên trong.
Future<List<(String local, String dest)>> pickDirectory(String destFolder) async {
  final dir = await FilePicker.platform.getDirectoryPath();
  if (dir == null) return [];
  final files = Directory(dir)
      .listSync(recursive: true, followLinks: false)
      .whereType<File>();
  return [
    for (final f in files)
      (f.path, destPathFor(f.path, pickedRoot: dir, destFolder: destFolder)),
  ];
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test test/file_intake_test.dart`
Expected: PASS.

- [ ] **Step 5: Sửa VaultService.enqueueUpload nhận destPath đầy đủ**

Trong `televault/lib/services/vault_service.dart`, đổi chữ ký `enqueueUpload` để nhận path đích đầy đủ (thay vì thư mục + tên tự suy):

```dart
  /// Upload 1 file local thành [destPath] (path file đầy đủ trong kho).
  TransferTask enqueueUpload(File local, String destPath) {
    final task = TransferTask(
      id: 'up:${local.path}:${DateTime.now().microsecondsSinceEpoch}',
      kind: TransferKind.upload,
      label: destPath.substring(destPath.lastIndexOf('/') + 1),
      run: (report) async {
        final sha = await _sha256Of(local);
        final entry = VaultEntry(
          messageId: 0,
          path: destPath,
          size: await local.length(),
          sha256: sha,
          mtime: DateTime.now().toUtc(),
        );
        final sent = await td.send({
          '@type': 'sendMessage',
          'chat_id': chatId,
          'input_message_content': {
            '@type': 'inputMessageDocument',
            'document': {'@type': 'inputFileLocal', 'path': local.path},
            'caption': {'@type': 'formattedText', 'text': encodeCaption(entry)},
          },
        });
        await _awaitSendSucceeded(sent['id'] as int, report);
      },
    );
    queue.add(task);
    return task;
  }
```

- [ ] **Step 6: TransfersScreen + nối vào HomeShell**

`televault/lib/screens/transfers_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/session_provider.dart';
import '../services/transfer_service.dart';

class TransfersScreen extends StatelessWidget {
  const TransfersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final queue = context.read<SessionProvider>().queue;
    return StreamBuilder<void>(
      stream: queue.changes.stream,
      builder: (context, _) {
        final uploads = queue.tasks.where((t) => t.kind == TransferKind.upload).toList();
        final downloads = queue.tasks.where((t) => t.kind == TransferKind.download).toList();
        return DefaultTabController(
          length: 2,
          child: Scaffold(
            appBar: AppBar(
              title: const Text('Truyền tải'),
              bottom: TabBar(tabs: [
                Tab(text: 'Upload (${uploads.length})'),
                Tab(text: 'Download (${downloads.length})'),
              ]),
            ),
            body: TabBarView(children: [
              _TaskList(tasks: uploads, queue: queue),
              _TaskList(tasks: downloads, queue: queue),
            ]),
          ),
        );
      },
    );
  }
}

class _TaskList extends StatelessWidget {
  final List<TransferTask> tasks;
  final TransferQueue queue;
  const _TaskList({required this.tasks, required this.queue});

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) return const Center(child: Text('Không có gì đang truyền'));
    return ListView(children: [
      for (final t in tasks.reversed)
        StreamBuilder<double>(
          stream: t.progress,
          initialData: t.lastProgress,
          builder: (context, snap) => ListTile(
            leading: switch (t.status) {
              TransferStatus.done => const Icon(Icons.check_circle, color: Colors.green),
              TransferStatus.failed => const Icon(Icons.error, color: Colors.red),
              TransferStatus.cancelled => const Icon(Icons.cancel),
              _ => const Icon(Icons.sync),
            },
            title: Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: t.status == TransferStatus.running
                ? LinearProgressIndicator(value: snap.data)
                : Text(t.status.name),
            trailing: t.status == TransferStatus.queued
                ? IconButton(icon: const Icon(Icons.close), onPressed: () => queue.cancel(t.id))
                : null,
          ),
        ),
    ]);
  }
}
```

Trong `televault/lib/screens/home_shell.dart`:

1. Thay `const SizedBox(), // Task 13: TransfersScreen` bằng `const TransfersScreen(),` (+ import).
2. Implement `_addFiles` (dedup check + upload; nhớ import `dart:io`, `file_intake.dart`, `wakelock_plus`):

```dart
  Future<void> _addFiles() async {
    final session = context.read<SessionProvider>();
    final vp = context.read<VaultProvider>(); // lấy currentFolder
    final picked = await pickFiles(vp.currentFolder);
    if (picked.isEmpty) return;
    await WakelockPlus.enable();
    for (final (local, dest) in picked) {
      final vault = session.vault!;
      final digest = await sha256.bind(File(local).openRead()).first;
      final dup = await vault.checkDuplicate(digest.toString());
      if (dup != null && mounted) {
        final go = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            content: Text('File đã có tại ${dup.path}. Vẫn upload bản sao?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Bỏ qua')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Upload')),
            ],
          ),
        );
        if (go != true) continue;
      }
      vault.enqueueUpload(File(local), dest);
    }
  }
```

(Lưu ý: `ChangeNotifierProvider` trong `HomeShell.build` hiện tạo provider bên trong `build` — chuyển `VaultProvider` lên `initState`/field của `_HomeShellState` để `context.read` dùng được từ `_addFiles`; giữ `ChangeNotifierProvider.value` trong build.)

3. Desktop kéo-thả — bọc `body` của `Scaffold` trong `HomeShell` (import `desktop_drop`, chỉ tác dụng trên desktop, mobile bỏ qua):

```dart
        body: DropTarget(
          onDragDone: (detail) async {
            final vp = _vaultProvider;
            final vault = context.read<SessionProvider>().vault!;
            for (final xfile in detail.files) {
              final f = File(xfile.path);
              if (f.statSync().type == FileSystemEntityType.directory) {
                for (final sub in Directory(xfile.path).listSync(recursive: true).whereType<File>()) {
                  vault.enqueueUpload(sub,
                      destPathFor(sub.path, pickedRoot: xfile.path, destFolder: vp.currentFolder));
                }
              } else {
                vault.enqueueUpload(f, destPathFor(xfile.path, destFolder: vp.currentFolder));
              }
            }
          },
          child: IndexedStack(...), // như cũ
        ),
```

4. Mobile share-intent — trong `initState` của `_HomeShellState` (chỉ Android/iOS):

```dart
    if (Platform.isAndroid || Platform.isIOS) {
      ReceiveSharingIntent.instance.getMediaStream().listen((files) {
        final vault = context.read<SessionProvider>().vault;
        if (vault == null) return;
        for (final f in files) {
          vault.enqueueUpload(File(f.path), destPathFor(f.path, destFolder: '/'));
        }
      });
    }
```

- [ ] **Step 7: Chạy test + analyze + thử thủ công**

Run: `cd televault && flutter test && flutter analyze`
Expected: PASS, no issues.

Thử thủ công trên macOS: upload 1 file → thấy trong tab Truyền tải progress chạy → xuất hiện trong kho → mở app Telegram thấy message trong kênh với caption JSON.

- [ ] **Step 8: Commit**

```bash
git add televault && git commit -m "feat: file intake (picker, drag-drop, share intent) and transfers screen"
```

---

### Task 14: Preview + cache LRU + lưu về máy

**Files:**
- Create: `televault/lib/services/cache_manager.dart`
- Create: `televault/lib/screens/preview_screen.dart`
- Modify: `televault/lib/screens/home_shell.dart` (nối `_openFile`)
- Test: `televault/test/cache_manager_test.dart`

**Ghi chú:** TDLib tự quản file tải về trong `filesDirectory`. Cache LRU của ta quản lý **giới hạn tổng dung lượng**: khi vượt ngưỡng, xoá file TDLib cũ ít dùng nhất qua `deleteFile` (TDLib) + `db.setLocalPath(id, null)`. Thời điểm "dùng" ghi lại mỗi lần mở preview.

- [ ] **Step 1: Viết test fail cho LRU**

`televault/test/cache_manager_test.dart`:

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/cache_manager.dart';

void main() {
  test('evict returns oldest-used entries until under limit', () {
    final entries = [
      CachedFile(messageId: 1, size: 400, lastUsed: DateTime.utc(2026, 1, 1)),
      CachedFile(messageId: 2, size: 400, lastUsed: DateTime.utc(2026, 1, 3)),
      CachedFile(messageId: 3, size: 400, lastUsed: DateTime.utc(2026, 1, 2)),
    ];
    // limit 900: tổng 1200, phải giải phóng >=300 -> xoá lru (id 1)
    expect(pickEvictions(entries, limitBytes: 900).map((e) => e.messageId), [1]);
    // limit 500: phải xoá id 1 (400) rồi id 3 (400) -> còn 400 <= 500
    expect(pickEvictions(entries, limitBytes: 500).map((e) => e.messageId), [1, 3]);
    // đủ chỗ -> không xoá
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
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `cd televault && flutter test test/cache_manager_test.dart`
Expected: FAIL.

- [ ] **Step 3: Implement**

`televault/lib/services/cache_manager.dart`:

```dart
class CachedFile {
  final int messageId;
  final int size;
  final DateTime lastUsed;
  const CachedFile({required this.messageId, required this.size, required this.lastUsed});
}

/// Chọn file cần xoá (cũ nhất trước) cho tới khi tổng size <= limit.
/// [protectedIds]: đang preview — không bao giờ xoá.
List<CachedFile> pickEvictions(List<CachedFile> cached,
    {required int limitBytes, Set<int> protectedIds = const {}}) {
  var total = cached.fold<int>(0, (s, e) => s + e.size);
  if (total <= limitBytes) return [];
  final candidates = cached.where((e) => !protectedIds.contains(e.messageId)).toList()
    ..sort((a, b) => a.lastUsed.compareTo(b.lastUsed));
  final out = <CachedFile>[];
  for (final e in candidates) {
    if (total <= limitBytes) break;
    out.add(e);
    total -= e.size;
  }
  return out;
}
```

Thêm cột `last_used TEXT` và `td_file_id INTEGER` vào bảng `files` trong `IndexDb.onCreate` (schema version giữ 1 — app chưa release) và các method sau vào `IndexDb`:

```dart
  Future<void> touchLastUsed(int messageId) async {
    await _db.update('files', {'last_used': DateTime.now().toUtc().toIso8601String()},
        where: 'message_id = ?', whereArgs: [messageId]);
  }

  Future<void> setTdFileId(int messageId, int tdFileId) async {
    await _db.update('files', {'td_file_id': tdFileId},
        where: 'message_id = ?', whereArgs: [messageId]);
  }

  Future<List<CachedFile>> getCached() async {
    final rows = await _db.query('files', where: 'local_path IS NOT NULL');
    return [
      for (final r in rows)
        CachedFile(
          messageId: r['message_id'] as int,
          size: r['size'] as int,
          lastUsed: DateTime.tryParse(r['last_used'] as String? ?? '') ?? DateTime.utc(2000),
          tdFileId: r['td_file_id'] as int?,
        ),
    ];
  }
```

(`CachedFile` import từ `cache_manager.dart` — thêm field `final int? tdFileId;` vào class đó và tham số constructor tương ứng.) Gọi `db.setTdFileId(entry.messageId, fileId)` bên trong `enqueueDownload` (Task 10) ngay sau khi có `fileId`. Thêm test tương ứng vào `index_db_test.dart`:

```dart
  test('touchLastUsed and getCached', () async {
    await db.upsert(f(1, '/a.pdf'));
    await db.setLocalPath(1, '/tmp/a.pdf');
    await db.touchLastUsed(1);
    final cached = await db.getCached();
    expect(cached.single.messageId, 1);
  });
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `cd televault && flutter test`
Expected: PASS.

- [ ] **Step 5: PreviewScreen**

`televault/lib/screens/preview_screen.dart`:

```dart
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';
import 'package:open_filex/open_filex.dart';
import 'package:pdfx/pdfx.dart';
import 'package:share_plus/share_plus.dart';

import '../models/vault_entry.dart';

enum PreviewKind { image, pdf, video, other }

PreviewKind previewKindOf(String name) {
  final ext = name.contains('.') ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].contains(ext)) return PreviewKind.image;
  if (ext == 'pdf') return PreviewKind.pdf;
  if (['mp4', 'mkv', 'mov', 'webm', 'avi', 'mp3', 'm4a', 'flac', 'ogg'].contains(ext)) {
    return PreviewKind.video;
  }
  return PreviewKind.other;
}

/// Hiện file đã có local. Nếu chưa tải xong, caller hiện progress trước khi push màn này.
class PreviewScreen extends StatefulWidget {
  final VaultEntry entry;
  final String localPath;
  const PreviewScreen({super.key, required this.entry, required this.localPath});

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  Player? _player;
  VideoController? _video;
  PdfControllerPinch? _pdf;

  @override
  void initState() {
    super.initState();
    switch (previewKindOf(widget.entry.name)) {
      case PreviewKind.video:
        _player = Player();
        _video = VideoController(_player!);
        _player!.open(Media('file://${widget.localPath}'));
      case PreviewKind.pdf:
        _pdf = PdfControllerPinch(document: PdfDocument.openFile(widget.localPath));
      default:
    }
  }

  @override
  void dispose() {
    _player?.dispose();
    _pdf?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final kind = previewKindOf(widget.entry.name);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.entry.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: 'Lưu về máy / chia sẻ',
            onPressed: () => Share.shareXFiles([XFile(widget.localPath)]),
          ),
        ],
      ),
      body: switch (kind) {
        PreviewKind.image => InteractiveViewer(
            maxScale: 8,
            child: Center(child: Image.file(File(widget.localPath))),
          ),
        PreviewKind.pdf => PdfViewPinch(controller: _pdf!),
        PreviewKind.video => Video(controller: _video!),
        PreviewKind.other => Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.insert_drive_file_outlined, size: 96),
              const SizedBox(height: 16),
              Text(widget.entry.name),
              const SizedBox(height: 16),
              FilledButton.icon(
                icon: const Icon(Icons.open_in_new),
                label: const Text('Mở bằng app khác'),
                onPressed: () => OpenFilex.open(widget.localPath),
              ),
            ]),
          ),
      },
    );
  }
}
```

- [ ] **Step 6: Nối `_openFile` trong HomeShell**

Trước tiên: `TransferQueue.add` trả `Future<void>` nhưng `enqueueUpload/enqueueDownload` hiện nuốt mất future đó. **Sửa cả hai method trong `VaultService` trả về record `(TransferTask, Future<void>)`** (`final done = queue.add(task); return (task, done);`) để caller await được. Chỗ gọi ở Task 13 (`_addFiles`, drag-drop, share-intent) bỏ qua phần tử thứ hai.

`_openFile` trong HomeShell:

```dart
  Future<void> _openFile(VaultEntry e) async {
    final session = context.read<SessionProvider>();
    final vault = session.vault!;
    var localPath = e.localPath;
    if (localPath == null || !File(localPath).existsSync()) {
      final (task, done) = vault.enqueueDownload(e);
      if (!mounted) return;
      showDialog<void>(context: context, barrierDismissible: false,
          builder: (ctx) => AlertDialog(
            title: Text('Đang tải ${e.name}'),
            content: StreamBuilder<double>(stream: task.progress,
                builder: (_, s) => LinearProgressIndicator(value: s.data)),
          ));
      await done;
      if (mounted) Navigator.of(context, rootNavigator: true).pop();
      localPath = (await session.boot.db.getAll())
          .firstWhere((x) => x.messageId == e.messageId).localPath;
      if (localPath == null) return; // tải thất bại — task hiện lỗi trong tab Truyền tải
    }
    await session.boot.db.touchLastUsed(e.messageId);
    // Evict LRU nếu vượt ngưỡng (mặc định 2GB, chỉnh trong Settings — đọc từ kv):
    final limit = await session.boot.db.getCacheLimitBytes();
    final cached = await session.boot.db.getCached();
    for (final victim in pickEvictions(cached, limitBytes: limit,
        protectedIds: {e.messageId})) {
      await session.boot.db.setLocalPath(victim.messageId, null);
      if (victim.tdFileId != null) {
        await session.boot.td.send({'@type': 'deleteFile', 'file_id': victim.tdFileId});
      }
    }
    if (!mounted) return;
    Navigator.push(context, MaterialPageRoute(
        builder: (_) => PreviewScreen(entry: e, localPath: localPath!)));
  }
```

Kèm theo, thêm 2 method setting vào `IndexDb` (dùng bảng `kv` có sẵn):

```dart
  Future<int> getCacheLimitBytes() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['cache_limit']);
    return rows.isEmpty ? 2 * 1024 * 1024 * 1024 : int.parse(rows.first['value'] as String);
  }

  Future<void> setCacheLimitBytes(int bytes) async {
    await _db.insert('kv', {'key': 'cache_limit', 'value': '$bytes'},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }
```

- [ ] **Step 7: Chạy test + analyze + thử thủ công**

Run: `cd televault && flutter test && flutter analyze`
Expected: PASS. Thử thủ công: mở ảnh/PDF/video từ kho trên macOS; file thứ nhì mở tức thì (đã cache).

- [ ] **Step 8: Commit**

```bash
git add televault && git commit -m "feat: file preview (image/pdf/video), LRU cache eviction, save to device"
```

---

### Task 15: Đóng gói TDLib cho từng nền tảng + Settings

**Files:**
- Modify: `televault/macos/Runner/DebugProfile.entitlements`, `Release.entitlements` (đã làm ở Task 11)
- Create: `televault/android/app/src/main/jniLibs/` (binaries — KHÔNG commit binary vào git; viết script tải)
- Create: `televault/tool/fetch_tdlib.sh`
- Create: `televault/lib/screens/settings_screen.dart`
- Modify: `televault/lib/screens/home_shell.dart` (nút mở Settings trên AppBar của BrowserScreen — truyền callback)
- Create: `televault/README.md`

- [ ] **Step 1: Script tải binary TDLib**

`televault/tool/fetch_tdlib.sh`:

```bash
#!/usr/bin/env bash
# Tải/chuẩn bị libtdjson cho từng nền tảng. Chạy trước khi build release.
# Binary KHÔNG commit vào git (xem .gitignore).
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${1:-macos}"

case "$PLATFORM" in
  macos)
    # Dev: dùng brew. Release: copy dylib vào bundle.
    brew list tdlib >/dev/null 2>&1 || brew install tdlib
    echo "macOS: dùng libtdjson từ Homebrew ($(brew --prefix)/lib/libtdjson.dylib)"
    ;;
  android)
    # Build theo hướng dẫn chính thức hoặc tải prebuilt.
    # Đặt kết quả vào android/app/src/main/jniLibs/<abi>/libtdjson.so
    echo "Android: xem https://github.com/tdlib/td/tree/master/example/android"
    echo "Hoặc dùng prebuilt: https://github.com/ivk1800/td-json-client-prebuilt/releases"
    mkdir -p android/app/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}
    ;;
  windows)
    echo "Windows: build qua vcpkg (xem https://tdlib.github.io/td/build.html)"
    echo "Copy tdjson.dll + deps vào windows/ và khai báo trong CMakeLists để bundle cạnh exe"
    ;;
  linux)
    echo "Linux: cài qua package manager hoặc build; libtdjson.so cần nằm trong LD_LIBRARY_PATH"
    ;;
  ios)
    echo "iOS: build framework theo https://github.com/tdlib/td/tree/master/example/ios"
    echo "Add vào Xcode Runner target (static link -> DynamicLibrary.process() hoạt động)"
    ;;
esac
```

`chmod +x televault/tool/fetch_tdlib.sh`. Thêm vào `televault/.gitignore`:

```
android/app/src/main/jniLibs/
*.dylib
*.dll
tdjson*
```

- [ ] **Step 2: Bundle dylib vào app macOS khi release**

Trong `televault/macos/Runner.xcodeproj` cách thủ công nhiều bước — dùng cách đơn giản: thêm Run Script phase qua Xcode HOẶC (khuyến nghị, script hoá được) copy trong CI/hướng dẫn build. Ghi vào `televault/README.md`:

```markdown
# TeleVault

Kho file cá nhân trên Telegram. Flutter, chạy macOS/Windows/Linux/iOS/Android.

## Build

1. Đăng ký api_id/api_hash: https://my.telegram.org → API development tools.
2. Chuẩn bị TDLib: `tool/fetch_tdlib.sh <platform>` (xem hướng dẫn in ra cho từng nền tảng).
3. Chạy:

    flutter run -d macos --dart-define=TG_API_ID=xxx --dart-define=TG_API_HASH=yyy

## macOS release

Copy dylib vào bundle sau khi build:

    cp "$(brew --prefix)/lib/libtdjson.dylib" \
      build/macos/Build/Products/Release/televault.app/Contents/Frameworks/
    codesign --force --deep -s - build/macos/Build/Products/Release/televault.app

(TdFfi tự tìm 'libtdjson.dylib' trong Frameworks trước, fallback Homebrew khi dev.)

## Test

    flutter test
```

- [ ] **Step 3: SettingsScreen**

`televault/lib/screens/settings_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/session_provider.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  int _cacheLimitGb = 2;

  @override
  void initState() {
    super.initState();
    context.read<SessionProvider>().boot.db.getCacheLimitBytes().then((b) {
      if (mounted) setState(() => _cacheLimitGb = b ~/ (1024 * 1024 * 1024));
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionProvider>();
    return Scaffold(
      appBar: AppBar(title: const Text('Cài đặt')),
      body: ListView(children: [
        ListTile(
          leading: const Icon(Icons.swap_vert),
          title: const Text('Số truyền tải song song'),
          subtitle: Text('${session.queue.maxConcurrent}'),
          trailing: DropdownButton<int>(
            value: session.queue.maxConcurrent,
            items: [for (final n in [1, 2, 3, 4]) DropdownMenuItem(value: n, child: Text('$n'))],
            onChanged: (n) => setState(() => session.queue.maxConcurrent = n ?? 2),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.storage),
          title: const Text('Giới hạn cache'),
          subtitle: Text('$_cacheLimitGb GB'),
          trailing: DropdownButton<int>(
            value: _cacheLimitGb,
            items: [for (final n in [1, 2, 5, 10]) DropdownMenuItem(value: n, child: Text('$n GB'))],
            onChanged: (n) async {
              if (n == null) return;
              await session.boot.db.setCacheLimitBytes(n * 1024 * 1024 * 1024);
              setState(() => _cacheLimitGb = n);
            },
          ),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout, color: Colors.red),
          title: const Text('Đăng xuất', style: TextStyle(color: Colors.red)),
          subtitle: const Text('Xoá session và cache trên máy này. Kênh trên Telegram giữ nguyên.'),
          onTap: () async {
            final ok = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                content: const Text('Đăng xuất khỏi thiết bị này?'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Huỷ')),
                  FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Đăng xuất')),
                ],
              ),
            );
            if (ok == true) await session.boot.auth.logOut();
            // authorizationStateClosed -> SessionProvider đưa UI về màn đăng nhập.
          },
        ),
      ]),
    );
  }
}
```

Nối vào `BrowserScreen` AppBar actions thêm nút:

```dart
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const SettingsScreen())),
          ),
```

Và trong `SessionProvider._onAuth`, xử lý `AuthState.loggedOut`: set `phase = SessionPhase.auth` + notifyListeners (đưa UI về đăng nhập).

- [ ] **Step 4: Kiểm tra build từng nền tảng có sẵn**

```bash
cd televault && flutter analyze && flutter test
flutter build macos --dart-define=TG_API_ID=1 --dart-define=TG_API_HASH=x
```

Expected: analyze/test PASS; build macOS thành công. Android/Windows/Linux/iOS build khi có binary tương ứng (theo README) — không chặn hoàn thành task này nếu máy dev không có toolchain.

- [ ] **Step 5: Commit**

```bash
git add televault && git commit -m "feat: TDLib packaging script, settings screen with logout, build docs"
```

---

### Task 16: Rà soát cuối — chạy toàn bộ, dọn dẹp, kiểm thử 2 thiết bị

- [ ] **Step 1: Toàn bộ test + analyze**

```bash
cd televault && flutter test && flutter analyze
```

Expected: ALL PASS, no issues.

- [ ] **Step 2: Kiểm thử thủ công end-to-end trên macOS (checklist)**

1. Đăng nhập tài khoản thật → kênh "TeleVault Storage" tự tạo.
2. Upload 1 file ~200MB → progress hiển thị, xuất hiện trong kho và trong kênh Telegram.
3. Tạo thư mục, di chuyển file vào, đổi tên thư mục → caption trên Telegram đổi theo.
4. Gắn tag, lọc theo tag ở màn Tìm, đổi tên tag ở màn Tag.
5. Tắt mạng giữa lúc upload → bật lại → upload tự tiếp tục (TDLib resume).
6. Download file → mở preview ảnh/PDF/video; mở lần 2 tức thì.
7. Xoá file → biến mất khỏi kho + message bị xoá trên Telegram.

- [ ] **Step 3: Kiểm thử đồng bộ 2 thiết bị (nếu có thiết bị Android + binary)**

1. Đăng nhập cùng tài khoản trên thiết bị 2 → quét kênh, thấy đúng cây thư mục.
2. Upload từ thiết bị 1 → trong vài giây thấy trên thiết bị 2 (realtime update).
3. Đổi tên trên thiết bị 2 → cập nhật trên thiết bị 1.

- [ ] **Step 4: Ghi kết quả kiểm thử vào cuối plan này (mục nào pass/fail), fix bug phát hiện được, commit**

```bash
git add -A && git commit -m "chore: final review fixes after end-to-end testing"
```

---

## Mapping spec → task (tự kiểm khi hoàn thành)

| Yêu cầu spec | Task |
|---|---|
| Đăng nhập SĐT/OTP/2FA, session mã hoá | 7, 11 |
| Tìm/tạo kênh marker `#televault-v1` | 8 |
| Quét lịch sử dựng index + progress | 8, 11 |
| Realtime update giữa thiết bị | 8 |
| Caption JSON v1 + dir marker | 2 |
| Cây thư mục ảo, duyệt, breadcrumb | 3, 12 |
| Đổi tên/di chuyển/xoá file + thư mục (batch, journal) | 5, 10, 12 |
| Xung đột "mới thắng, cũ đổi tên", idempotent | 5 |
| Dedup SHA-256 hỏi trước upload | 10, 13 |
| Tag: gắn/gỡ/lọc/quản lý, AND filter | 4, 5, 10, 12 |
| Tìm kiếm LIKE path (gồm tên folder) | 4, 12 |
| Hàng đợi 2 song song, retry, cancel, progress, resume | 9, 10, 13 |
| Journal khôi phục sau khi app tắt | 4, 10 |
| Picker/share-intent/kéo-thả, giữ cấu trúc thư mục | 13 |
| Download on-demand + badge đã tải | 10, 12, 14 |
| Preview ảnh/PDF/video, mở app khác | 14 |
| Cache LRU 2GB, không xoá file đang preview | 14 |
| Lưu về máy (share sheet / Save As) | 14 |
| Wakelock khi truyền | 13 |
| Đăng xuất giữ kênh | 15 |
| Build 6 nền tảng, binary TDLib | 15, 16 |




