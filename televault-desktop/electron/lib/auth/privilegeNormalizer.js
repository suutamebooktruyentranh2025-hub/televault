/** TeleVault tier labels from `televault_entitlements.tier`. */
function normalizeTelevaultTier(rawInput) {
  const normalized = String(rawInput || '').trim().toLowerCase();
  if (!normalized) return 'Free';
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'super member') return 'Super Member';
  if (normalized === 'premium member') return 'Premium Member';
  if (normalized === 'member') return 'Member';
  if (normalized === 'free') return 'Free';
  return 'Free';
}

module.exports = { normalizeTelevaultTier };
