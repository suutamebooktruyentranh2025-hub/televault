import 'dart:io';

import 'package:televault/app_bootstrap.dart';
import 'package:televault/services/telegram/auth_service.dart';

Future<void> main() async {
  print('=== bootstrap smoke ===');
  try {
    final creds = compileTimeTelegramCredentials();
    if (creds == null) {
      print('SKIP: no compile-time TG credentials');
      exit(0);
    }
    final boot = await bootstrap(apiId: creds.apiId, apiHash: creds.apiHash)
        .timeout(const Duration(seconds: 60));
    print('SUCCESS auth=${boot.auth.current}');
    exit(boot.auth.current == AuthState.waitPhone || boot.auth.current == AuthState.ready ? 0 : 2);
  } catch (e) {
    print('FAIL: $e');
    exit(1);
  }
}
