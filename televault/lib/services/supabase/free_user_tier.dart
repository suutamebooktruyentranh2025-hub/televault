import '../../models/supabase_session_record.dart';

const int freeUserTokenMax = 100;

const Set<String> _memberTiers = {
  'member',
  'super member',
  'premium member',
  'admin',
};

bool isTelevaultMemberTier(String? televaultTier) =>
    _memberTiers.contains(televaultTier?.trim().toLowerCase() ?? '');

/// True when signed-in user is on TeleVault free tier (from `televault_entitlements`).
bool isFreeUserTokenTier(SupabaseSessionRecord? session) {
  if (session == null) return false;
  final normalized = session.televaultTier.trim().toLowerCase();
  if (isTelevaultMemberTier(normalized)) return false;
  if (session.televaultImpliedFree) return true;
  return normalized == 'free';
}

/// Trial expired when TeleVault tokens depleted or TeleVault entitlement age >= [trialDays].
/// Uses [televaultEntitlementCreatedAt] only — never crawler auth age or crawler credits.
bool isFreeTrialExpired({
  required SupabaseSessionRecord session,
  String? televaultEntitlementCreatedAt,
  int trialDays = 7,
}) {
  if (!isFreeUserTokenTier(session)) return false;

  if (session.remainingTokens != null && session.remainingTokens! <= 0) {
    return true;
  }

  if (televaultEntitlementCreatedAt != null && televaultEntitlementCreatedAt.isNotEmpty) {
    final registeredAt = DateTime.tryParse(televaultEntitlementCreatedAt);
    if (registeredAt != null) {
      final age = DateTime.now().difference(registeredAt.toLocal());
      if (age.inDays >= trialDays) return true;
    }
  }

  return false;
}
