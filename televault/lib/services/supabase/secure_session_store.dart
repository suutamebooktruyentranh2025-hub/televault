import 'dart:convert';

import '../../models/supabase_session_record.dart';
import '../app_secure_storage.dart';

/// Persists Supabase membership session (Keychain on mobile, file on macOS).
final class SecureSessionStore {
  SecureSessionStore({AppSecureStorage? storage})
      : _storage = storage ?? AppSecureStorage();

  static const _sessionKey = 'televault_supabase_session_v3';

  final AppSecureStorage _storage;

  Future<void> saveSession(SupabaseSessionRecord sessionRecord) async {
    await _storage.write(_sessionKey, jsonEncode(sessionRecord.toJson()));
  }

  Future<SupabaseSessionRecord?> loadSession() async {
    final encoded = await _storage.read(_sessionKey);
    if (encoded == null || encoded.isEmpty) return null;
    try {
      return SupabaseSessionRecord.fromJson(
        jsonDecode(encoded) as Map<String, dynamic>,
      );
    } catch (_) {
      await _storage.delete(_sessionKey);
      return null;
    }
  }

  Future<void> clearSession() async {
    await _storage.delete(_sessionKey);
  }
}
