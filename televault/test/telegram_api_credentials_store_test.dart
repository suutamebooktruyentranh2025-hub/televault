import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:televault/services/app_secure_storage.dart';
import 'package:televault/services/telegram/telegram_api_credentials_store.dart';

void main() {
  late Directory tempDir;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('televault_secure_test_');
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      await tempDir.delete(recursive: true);
    }
  });

  test('save and load credentials per user', () async {
    final storage = AppSecureStorage(
      supportDirectory: () async => tempDir,
    );
    final store = TelegramApiCredentialsStore(storage: storage);
    await store.save(userId: 'user-a', apiId: 12345, apiHash: 'abc123');
    await store.save(userId: 'user-b', apiId: 999, apiHash: 'xyz');

    final a = await store.load(userId: 'user-a');
    final b = await store.load(userId: 'user-b');

    expect(a?.apiId, 12345);
    expect(a?.apiHash, 'abc123');
    expect(b?.apiId, 999);
    expect(b?.apiHash, 'xyz');
  });

  test('clear removes stored credentials', () async {
    final storage = AppSecureStorage(
      supportDirectory: () async => tempDir,
    );
    final store = TelegramApiCredentialsStore(storage: storage);
    await store.save(userId: 'user-a', apiId: 1, apiHash: 'h');
    await store.clear(userId: 'user-a');
    expect(await store.load(userId: 'user-a'), isNull);
  });

  test('load returns null for invalid payload', () async {
    final storage = AppSecureStorage(
      supportDirectory: () async => tempDir,
    );
    final secretsDir = Directory(p.join(tempDir.path, 'secure_storage'))
      ..createSync(recursive: true);
    File(p.join(secretsDir.path, 'televault_tg_api_bad.dat')).writeAsStringSync('{not json');

    final store = TelegramApiCredentialsStore(storage: storage);
    expect(await store.load(userId: 'bad'), isNull);
  });
}
