import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../config/app_config.dart';
import '../../models/supabase_session_record.dart';
import 'free_user_tier.dart';
import 'televault_entitlement_client.dart';

final class FreeTokenExhaustedException implements Exception {
  const FreeTokenExhaustedException();
}

final class CreditEnsureResult {
  const CreditEnsureResult({
    required this.ok,
    this.remainingTokens,
    this.skipped = false,
    this.error,
  });

  final bool ok;
  final int? remainingTokens;
  final bool skipped;
  final String? error;
}

final class CreditConsumeResult {
  const CreditConsumeResult({
    required this.ok,
    this.remainingTokens,
    this.needLogin = false,
    this.skipped = false,
    this.error,
  });

  final bool ok;
  final int? remainingTokens;
  final bool needLogin;
  final bool skipped;
  final String? error;
}

/// TeleVault free-tier credits via `resolve-televault-access` / `consume-televault-credit`.
final class FreeUserCreditClient {
  FreeUserCreditClient({
    http.Client? httpClient,
    TelevaultEntitlementClient? entitlementClient,
  })  : _httpClient = httpClient ?? http.Client(),
        _entitlementClient = entitlementClient ?? TelevaultEntitlementClient();

  final http.Client _httpClient;
  final TelevaultEntitlementClient _entitlementClient;

  Future<CreditEnsureResult> ensureCredits(SupabaseSessionRecord? session) async {
    if (session == null) {
      return const CreditEnsureResult(
        ok: false,
        error: 'Bạn cần đăng nhập để dùng credit.',
      );
    }
    if (!isFreeUserTokenTier(session)) {
      return const CreditEnsureResult(ok: true, skipped: true);
    }

    try {
      final entitlement = await _entitlementClient.resolveEntitlement(
        accessToken: session.accessToken,
        defaultTokens: freeUserTokenMax,
      );
      if (isTelevaultMemberTier(entitlement.televaultTierRaw)) {
        return const CreditEnsureResult(ok: true, skipped: true);
      }
      return CreditEnsureResult(
        ok: true,
        remainingTokens: entitlement.remainingTokens ?? 0,
      );
    } catch (_) {
      return const CreditEnsureResult(
        ok: false,
        error: 'Không kiểm tra được credit. Thử lại sau.',
      );
    }
  }

  Future<CreditConsumeResult> consumeUploadCredit(
    SupabaseSessionRecord? session, {
    required String destPath,
  }) async {
    if (session == null) {
      return const CreditConsumeResult(
        ok: false,
        error: 'Bạn cần đăng nhập để dùng credit.',
      );
    }
    if (!isFreeUserTokenTier(session)) {
      return const CreditConsumeResult(ok: true, skipped: true);
    }

    final data = await _callEdgeFunction(
      AppConfig.consumeTelevaultCreditFunctionUri(),
      session,
      {'destPath': destPath.trim()},
    );
    if (data == null) {
      return const CreditConsumeResult(
        ok: false,
        error: 'Không consume được credit.',
      );
    }

    if (data['skipped'] == true) {
      return const CreditConsumeResult(ok: true, skipped: true);
    }

    final ok = data['ok'] == true;
    final needLogin = data['needLogin'] == true || data['need_login'] == true;
    final remaining = _parseRemaining(
      data['remaining_tokens'] ?? data['remainingTokens'],
    );
    return CreditConsumeResult(
      ok: ok,
      remainingTokens: remaining,
      needLogin: needLogin,
    );
  }

  Future<Map<String, dynamic>?> _callEdgeFunction(
    Uri uri,
    SupabaseSessionRecord session,
    Map<String, dynamic> payload,
  ) async {
    try {
      final response = await _httpClient.post(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'apikey': AppConfig.supabaseAnonKey,
          'Authorization': 'Bearer ${session.accessToken}',
        },
        body: jsonEncode(payload),
      );
      if (response.body.isEmpty) return null;
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) return null;
      if (response.statusCode < 200 || response.statusCode >= 300) return null;
      return decoded;
    } catch (_) {
      return null;
    }
  }

  int _parseRemaining(Object? raw) {
    if (raw == null) return 0;
    final value = double.tryParse('$raw');
    if (value == null || !value.isFinite) return 0;
    return value.floor().clamp(0, 1 << 30);
  }

  void dispose() {
    _httpClient.close();
    _entitlementClient.dispose();
  }
}
