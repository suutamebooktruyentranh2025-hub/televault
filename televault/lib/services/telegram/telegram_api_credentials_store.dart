import 'dart:convert';

import '../app_secure_storage.dart';

final class TelegramApiCredentials {
  const TelegramApiCredentials({required this.apiId, required this.apiHash});

  final int apiId;
  final String apiHash;

  Map<String, dynamic> toJson() => {'apiId': apiId, 'apiHash': apiHash};

  static TelegramApiCredentials? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final apiId = raw['apiId'];
    final apiHash = raw['apiHash']?.toString().trim() ?? '';
    if (apiId is! num || apiId <= 0 || apiHash.isEmpty) return null;
    return TelegramApiCredentials(apiId: apiId.toInt(), apiHash: apiHash);
  }
}

/// Lưu apiId/apiHash per Supabase user trên thiết bị.
final class TelegramApiCredentialsStore {
  TelegramApiCredentialsStore({AppSecureStorage? storage})
      : _storage = storage ?? AppSecureStorage();

  final AppSecureStorage _storage;

  String _key(String userId) => 'televault_tg_api_$userId';

  Future<TelegramApiCredentials?> load({required String userId}) async {
    final trimmed = userId.trim();
    if (trimmed.isEmpty) return null;
    final raw = await _storage.read(_key(trimmed));
    if (raw == null || raw.isEmpty) return null;
    try {
      return TelegramApiCredentials.fromJson(jsonDecode(raw));
    } catch (_) {
      return null;
    }
  }

  Future<void> save({
    required String userId,
    required int apiId,
    required String apiHash,
  }) async {
    final trimmed = userId.trim();
    if (trimmed.isEmpty) {
      throw ArgumentError('userId is required');
    }
    if (apiId <= 0 || apiHash.trim().isEmpty) {
      throw ArgumentError('Invalid Telegram API credentials');
    }
    await _storage.write(
      _key(trimmed),
      jsonEncode({'apiId': apiId, 'apiHash': apiHash.trim()}),
    );
  }

  Future<void> clear({required String userId}) async {
    final trimmed = userId.trim();
    if (trimmed.isEmpty) return;
    await _storage.delete(_key(trimmed));
  }
}
