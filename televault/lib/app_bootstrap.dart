import 'dart:io';
import 'dart:math';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import 'services/index_db.dart';
import 'services/telegram/auth_service.dart';
import 'services/telegram/td_client.dart';

const _compileApiId = int.fromEnvironment('TG_API_ID');
const _compileApiHash = String.fromEnvironment('TG_API_HASH');

/// Dev fallback khi chưa có Supabase session (dart_defines.json).
({int apiId, String apiHash})? compileTimeTelegramCredentials() {
  if (_compileApiId == 0 || _compileApiHash.isEmpty) return null;
  return (apiId: _compileApiId, apiHash: _compileApiHash);
}

Future<String> _loadOrCreateTdDbKey(Directory tdDir) async {
  final hasDb = _hasExistingTdDb(tdDir);

  if (Platform.isMacOS || Platform.isLinux || Platform.isWindows) {
    final keyFile = File(p.join(tdDir.path, 'db_key'));
    if (!hasDb) return '';
    if (await keyFile.exists()) {
      final raw = (await keyFile.readAsString()).trim();
      if (raw.isEmpty) return '';
      if (raw.length == 64 && RegExp(r'^[0-9a-fA-F]+$').hasMatch(raw)) {
        final bytes = <int>[];
        for (var i = 0; i < raw.length; i += 2) {
          bytes.add(int.parse(raw.substring(i, i + 2), radix: 16));
        }
        final b64 = base64Encode(bytes);
        await keyFile.writeAsString(b64, flush: true);
        return b64;
      }
      return raw;
    }
    // DB tồn tại nhưng chưa có db_key → DB không mã hóa (encryption_key rỗng).
    return '';
  }

  const storage = FlutterSecureStorage();
  var key = await storage.read(key: 'td_db_key');
  if (key == null) {
    final rnd = Random.secure();
    final bytes = List<int>.generate(32, (_) => rnd.nextInt(256));
    key = base64Encode(bytes);
    await storage.write(key: 'td_db_key', value: key);
  }
  return key;
}

class Bootstrap {
  final TdClient td;
  final AuthService auth;
  final IndexDb db;
  final bool legacyTdApi;
  const Bootstrap(this.td, this.auth, this.db, {this.legacyTdApi = true});
}

Future<Bootstrap> bootstrap({
  required int apiId,
  required String apiHash,
}) async {
  if (apiId == 0 || apiHash.isEmpty) {
    throw StateError('Thiếu TG_API_ID/TG_API_HASH');
  }

  final support = await getApplicationSupportDirectory();
  final tdDir = Directory(p.join(support.path, 'td'))..createSync(recursive: true);
  Directory(p.join(tdDir.path, 'files')).createSync(recursive: true);

  final key = await _loadOrCreateTdDbKey(tdDir);

  final td = await TdClient.start();
  final auth = AuthService(td,
      apiId: apiId,
      apiHash: apiHash,
      databaseDirectory: tdDir.path,
      filesDirectory: p.join(tdDir.path, 'files'),
      databaseEncryptionKey: key,
      legacySetTdlibParameters: td.legacySetTdlibParameters);
  await auth.init();

  final DatabaseFactory factory;
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    sqfliteFfiInit();
    factory = databaseFactoryFfi;
  } else {
    factory = databaseFactory;
  }
  final db = await IndexDb.open(factory, p.join(support.path, 'index.db'));

  return Bootstrap(td, auth, db, legacyTdApi: td.legacySetTdlibParameters);
}

bool _hasExistingTdDb(Directory tdDir) {
  if (!tdDir.existsSync()) return false;
  for (final e in tdDir.listSync(recursive: true)) {
    final name = p.basename(e.path);
    if (name.startsWith('td.') || name == 'db.sqlite' || name.endsWith('.binlog')) {
      return true;
    }
  }
  return false;
}
