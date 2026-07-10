import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:televault/providers/app_settings_provider.dart';

Future<void> pumpWithSettings(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    ChangeNotifierProvider(
      create: (_) => AppSettingsProvider(),
      child: MaterialApp(home: child),
    ),
  );
}
