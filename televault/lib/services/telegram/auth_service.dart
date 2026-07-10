import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'td_client.dart';

enum AuthState { starting, waitPhone, waitCode, waitPassword, ready, loggedOut }

class AuthService {
  final TdSender _td;
  final int apiId;
  final String apiHash;
  final String databaseDirectory;
  final String filesDirectory;
  /// Base64-encoded 32-byte database encryption key (TDLib JSON bytes format).
  final String databaseEncryptionKey;
  final bool legacySetTdlibParameters;

  final _states = StreamController<AuthState>.broadcast();
  Stream<AuthState> get states => _states.stream;
  AuthState current = AuthState.starting;

  StreamSubscription<Map<String, dynamic>>? _updatesSub;
  Future<void> _chain = Future.value();
  bool _paramsReady = false;

  static const _skipTdlibParams = {
    'authorizationStateWaitTdlibParameters',
  };

  static const _skipSetupStates = {
    'authorizationStateWaitTdlibParameters',
    'authorizationStateWaitEncryptionKey',
  };

  AuthService(this._td,
      {required this.apiId,
      required this.apiHash,
      required this.databaseDirectory,
      required this.filesDirectory,
      required this.databaseEncryptionKey,
      this.legacySetTdlibParameters = true});

  /// TDLib không gửi update cho tới request đầu tiên — setTdlibParameters phải là request #1.
  Future<void> init() async {
    Directory(filesDirectory).createSync(recursive: true);

    final firstSetup = _waitAuthState(skip: _skipTdlibParams);
    await _sendTdlibParameters();
    var state = await firstSetup;
    state = await _advancePastSetupStates(state);
    await _handleAuthState(state);

    _updatesSub = _td.updates
        .where((u) => u['@type'] == 'updateAuthorizationState')
        .map((u) => u['authorization_state'] as Map<String, dynamic>)
        .listen((st) {
      _chain = _chain.then((_) => _handleAuthState(st)).catchError((Object e, StackTrace st) {
        _states.addError(e, st);
      });
    });
  }

  Future<void> _sendTdlibParameters() async {
    try {
      await _td.send(_tdlibParametersRequest());
    } on TdException catch (e) {
      if (e.code != 400) rethrow;
    }
    _paramsReady = true;
  }

  Future<Map<String, dynamic>> _advancePastSetupStates(Map<String, dynamic> state) async {
    while (true) {
      switch (state['@type'] as String) {
        case 'authorizationStateWaitEncryptionKey':
          final next = _waitAuthState(skip: _skipSetupStates);
          try {
            await _td.send({
              '@type': 'checkDatabaseEncryptionKey',
              'encryption_key': databaseEncryptionKey,
            });
          } on TdException catch (e) {
            if (e.code == 401 || e.message.toLowerCase().contains('password')) {
              throw StateError(
                  'Không mở được DB Telegram (sai encryption key). Chạy: ./tool/reset_td_data.sh');
            }
            if (e.code != 400) rethrow;
          }
          state = await next;
        case 'authorizationStateWaitTdlibParameters':
          await _sendTdlibParameters();
          state = await _waitAuthState(skip: _skipTdlibParams);
        default:
          return state;
      }
    }
  }

  Map<String, dynamic> _tdlibParametersBody() => {
        'use_test_dc': false,
        'database_directory': databaseDirectory,
        'files_directory': filesDirectory,
        'database_encryption_key': databaseEncryptionKey,
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

  Map<String, dynamic> _tdlibParametersRequest() {
    final body = _tdlibParametersBody();
    if (legacySetTdlibParameters) {
      return {'@type': 'setTdlibParameters', 'parameters': body};
    }
    return {'@type': 'setTdlibParameters', ...body};
  }

  Future<Map<String, dynamic>> _waitAuthState({Set<String> skip = const {}}) {
    final completer = Completer<Map<String, dynamic>>();
    late final StreamSubscription<Map<String, dynamic>> sub;
    sub = _td.updates.where((u) => u['@type'] == 'updateAuthorizationState').listen(
      (u) {
        final state = u['authorization_state'] as Map<String, dynamic>;
        if (skip.contains(state['@type'])) return;
        if (!completer.isCompleted) {
          completer.complete(state);
          sub.cancel();
        }
      },
      onError: completer.completeError,
    );
    return completer.future.timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        sub.cancel();
        throw TimeoutException('TDLib auth state timeout');
      },
    );
  }

  void _emit(AuthState s) {
    current = s;
    _states.add(s);
  }

  Future<void> _handleAuthState(Map<String, dynamic> st) async {
    switch (st['@type'] as String) {
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
      case 'authorizationStateWaitTdlibParameters':
      case 'authorizationStateWaitEncryptionKey':
        break;
    }
  }

  Future<void> _requireParams() async {
    if (!_paramsReady) throw StateError('TDLib chưa khởi tạo xong');
  }

  Future<void> submitPhone(String phone) async {
    await _requireParams();
    await _td.send({'@type': 'setAuthenticationPhoneNumber', 'phone_number': phone});
  }

  Future<void> submitCode(String code) async {
    await _requireParams();
    await _td.send({'@type': 'checkAuthenticationCode', 'code': code});
  }

  Future<void> submitPassword(String password) async {
    await _requireParams();
    await _td.send({'@type': 'checkAuthenticationPassword', 'password': password});
  }

  Future<void> logOut() async {
    await _requireParams();
    await _td.send({'@type': 'logOut'});
  }

  Future<void> dispose() async {
    await _updatesSub?.cancel();
    await _states.close();
  }
}
