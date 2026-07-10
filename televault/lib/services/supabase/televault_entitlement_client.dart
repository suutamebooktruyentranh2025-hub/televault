import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../config/app_config.dart';

final class ResolvedTelevaultEntitlement {
  const ResolvedTelevaultEntitlement({
    required this.email,
    required this.televaultTierRaw,
    required this.televaultImpliedFree,
    this.remainingTokens,
    this.televaultEntitlementCreatedAt,
  });

  final String email;
  final String televaultTierRaw;
  final bool televaultImpliedFree;
  final int? remainingTokens;
  final String? televaultEntitlementCreatedAt;
}

final class TelevaultEntitlementException implements Exception {
  TelevaultEntitlementException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Calls `resolve-televault-access` — reads `televault_entitlements` only.
final class TelevaultEntitlementClient {
  TelevaultEntitlementClient({http.Client? httpClient})
      : _httpClient = httpClient ?? http.Client();

  final http.Client _httpClient;

  Future<ResolvedTelevaultEntitlement> resolveEntitlement({
    required String accessToken,
    int? defaultTokens,
  }) async {
    final body = defaultTokens != null
        ? jsonEncode({'defaultTokens': defaultTokens})
        : '{}';

    final response = await _httpClient.post(
      AppConfig.resolveTelevaultAccessFunctionUri(),
      headers: {
        'Content-Type': 'application/json',
        'apikey': AppConfig.supabaseAnonKey,
        'Authorization': 'Bearer $accessToken',
      },
      body: body,
    );

    final decodedBody = response.body.isEmpty ? null : jsonDecode(response.body);
    final jsonMap = decodedBody is Map<String, dynamic> ? decodedBody : null;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final errorText = jsonMap?['error']?.toString() ?? response.body;
      throw TelevaultEntitlementException(
        'TeleVault entitlement HTTP ${response.statusCode}: $errorText',
      );
    }

    if (jsonMap?['ok'] != true) {
      final errorText =
          jsonMap?['error']?.toString() ?? 'TeleVault entitlement response not ok';
      throw TelevaultEntitlementException(errorText);
    }

    if (jsonMap?['entitlementSource']?.toString() != 'televault') {
      throw TelevaultEntitlementException(
        'Unexpected entitlement source (expected televault, not crawler profile)',
      );
    }

    final emailRaw = jsonMap?['email']?.toString().trim() ?? '';
    if (emailRaw.isEmpty) {
      throw TelevaultEntitlementException('Entitlement response missing email');
    }

    final tierRaw = jsonMap?['televaultTier']?.toString().trim();
    if (tierRaw == null || tierRaw.isEmpty) {
      throw TelevaultEntitlementException('Entitlement response missing televaultTier');
    }

    final tokensRaw = jsonMap?['remainingTokens'];
    int? remainingTokens;
    if (tokensRaw is num) {
      remainingTokens = tokensRaw.toInt();
    }

    return ResolvedTelevaultEntitlement(
      email: emailRaw.toLowerCase(),
      televaultTierRaw: tierRaw,
      televaultImpliedFree: jsonMap?['televaultImpliedFree'] == true,
      remainingTokens: remainingTokens,
      televaultEntitlementCreatedAt:
          jsonMap?['televaultEntitlementCreatedAt']?.toString(),
    );
  }

  void dispose() {
    _httpClient.close();
  }
}
