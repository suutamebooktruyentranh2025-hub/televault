/// Session JSON — [televaultTier] from `resolve-televault-access` / `televault_entitlements`.
final class SupabaseSessionRecord {
  static const int currentSessionSchemaVersion = 3;

  const SupabaseSessionRecord({
    required this.email,
    required this.televaultTier,
    required this.televaultImpliedFree,
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAtEpochMs,
    required this.lastValidatedEpochMs,
    required this.savedAtIso,
    this.remainingTokens,
    this.televaultEntitlementCreatedAt,
    this.sessionSchemaVersion = currentSessionSchemaVersion,
  });

  final String email;
  final String televaultTier;
  final bool televaultImpliedFree;
  final String accessToken;
  final String refreshToken;
  final int expiresAtEpochMs;
  final int lastValidatedEpochMs;
  final String savedAtIso;
  final int? remainingTokens;
  /// When the TeleVault entitlement row was created — trial clock (not crawler auth age).
  final String? televaultEntitlementCreatedAt;
  final int sessionSchemaVersion;

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{
      'sessionSchemaVersion': currentSessionSchemaVersion,
      'email': email,
      'televaultTier': televaultTier,
      'televaultImpliedFree': televaultImpliedFree,
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'expiresAt': expiresAtEpochMs,
      'lastValidated': lastValidatedEpochMs,
      'savedAt': savedAtIso,
    };
    if (remainingTokens != null) {
      json['remainingTokens'] = remainingTokens;
    }
    if (televaultEntitlementCreatedAt != null) {
      json['televaultEntitlementCreatedAt'] = televaultEntitlementCreatedAt;
    }
    return json;
  }

  factory SupabaseSessionRecord.fromJson(Map<String, dynamic> json) {
    final schemaVersion = json['sessionSchemaVersion'] as int? ?? 1;

    return SupabaseSessionRecord(
      email: json['email'] as String,
      // Never trust legacy crawler userType — re-sync from televault_entitlements.
      televaultTier: json['televaultTier']?.toString().trim() ?? '',
      televaultImpliedFree: json['televaultImpliedFree'] as bool? ??
          json['impliedSupabaseFree'] as bool? ??
          false,
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresAtEpochMs: (json['expiresAt'] as num).toInt(),
      lastValidatedEpochMs: (json['lastValidated'] as num).toInt(),
      savedAtIso: json['savedAt'] as String,
      remainingTokens: json['remainingTokens'] != null
          ? (json['remainingTokens'] as num).toInt()
          : null,
      televaultEntitlementCreatedAt:
          json['televaultEntitlementCreatedAt']?.toString(),
      sessionSchemaVersion: schemaVersion,
    );
  }

  bool get needsTelevaultEntitlementRefresh =>
      sessionSchemaVersion < SupabaseSessionRecord.currentSessionSchemaVersion ||
      televaultTier.trim().isEmpty ||
      (televaultEntitlementCreatedAt == null || televaultEntitlementCreatedAt!.isEmpty);

  SupabaseSessionRecord copyWith({
    String? email,
    String? televaultTier,
    bool? televaultImpliedFree,
    String? accessToken,
    String? refreshToken,
    int? expiresAtEpochMs,
    int? lastValidatedEpochMs,
    String? savedAtIso,
    int? remainingTokens,
    String? televaultEntitlementCreatedAt,
    int? sessionSchemaVersion,
  }) {
    return SupabaseSessionRecord(
      email: email ?? this.email,
      televaultTier: televaultTier ?? this.televaultTier,
      televaultImpliedFree: televaultImpliedFree ?? this.televaultImpliedFree,
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      expiresAtEpochMs: expiresAtEpochMs ?? this.expiresAtEpochMs,
      lastValidatedEpochMs: lastValidatedEpochMs ?? this.lastValidatedEpochMs,
      savedAtIso: savedAtIso ?? this.savedAtIso,
      remainingTokens: remainingTokens ?? this.remainingTokens,
      televaultEntitlementCreatedAt:
          televaultEntitlementCreatedAt ?? this.televaultEntitlementCreatedAt,
      sessionSchemaVersion: sessionSchemaVersion ?? this.sessionSchemaVersion,
    );
  }
}
