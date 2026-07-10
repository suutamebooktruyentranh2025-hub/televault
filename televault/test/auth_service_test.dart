import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/telegram/auth_service.dart';
import 'package:televault/services/telegram/td_client.dart';

class FakeTd implements TdSender {
  final sent = <Map<String, dynamic>>[];
  final updateCtrl = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get updates => updateCtrl.stream;

  @override
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) async {
    sent.add(request);
    if (request['@type'] == 'setTdlibParameters') {
      scheduleMicrotask(() => updateCtrl.add({
            '@type': 'updateAuthorizationState',
            'authorization_state': {'@type': 'authorizationStateWaitEncryptionKey'},
          }));
    }
    if (request['@type'] == 'checkDatabaseEncryptionKey') {
      scheduleMicrotask(() => updateCtrl.add({
            '@type': 'updateAuthorizationState',
            'authorization_state': {'@type': 'authorizationStateWaitPhoneNumber'},
          }));
    }
    return {'@type': 'ok'};
  }
}

void main() {
  late FakeTd td;
  late AuthService auth;

  setUp(() {
    td = FakeTd();
    auth = AuthService(td,
        apiId: 1,
        apiHash: 'h',
        databaseDirectory: '/tmp/td',
        filesDirectory: '/tmp/td/files',
        databaseEncryptionKey: 'aGVsbG8=');
  });

  test('init sends setTdlibParameters first then checkDatabaseEncryptionKey', () async {
    await auth.init();
    expect(td.sent[0]['@type'], 'setTdlibParameters');
    expect(td.sent[0]['parameters'], isNotNull);
    expect(td.sent[1]['@type'], 'checkDatabaseEncryptionKey');
    expect(auth.current, AuthState.waitPhone);
  });

  test('submitPhone sends after init', () async {
    await auth.init();
    await auth.submitPhone('+84900000001');
    expect(td.sent.last['@type'], 'setAuthenticationPhoneNumber');
  });
}
