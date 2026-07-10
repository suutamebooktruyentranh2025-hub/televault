import 'package:televault/services/telegram/td_client.dart';

Future<void> main() async {
  final c = await TdClient.start();
  final v = await c.send({'@type': 'getOption', 'name': 'version'});
  print('TDLib version: ${v['value']}');
}
