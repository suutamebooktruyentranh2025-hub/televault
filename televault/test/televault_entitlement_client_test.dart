import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:televault/services/supabase/televault_entitlement_client.dart';

void main() {
  test('resolveEntitlement sends bearer token and parses televault tier', () async {
    String? authHeader;
    final client = TelevaultEntitlementClient(
      httpClient: MockClient((request) async {
        authHeader = request.headers['Authorization'];
        return http.Response(
          '{"ok":true,"entitlementSource":"televault","email":"user@example.com","televaultTier":"Free","televaultImpliedFree":true,"remainingTokens":100}',
          200,
        );
      }),
    );

    final entitlement = await client.resolveEntitlement(accessToken: 'jwt-token');

    expect(authHeader, 'Bearer jwt-token');
    expect(entitlement.email, 'user@example.com');
    expect(entitlement.televaultTierRaw, 'Free');
    expect(entitlement.remainingTokens, 100);
    client.dispose();
  });

  test('resolveEntitlement rejects crawler-shaped profile response', () async {
    final client = TelevaultEntitlementClient(
      httpClient: MockClient((_) async => http.Response(
            '{"ok":true,"email":"user@example.com","userType":"Member","impliedSupabaseFree":false,"remainingTokens":10}',
            200,
          )),
    );

    expect(
      () => client.resolveEntitlement(accessToken: 'jwt-token'),
      throwsA(isA<TelevaultEntitlementException>()),
    );
    client.dispose();
  });

  test('resolveEntitlement throws on HTTP error', () async {
    final client = TelevaultEntitlementClient(
      httpClient: MockClient((_) async => http.Response('{"error":"bad"}', 500)),
    );

    expect(
      () => client.resolveEntitlement(accessToken: 'jwt-token'),
      throwsA(isA<TelevaultEntitlementException>()),
    );
    client.dispose();
  });
}
