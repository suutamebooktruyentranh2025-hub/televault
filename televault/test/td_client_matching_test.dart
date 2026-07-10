import 'package:flutter_test/flutter_test.dart';
import 'package:televault/services/telegram/td_client.dart';

void main() {
  test('classify: object with @extra is a response', () {
    final r = classifyIncoming({'@type': 'ok', '@extra': 'req-1'});
    expect(r.extra, 'req-1');
    expect(r.isUpdate, isFalse);
  });

  test('classify: object without @extra is an update', () {
    final r = classifyIncoming({'@type': 'updateNewMessage'});
    expect(r.extra, isNull);
    expect(r.isUpdate, isTrue);
  });

  test('TdError detected from response', () {
    expect(isTdError({'@type': 'error', 'code': 429, 'message': 'Too Many Requests'}), isTrue);
    expect(isTdError({'@type': 'ok'}), isFalse);
  });
}
