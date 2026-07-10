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

abstract class TdSender {
  Stream<Map<String, dynamic>> get updates;
  Future<Map<String, dynamic>> send(Map<String, dynamic> request);
}

Future<void> _tdWorkerMain(List<Object?> args) async {
  final mainSendPort = args[0] as SendPort;
  final legacyApi = args[1] as bool;
  try {
    final ffi = TdFfi.open();
    ffi.execute(jsonEncode({'@type': 'setLogVerbosityLevel', 'new_verbosity_level': 1}));
    final clientId = ffi.createClientId();

    final workerPort = ReceivePort();
    mainSendPort.send(['ready', clientId, workerPort.sendPort, legacyApi]);

    workerPort.listen((message) {
      if (message is String) {
        ffi.send(clientId, message);
      }
    });

    while (true) {
      final raw = ffi.receive(0.05);
      if (raw != null) mainSendPort.send(['raw', raw]);
      await Future<void>.delayed(Duration.zero);
    }
  } catch (e, st) {
    mainSendPort.send(['error', e.toString(), st.toString()]);
  }
}

class TdClient implements TdSender {
  late final int _clientId;
  late final SendPort _workerSendPort;
  bool legacySetTdlibParameters = true;
  final _uuid = const Uuid();
  final _pending = <String, Completer<Map<String, dynamic>>>{};
  final _updateBuffer = <Map<String, dynamic>>[];
  late final StreamController<Map<String, dynamic>> _updatesCtrl;

  @override
  late final Stream<Map<String, dynamic>> updates;

  TdClient._() {
    _updatesCtrl = StreamController<Map<String, dynamic>>.broadcast(
      onListen: () {
        for (final u in _updateBuffer) {
          _updatesCtrl.add(u);
        }
      },
    );
    updates = _updatesCtrl.stream;
  }

  static Future<TdClient> start() async {
    final legacyApi = TdFfi.open().legacySetTdlibParameters;
    final c = TdClient._()..legacySetTdlibParameters = legacyApi;
    final ready = Completer<void>();
    final port = ReceivePort();
    port.listen((message) {
      if (message is! List) return;
      switch (message[0]) {
        case 'ready':
          c._clientId = message[1] as int;
          c._workerSendPort = message[2] as SendPort;
          if (!ready.isCompleted) ready.complete();
        case 'error':
          if (!ready.isCompleted) {
            ready.completeError(StateError('TDLib worker: ${message[1]}'));
          }
        case 'raw':
          c._onIncoming(message[1] as String);
      }
    });
    await Isolate.spawn(_tdWorkerMain, [port.sendPort, legacyApi]);
    await ready.future.timeout(const Duration(seconds: 20), onTimeout: () {
      throw StateError('TDLib worker timeout — kiểm tra libtdjson.dylib trong app bundle');
    });
    return c;
  }

  void _onIncoming(String raw) {
    final obj = jsonDecode(raw) as Map<String, dynamic>;
    final cid = obj['@client_id'];
    if (cid != null && _clientIdOf(cid) != _clientId) return;

    final inc = classifyIncoming(obj);
    if (inc.isUpdate) {
      _updateBuffer.add(inc.object);
      if (_updateBuffer.length > 128) _updateBuffer.removeAt(0);
      if (!_updatesCtrl.isClosed) _updatesCtrl.add(inc.object);
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

  @override
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) {
    final extra = _uuid.v4();
    final completer = Completer<Map<String, dynamic>>();
    _pending[extra] = completer;
    _workerSendPort.send(jsonEncode({...request, '@extra': extra}));
    return completer.future.timeout(
      const Duration(seconds: 30),
      onTimeout: () {
        _pending.remove(extra);
        throw TimeoutException('TDLib request timeout: ${request['@type']}');
      },
    );
  }

  static int _clientIdOf(Object cid) {
    if (cid is int) return cid;
    if (cid is num) return cid.toInt();
    if (cid is String) return int.tryParse(cid) ?? -1;
    return -1;
  }
}
