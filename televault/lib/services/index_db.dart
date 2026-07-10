import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../models/pending_transfer.dart';
import '../models/vault_entry.dart';
import 'transfer_service.dart';
import '../settings/app_settings.dart';
import '../utils/folder_tags.dart';
import '../utils/search_text.dart';
import '../utils/trash.dart';
import 'cache_manager.dart';

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
          version: 3,
          onCreate: (db, _) async {
            await _createSchema(db);
          },
          onUpgrade: (db, oldVersion, newVersion) async {
            if (oldVersion < 2) {
              await db.execute('''
                CREATE TABLE folder_tags(
                  folder_path TEXT NOT NULL,
                  tag TEXT NOT NULL,
                  PRIMARY KEY(folder_path, tag)
                )''');
              await _migrateFileTagsToFolderTags(db);
            }
            if (oldVersion < 3) {
              await db.execute('''
                CREATE TABLE transfers(
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  kind TEXT NOT NULL,
                  label TEXT NOT NULL,
                  status TEXT NOT NULL DEFAULT 'queued',
                  local_path TEXT,
                  dest_path TEXT,
                  message_id INTEGER,
                  size INTEGER NOT NULL DEFAULT 0,
                  error TEXT,
                  created_at TEXT NOT NULL
                )''');
            }
          },
        ));
    return IndexDb._(db);
  }

  static Future<void> _createSchema(Database db) async {
    await db.execute('''
              CREATE TABLE files(
                message_id INTEGER PRIMARY KEY,
                path TEXT NOT NULL,
                size INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                mtime TEXT NOT NULL,
                local_path TEXT,
                last_used TEXT,
                td_file_id INTEGER
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
              CREATE TABLE folder_tags(
                folder_path TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY(folder_path, tag)
              )''');
    await db.execute('''
              CREATE TABLE journal(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                op TEXT NOT NULL,
                args TEXT NOT NULL
              )''');
    await db.execute('CREATE TABLE kv(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await db.execute('''
              CREATE TABLE transfers(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                label TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                local_path TEXT,
                dest_path TEXT,
                message_id INTEGER,
                size INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                created_at TEXT NOT NULL
              )''');
  }

  static Future<void> _migrateFileTagsToFolderTags(Database db) async {
    final rows = await db.rawQuery('''
      SELECT f.path, ft.tag
      FROM file_tags ft
      JOIN files f ON f.message_id = ft.message_id
      WHERE f.path NOT LIKE '%/'
    ''');
    for (final r in rows) {
      final filePath = r['path'] as String;
      final tag = r['tag'] as String;
      final parent = _parentFolder(filePath);
      await db.insert(
        'folder_tags',
        {'folder_path': parent, 'tag': tag},
        conflictAlgorithm: ConflictAlgorithm.ignore,
      );
    }
    await db.delete('file_tags');
  }

  static String _parentFolder(String filePath) {
    final trimmed = filePath.substring(0, filePath.lastIndexOf('/'));
    return trimmed.substring(0, trimmed.lastIndexOf('/') + 1);
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
      if (e.isDir) {
        await tx.delete('folder_tags', where: 'folder_path = ?', whereArgs: [e.path]);
        for (final t in e.tags) {
          await tx.insert('folder_tags', {'folder_path': e.path, 'tag': t},
              conflictAlgorithm: ConflictAlgorithm.replace);
          await tx.insert('file_tags', {'message_id': e.messageId, 'tag': t});
        }
      }
    });
  }

  Future<void> setFolderTags(String folderPath, List<String> tags) async {
    assert(folderPath.endsWith('/'));
    await _db.transaction((tx) async {
      await tx.delete('folder_tags', where: 'folder_path = ?', whereArgs: [folderPath]);
      for (final t in tags) {
        await tx.insert('folder_tags', {'folder_path': folderPath, 'tag': t});
      }
    });
    final markerRows = await _db.query('files', where: 'path = ?', whereArgs: [folderPath], limit: 1);
    if (markerRows.isNotEmpty) {
      final id = markerRows.first['message_id'] as int;
      await _db.transaction((tx) async {
        await tx.delete('file_tags', where: 'message_id = ?', whereArgs: [id]);
        for (final t in tags) {
          await tx.insert('file_tags', {'message_id': id, 'tag': t});
        }
      });
    }
  }

  Future<Map<String, List<String>>> folderTagsIndex() async {
    final rows = await _db.query('folder_tags', orderBy: 'folder_path, tag');
    final index = <String, List<String>>{};
    for (final r in rows) {
      final path = r['folder_path'] as String;
      index.putIfAbsent(path, () => []).add(r['tag'] as String);
    }
    return index;
  }

  Future<List<String>> allTagNames() async {
    final rows = await _db.rawQuery('SELECT DISTINCT tag FROM folder_tags ORDER BY tag');
    return rows.map((r) => r['tag'] as String).toList();
  }

  Future<void> renameFolderTagsPath(String from, String to) async {
    final rows = await _db.query('folder_tags', where: 'folder_path LIKE ?', whereArgs: ['$from%']);
    await _db.transaction((tx) async {
      for (final r in rows) {
        final oldPath = r['folder_path'] as String;
        final newPath = to + oldPath.substring(from.length);
        final tag = r['tag'] as String;
        await tx.delete('folder_tags', where: 'folder_path = ? AND tag = ?', whereArgs: [oldPath, tag]);
        await tx.insert('folder_tags', {'folder_path': newPath, 'tag': tag},
            conflictAlgorithm: ConflictAlgorithm.ignore);
      }
    });
  }

  Future<void> renameTagName(String from, String to) async {
    await _db.transaction((tx) async {
      final rows = await tx.query('folder_tags', where: 'tag = ?', whereArgs: [from]);
      for (final r in rows) {
        await tx.delete('folder_tags',
            where: 'folder_path = ? AND tag = ?', whereArgs: [r['folder_path'], from]);
        await tx.insert('folder_tags', {'folder_path': r['folder_path'], 'tag': to},
            conflictAlgorithm: ConflictAlgorithm.ignore);
      }
      final fileTagRows = await tx.query('file_tags', where: 'tag = ?', whereArgs: [from]);
      for (final r in fileTagRows) {
        await tx.delete('file_tags',
            where: 'message_id = ? AND tag = ?', whereArgs: [r['message_id'], from]);
        await tx.insert('file_tags', {'message_id': r['message_id'], 'tag': to},
            conflictAlgorithm: ConflictAlgorithm.ignore);
      }
    });
  }

  Future<void> deleteTagName(String tag) async {
    await _db.transaction((tx) async {
      await tx.delete('folder_tags', where: 'tag = ?', whereArgs: [tag]);
      await tx.delete('file_tags', where: 'tag = ?', whereArgs: [tag]);
    });
  }

  Future<void> delete(int messageId) async {
    await _db.transaction((tx) async {
      await tx.delete('files', where: 'message_id = ?', whereArgs: [messageId]);
      await tx.delete('file_tags', where: 'message_id = ?', whereArgs: [messageId]);
    });
  }

  /// TDLib gán message id tạm khi gửi, đổi sang id thật qua updateMessageSendSucceeded.
  Future<void> rekeyMessageId(int oldId, int newId) async {
    if (oldId == newId) return;
    await _db.transaction((tx) async {
      final rows = await tx.query('files', where: 'message_id = ?', whereArgs: [oldId]);
      if (rows.isEmpty) return;
      final row = Map<String, Object?>.from(rows.first)..['message_id'] = newId;
      await tx.delete('files', where: 'message_id = ?', whereArgs: [oldId]);
      await tx.insert('files', row, conflictAlgorithm: ConflictAlgorithm.replace);
      final tagRows = await tx.query('file_tags', where: 'message_id = ?', whereArgs: [oldId]);
      await tx.delete('file_tags', where: 'message_id = ?', whereArgs: [oldId]);
      for (final t in tagRows) {
        await tx.insert('file_tags', {'message_id': newId, 'tag': t['tag']});
      }
    });
  }

  /// TDLib message id tạm âm — sau khi gửi xong không còn hợp lệ.
  Future<void> deleteTemporaryMessageIds() async {
    await _db.transaction((tx) async {
      await tx.delete('file_tags', where: 'message_id < 0');
      await tx.delete('files', where: 'message_id < 0');
    });
    await purgeStaleJournal();
  }

  /// Xoá index entries không còn message trên kênh (sau scanHistory).
  Future<void> reconcileToMessageIds(Set<int> validIds) async {
    final rows = await _db.query('files', columns: ['message_id']);
    for (final r in rows) {
      final id = r['message_id'] as int;
      if (!validIds.contains(id)) await delete(id);
    }
  }

  /// Journal còn tham chiếu message id tạm — bỏ để không kẹt resumePendingJournal.
  Future<void> purgeStaleJournal() async {
    for (final item in await journalPending()) {
      final mid = item.args['messageId'];
      if (mid is num && mid < 0) await journalRemove(item.id);
    }
  }

  Future<int?> getVaultChatId() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['vault_chat_id']);
    return rows.isEmpty ? null : int.parse(rows.first['value'] as String);
  }

  Future<void> setVaultChatId(int chatId) async {
    await _db.insert('kv', {'key': 'vault_chat_id', 'value': '$chatId'},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<String?> getSaveAsDirectory() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['save_as_dir']);
    return rows.isEmpty ? null : rows.first['value'] as String;
  }

  Future<void> setSaveAsDirectory(String path, {String? bookmark}) async {
    await _db.insert('kv', {'key': 'save_as_dir', 'value': path},
        conflictAlgorithm: ConflictAlgorithm.replace);
    if (bookmark != null && bookmark.isNotEmpty) {
      await _db.insert('kv', {'key': 'save_as_bookmark', 'value': bookmark},
          conflictAlgorithm: ConflictAlgorithm.replace);
    }
  }

  Future<String?> getSaveAsBookmark() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['save_as_bookmark']);
    return rows.isEmpty ? null : rows.first['value'] as String;
  }

  Future<void> clearSaveAsDirectory() async {
    await _db.delete('kv', where: 'key = ?', whereArgs: ['save_as_dir']);
    await _db.delete('kv', where: 'key = ?', whereArgs: ['save_as_bookmark']);
  }

  Future<List<VaultEntry>> getAll() async {
    final rows = await _db.query('files', where: 'message_id > 0');
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

  Future<List<VaultEntry>> search({String? query, List<String> tags = const []}) async {
    final trimmedQuery = query?.trim();
    final hasQuery = trimmedQuery != null && trimmedQuery.isNotEmpty;
    final folderTags = await folderTagsIndex();
    final all = await getAll();

    Iterable<VaultEntry> candidates = all.where((e) => !e.isDir && !isInTrash(e.path));

    if (tags.isNotEmpty) {
      candidates = candidates.where((e) {
        final eff = effectiveTagsForPath(e.path, folderTags);
        return tags.every(eff.contains);
      });
    }

    var results = candidates.toList();

    if (hasQuery) {
      results = results
          .where((e) => entryMatchesSearch(e.path, effectiveTagsForPath(e.path, folderTags), trimmedQuery))
          .toList();
    } else if (tags.isEmpty) {
      return [];
    }

    results.sort((a, b) => a.path.compareTo(b.path));
    return results;
  }

  Future<Map<String, int>> allTags() async {
    final folderTags = await folderTagsIndex();
    final counts = <String, int>{};
    for (final e in (await getAll()).where((x) => !x.isDir && !isInTrash(x.path))) {
      for (final t in effectiveTagsForPath(e.path, folderTags)) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    final sorted = Map.fromEntries(
      counts.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
    );
    return sorted;
  }

  Future<int> folderCountForTag(String tag) async {
    final folderTags = await folderTagsIndex();
    return folderTags.entries.where((e) => e.value.contains(tag)).length;
  }

  Future<VaultEntry?> findBySha(String sha256) async {
    final rows = await _db.query('files', where: 'sha256 = ?', whereArgs: [sha256], limit: 1);
    return rows.isEmpty ? null : _toEntry(rows.first);
  }

  Future<void> setLocalPath(int messageId, String? localPath) async {
    await _db.update('files', {'local_path': localPath},
        where: 'message_id = ?', whereArgs: [messageId]);
  }

  Future<void> touchLastUsed(int messageId) async {
    await _db.update('files', {'last_used': DateTime.now().toUtc().toIso8601String()},
        where: 'message_id = ?', whereArgs: [messageId]);
  }

  Future<void> setTdFileId(int messageId, int tdFileId) async {
    await _db.update('files', {'td_file_id': tdFileId},
        where: 'message_id = ?', whereArgs: [messageId]);
  }

  Future<int> getCacheLimitBytes() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['cache_limit']);
    return rows.isEmpty ? 2 * 1024 * 1024 * 1024 : int.parse(rows.first['value'] as String);
  }

  Future<void> setCacheLimitBytes(int bytes) async {
    await _db.insert('kv', {'key': 'cache_limit', 'value': '$bytes'},
        conflictAlgorithm: ConflictAlgorithm.replace);
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

  Future<int> getLastMessageId() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['last_message_id']);
    return rows.isEmpty ? 0 : int.parse(rows.first['value'] as String);
  }

  Future<void> setLastMessageId(int id) async {
    await _db.insert('kv', {'key': 'last_message_id', 'value': '$id'},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<AppThemePreference> getThemePreference() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['app_theme']);
    if (rows.isEmpty) return AppThemePreference.system;
    return AppThemePreference.values.firstWhere(
      (e) => e.name == rows.first['value'],
      orElse: () => AppThemePreference.system,
    );
  }

  Future<void> setThemePreference(AppThemePreference pref) async {
    await _db.insert('kv', {'key': 'app_theme', 'value': pref.name},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<AppLocale> getLocale() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['app_locale']);
    if (rows.isEmpty) return AppLocale.vi;
    return AppLocale.values.firstWhere(
      (e) => e.name == rows.first['value'],
      orElse: () => AppLocale.vi,
    );
  }

  Future<void> setLocale(AppLocale locale) async {
    await _db.insert('kv', {'key': 'app_locale', 'value': locale.name},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<bool> getAutoResumeTransfers() async {
    final rows = await _db.query('kv', where: 'key = ?', whereArgs: ['auto_resume_transfers']);
    if (rows.isEmpty) return true;
    return rows.first['value'] == '1';
  }

  Future<void> setAutoResumeTransfers(bool enabled) async {
    await _db.insert('kv', {'key': 'auto_resume_transfers', 'value': enabled ? '1' : '0'},
        conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<int> transferAdd({
    required TransferKind kind,
    required String label,
    String? localPath,
    String? destPath,
    int? messageId,
    int size = 0,
  }) async {
    return _db.insert('transfers', {
      'kind': kind.name,
      'label': label,
      'status': 'queued',
      'local_path': localPath,
      'dest_path': destPath,
      'message_id': messageId,
      'size': size,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
  }

  Future<void> transferUpdate(int id, {String? status, String? error}) async {
    final patch = <String, Object?>{};
    if (status != null) patch['status'] = status;
    if (error != null) patch['error'] = error;
    if (patch.isEmpty) return;
    await _db.update('transfers', patch, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> transferRemove(int id) async {
    await _db.delete('transfers', where: 'id = ?', whereArgs: [id]);
  }

  Future<List<PendingTransfer>> transfersPending() async {
    final rows = await _db.query('transfers', orderBy: 'id');
    return rows.map(_toPendingTransfer).toList();
  }

  PendingTransfer _toPendingTransfer(Map<String, Object?> r) {
    return PendingTransfer(
      id: r['id'] as int,
      kind: TransferKind.values.byName(r['kind'] as String),
      label: r['label'] as String,
      status: r['status'] as String,
      localPath: r['local_path'] as String?,
      destPath: r['dest_path'] as String?,
      messageId: r['message_id'] as int?,
      size: r['size'] as int? ?? 0,
      error: r['error'] as String?,
      createdAt: DateTime.parse(r['created_at'] as String),
    );
  }
}
