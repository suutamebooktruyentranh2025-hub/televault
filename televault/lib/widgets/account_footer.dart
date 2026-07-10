import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';
import '../services/supabase/free_user_tier.dart';
import '../services/supabase/privilege_normalizer.dart';

const int _trialDays = 7;
const int _tokenMax = freeUserTokenMax;

class AccountFooter extends StatelessWidget {
  const AccountFooter({super.key, this.onSignOut});

  final VoidCallback? onSignOut;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final settings = context.watch<AppSettingsProvider>();
    final email = session.supabaseEmail;
    if (email == null || email.isEmpty) return const SizedBox.shrink();

    final active = session.supabaseAuth.activeSession;
    final isFree = active != null && isFreeUserTokenTier(active);
    final tokens = active?.remainingTokens ?? _tokenMax;
    final trialDays = _trialDaysRemaining(active?.televaultEntitlementCreatedAt);

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: Theme.of(context).dividerColor),
          borderRadius: BorderRadius.circular(16),
          color: Theme.of(context).colorScheme.surfaceContainerLowest,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: Theme.of(context).colorScheme.primaryContainer,
                    child: Text(
                      email[0].toUpperCase(),
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _EmailLines(email: email),
                        const SizedBox(height: 4),
                        _Badge(
                          label: televaultAccountBadgeLabel(
                            active?.televaultTier ?? '',
                            isFree,
                            settings.t,
                          ),
                          free: isFree,
                          admin: !isFree &&
                              (active?.televaultTier.trim().toLowerCase() == 'admin'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (isFree) ...[
              Divider(height: 1, color: Theme.of(context).dividerColor),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          settings.t('account_upload_tokens'),
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                        ),
                        Text(
                          settings.t('account_tokens_count', {
                            'n': '${tokens.clamp(0, _tokenMax)}',
                            'max': '$_tokenMax',
                          }),
                          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: (tokens.clamp(0, _tokenMax)) / _tokenMax,
                        minHeight: 6,
                        backgroundColor: Theme.of(context).colorScheme.surfaceContainerHighest,
                      ),
                    ),
                    if (trialDays != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        trialDays <= 0
                            ? settings.t('account_trial_last_day')
                            : settings.t('account_trial_days_left', {'n': '$trialDays'}),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: trialDays <= 1
                                  ? Theme.of(context).colorScheme.error
                                  : Theme.of(context).colorScheme.onSurfaceVariant,
                              fontWeight: trialDays <= 1 ? FontWeight.w600 : null,
                            ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            if (onSignOut != null)
              InkWell(
                onTap: onSignOut,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(
                    children: [
                      Icon(Icons.logout, size: 18, color: Theme.of(context).colorScheme.error),
                      const SizedBox(width: 8),
                      Text(
                        settings.t('settings_logout'),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                              fontWeight: FontWeight.w500,
                            ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  int? _trialDaysRemaining(String? createdAt) {
    if (createdAt == null || createdAt.isEmpty) return null;
    final registered = DateTime.tryParse(createdAt);
    if (registered == null) return null;
    final age = DateTime.now().difference(registered.toLocal()).inDays;
    return (_trialDays - age).clamp(0, _trialDays);
  }
}

class _EmailLines extends StatelessWidget {
  const _EmailLines({required this.email});

  final String email;

  @override
  Widget build(BuildContext context) {
    final at = email.indexOf('@');
    final local = at > 0 ? email.substring(0, at) : email;
    return Text(
      local,
      style: Theme.of(context).textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
          ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.free, this.admin = false});

  final String label;
  final bool free;
  final bool admin;

  @override
  Widget build(BuildContext context) {
    final Color bg;
    final Color fg;
    if (free) {
      bg = const Color(0xFFFEF7E0);
      fg = const Color(0xFFB06000);
    } else if (admin) {
      bg = const Color(0xFFFCE8E6);
      fg = const Color(0xFFC5221F);
    } else {
      bg = Theme.of(context).colorScheme.primaryContainer;
      fg = Theme.of(context).colorScheme.primary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}
