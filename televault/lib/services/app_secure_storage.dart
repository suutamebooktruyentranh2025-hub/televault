import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

/// Keychain wrapper — macOS ad-hoc/sandbox builds often fail with -34018
/// (errSecMissingEntitlement); use an app-support file store instead.
final class AppSecureStorage {
  AppSecureStorage({
    FlutterSecureStorage? secureStorage,
    Future<Directory> Function()? supportDirectory,
  })  : _secureStorage = secureStorage ?? _platformSecureStorage(),
        _supportDirectory = supportDirectory ?? getApplicationSupportDirectory;

  final FlutterSecureStorage _secureStorage;
  final Future<Directory> Function() _supportDirectory;

  static FlutterSecureStorage _platformSecureStorage() {
    return const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true),
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
      mOptions: MacOsOptions(useDataProtectionKeyChain: false),
    );
  }

  Future<String?> read(String key) async {
    if (Platform.isMacOS) {
      return _readMacFile(key);
    }
    return _secureStorage.read(key: key);
  }

  Future<void> write(String key, String value) async {
    if (Platform.isMacOS) {
      await _writeMacFile(key, value);
      return;
    }
    await _secureStorage.write(key: key, value: value);
  }

  Future<void> delete(String key) async {
    if (Platform.isMacOS) {
      await _deleteMacFile(key);
      return;
    }
    await _secureStorage.delete(key: key);
  }

  Future<File> _macFile(String key) async {
    final dir = Directory(p.join((await _supportDirectory()).path, 'secure_storage'));
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    final safeName = key.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    return File(p.join(dir.path, '$safeName.dat'));
  }

  Future<String?> _readMacFile(String key) async {
    try {
      final file = await _macFile(key);
      if (!file.existsSync()) return null;
      final raw = (await file.readAsString()).trim();
      return raw.isEmpty ? null : raw;
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('AppSecureStorage read failed ($key): $e\n$st');
      }
      return null;
    }
  }

  Future<void> _writeMacFile(String key, String value) async {
    final file = await _macFile(key);
    await file.writeAsString(value, flush: true);
  }

  Future<void> _deleteMacFile(String key) async {
    final file = await _macFile(key);
    if (file.existsSync()) {
      await file.delete();
    }
  }
}
