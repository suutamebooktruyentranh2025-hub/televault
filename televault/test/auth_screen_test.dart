import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:televault/screens/auth_screen.dart';
import 'package:televault/services/telegram/auth_service.dart';

import 'test_helpers.dart';

void main() {
  testWidgets('shows phone form on waitPhone and submits', (tester) async {
    String? submittedPhone;
    await pumpWithSettings(tester, AuthScreen(
      state: AuthState.waitPhone,
      onPhone: (p) async => submittedPhone = p,
      onCode: (_) async {},
      onPassword: (_) async {},
    ));
    expect(find.textContaining('Số điện thoại'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '+84900000001');
    await tester.tap(find.byType(FilledButton));
    await tester.pump();
    expect(submittedPhone, '+84900000001');
  });

  testWidgets('shows code form on waitCode', (tester) async {
    await pumpWithSettings(tester, AuthScreen(
      state: AuthState.waitCode,
      onPhone: (_) async {}, onCode: (_) async {}, onPassword: (_) async {},
    ));
    expect(find.textContaining('Mã xác nhận'), findsOneWidget);
  });

  testWidgets('shows password form on waitPassword', (tester) async {
    await pumpWithSettings(tester, AuthScreen(
      state: AuthState.waitPassword,
      onPhone: (_) async {}, onCode: (_) async {}, onPassword: (_) async {},
    ));
    expect(find.textContaining('Mật khẩu'), findsOneWidget);
  });
}
