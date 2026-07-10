import 'package:flutter/foundation.dart';

import '../locale/app_strings.dart';
import '../services/index_db.dart';
import '../settings/app_settings.dart';

class AppSettingsProvider extends ChangeNotifier {
  AppThemePreference themePreference = AppThemePreference.system;
  AppLocale locale = AppLocale.vi;
  bool autoResumeTransfers = true;
  IndexDb? _db;

  void attachDb(IndexDb db) {
    if (_db == db) return;
    _db = db;
    load();
  }

  Future<void> load() async {
    final db = _db;
    if (db == null) return;
    themePreference = await db.getThemePreference();
    locale = await db.getLocale();
    autoResumeTransfers = await db.getAutoResumeTransfers();
    notifyListeners();
  }

  Future<void> setThemePreference(AppThemePreference value) async {
    themePreference = value;
    await _db?.setThemePreference(value);
    notifyListeners();
  }

  Future<void> setLocale(AppLocale value) async {
    locale = value;
    await _db?.setLocale(value);
    notifyListeners();
  }

  Future<void> setAutoResumeTransfers(bool value) async {
    autoResumeTransfers = value;
    await _db?.setAutoResumeTransfers(value);
    notifyListeners();
  }

  Map<String, String> get labels => stringsFor(locale);

  String t(String key, [Map<String, String> params = const {}]) {
    var text = labels[key] ?? key;
    for (final e in params.entries) {
      text = text.replaceAll('{${e.key}}', e.value);
    }
    return text;
  }
}
