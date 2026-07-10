import 'dart:async';

import 'package:televault/services/telegram/td_client.dart';

class ScriptedTd implements TdSender {
  final Map<String, List<Map<String, dynamic>>> responses = {};
  final Map<String, Object> throwOn = {};
  final sent = <Map<String, dynamic>>[];
  final updateCtrl = StreamController<Map<String, dynamic>>.broadcast();

  @override
  Stream<Map<String, dynamic>> get updates => updateCtrl.stream;

  @override
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) async {
    sent.add(request);
    final type = request['@type'] as String;
    final err = throwOn[type];
    if (err != null) {
      if (err is Exception) throw err;
      throw Exception(err.toString());
    }
    final queue = responses[type];
    if (queue == null || queue.isEmpty) return {'@type': 'ok'};
    return queue.removeAt(0);
  }
}
