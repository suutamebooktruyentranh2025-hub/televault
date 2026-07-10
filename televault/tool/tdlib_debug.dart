import 'dart:async';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:televault/services/telegram/td_client.dart';

const apiId = int.fromEnvironment('TG_API_ID');
const apiHash = String.fromEnvironment('TG_API_HASH');

Future<void> main() async {
  print('apiId=$apiId hashLen=${apiHash.length}');
  final support = await getApplicationSupportDirectory();
  final tdDir = Directory(p.join(support.path, 'td'))..createSync(recursive: true);
  final filesDir = Directory(p.join(tdDir.path, 'files'))..createSync(recursive: true);

  final td = await TdClient.start();
  print('client started');

  td.updates.listen((u) => print('UPDATE ${u['@type']} auth=${u['authorization_state']?['@type']}'));

  try {
    final params = {
      'use_test_dc': false,
      'database_directory': tdDir.path,
      'files_directory': filesDir.path,
      'database_encryption_key': '',
      'use_file_database': true,
      'use_chat_info_database': true,
      'use_message_database': true,
      'use_secret_chats': false,
      'api_id': apiId,
      'api_hash': apiHash,
      'system_language_code': 'vi',
      'device_model': 'TeleVault',
      'system_version': Platform.operatingSystem,
      'application_version': '1.0.0',
    };
    final resp = await td.send({
      '@type': 'setTdlibParameters',
      'parameters': params,
    }).timeout(const Duration(seconds: 15));
    print('RESP setTdlibParameters: ${resp['@type']}');
  } catch (e) {
    print('ERR setTdlibParameters: $e');
    exit(1);
  }

  try {
    final resp = await td.send({
      '@type': 'checkDatabaseEncryptionKey',
      'encryption_key': '',
    }).timeout(const Duration(seconds: 15));
    print('RESP checkKey: ${resp['@type']}');
  } catch (e) {
    print('ERR checkKey: $e');
  }

  await Future<void>.delayed(const Duration(seconds: 3));
  exit(0);
}
