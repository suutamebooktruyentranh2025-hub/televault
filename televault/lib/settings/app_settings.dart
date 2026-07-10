import 'package:flutter/material.dart';

enum AppThemePreference { system, light, dark }

enum AppLocale { vi, en }

extension AppThemePreferenceX on AppThemePreference {
  ThemeMode get themeMode => switch (this) {
        AppThemePreference.system => ThemeMode.system,
        AppThemePreference.light => ThemeMode.light,
        AppThemePreference.dark => ThemeMode.dark,
      };
}
