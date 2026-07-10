import 'package:flutter_test/flutter_test.dart';
import 'package:televault/models/supabase_session_record.dart';
import 'package:televault/services/supabase/free_user_tier.dart';

SupabaseSessionRecord _freeSession({int? remainingTokens, String? createdAt}) {
  return SupabaseSessionRecord(
    email: 'free@example.com',
    televaultTier: 'Free',
    televaultImpliedFree: true,
    accessToken: 'tok',
    refreshToken: 'ref',
    expiresAtEpochMs: DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
    lastValidatedEpochMs: DateTime.now().millisecondsSinceEpoch,
    savedAtIso: DateTime.now().toUtc().toIso8601String(),
    remainingTokens: remainingTokens,
    televaultEntitlementCreatedAt: createdAt,
  );
}

void main() {
  test('televault member tier is not free tier', () {
    final session = _freeSession(remainingTokens: 50).copyWith(televaultTier: 'Member');
    expect(isFreeUserTokenTier(session), isFalse);
  });

  test('legacy session without televault fields needs refresh', () {
    final legacy = SupabaseSessionRecord.fromJson({
      'email': 'legacy@example.com',
      'userType': 'Member',
      'impliedSupabaseFree': false,
      'accessToken': 'tok',
      'refreshToken': 'ref',
      'expiresAt': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch,
      'lastValidated': DateTime.now().millisecondsSinceEpoch,
      'savedAt': DateTime.now().toUtc().toIso8601String(),
    });
    expect(legacy.needsTelevaultEntitlementRefresh, isTrue);
    expect(legacy.televaultTier, isEmpty);
  });

  test('televault trial uses entitlement created_at not crawler auth age', () {
    final televaultCreated = DateTime.now().subtract(const Duration(days: 2)).toUtc().toIso8601String();
    final session = _freeSession(remainingTokens: 50, createdAt: televaultCreated);
    expect(
      isFreeTrialExpired(
        session: session,
        televaultEntitlementCreatedAt: televaultCreated,
      ),
      isFalse,
    );
  });

  test('televault trial expires after 7 days from entitlement created_at', () {
    final televaultCreated = DateTime.now().subtract(const Duration(days: 8)).toUtc().toIso8601String();
    final session = _freeSession(remainingTokens: 50, createdAt: televaultCreated);
    expect(
      isFreeTrialExpired(
        session: session,
        televaultEntitlementCreatedAt: televaultCreated,
      ),
      isTrue,
    );
  });

  test('televault free tier with zero tokens is expired', () {
    final session = _freeSession(remainingTokens: 0);
    expect(isFreeTrialExpired(session: session), isTrue);
  });
}
