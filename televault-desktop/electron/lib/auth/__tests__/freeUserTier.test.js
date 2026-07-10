const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isFreeUserTokenTier, isFreeTrialExpired, sessionNeedsTelevaultEntitlementRefresh } =
  require('../freeUserTier');

test('televault member tier is not free tier', () => {
  assert.equal(isFreeUserTokenTier({ televaultTier: 'Member', televaultImpliedFree: false }), false);
});

test('legacy crawler userType in session needs televault refresh', () => {
  assert.equal(
    sessionNeedsTelevaultEntitlementRefresh({ userType: 'Member', sessionSchemaVersion: 1 }),
    true,
  );
});

test('televault trial uses entitlement created_at', () => {
  const televaultCreated = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    isFreeTrialExpired({
      session: { televaultTier: 'Free', televaultImpliedFree: true, remainingTokens: 50 },
      televaultEntitlementCreatedAt: televaultCreated,
    }),
    false,
  );
});

test('televault trial expires after 7 days from entitlement row', () => {
  const televaultCreated = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    isFreeTrialExpired({
      session: { televaultTier: 'Free', televaultImpliedFree: true, remainingTokens: 50 },
      televaultEntitlementCreatedAt: televaultCreated,
    }),
    true,
  );
});

test('televault zero tokens expires regardless of crawler', () => {
  assert.equal(
    isFreeTrialExpired({
      session: { televaultTier: 'Free', televaultImpliedFree: true, remainingTokens: 0 },
    }),
    true,
  );
});
