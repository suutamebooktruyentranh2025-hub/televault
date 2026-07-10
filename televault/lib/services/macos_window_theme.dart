import 'dart:io';
import 'dart:ui';

import 'package:flutter/services.dart';

/// Đồng bộ title bar / nền cửa sổ macOS với theme Flutter.
class MacosWindowTheme {
  MacosWindowTheme._();

  static const _channel = MethodChannel('com.televault.televault/window');

  static Future<void> sync(Brightness brightness) async {
    if (!Platform.isMacOS) return;
    try {
      await _channel.invokeMethod<void>('setAppearance', {
        'dark': brightness == Brightness.dark,
      });
    } on PlatformException {
      // Bỏ qua nếu channel chưa sẵn sàng (tests, non-macOS embedder).
    }
  }
}
