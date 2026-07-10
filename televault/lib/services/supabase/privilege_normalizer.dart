/// TeleVault tier labels from `televault_entitlements.tier`.
String normalizeTelevaultTier(String rawInput) {
  final normalized = rawInput.trim().toLowerCase();
  if (normalized.isEmpty) return 'Free';
  if (normalized == 'admin') return 'Admin';
  if (normalized == 'super member') return 'Super Member';
  if (normalized == 'premium member') return 'Premium Member';
  if (normalized == 'member') return 'Member';
  if (normalized == 'free') return 'Free';
  return 'Free';
}

String televaultAccountBadgeLabel(
  String televaultTier,
  bool isFreeTier,
  String Function(String) t,
) {
  switch (televaultTier.trim().toLowerCase()) {
    case 'admin':
      return t('account_admin');
    case 'premium member':
      return t('account_premium');
    case 'super member':
      return t('account_super');
    case 'member':
      return t('account_member');
    case 'free':
      return t('account_free');
    default:
      return televaultTier.isNotEmpty ? televaultTier : t('account_free');
  }
}
