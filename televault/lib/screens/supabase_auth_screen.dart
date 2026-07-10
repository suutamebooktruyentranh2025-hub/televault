import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';

class SupabaseAuthScreen extends StatelessWidget {
  const SupabaseAuthScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final supabase = session.supabaseAuth;
    final s = context.watch<AppSettingsProvider>().labels;
    final theme = Theme.of(context);

    final errorKey = supabase.errorMessage ?? session.bootError;
    final errorText = errorKey == null
        ? null
        : (s[errorKey] ?? errorKey);

    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.lock_outline_rounded, size: 64, color: theme.colorScheme.primary),
                const SizedBox(height: 16),
                Text(
                  s['supabase_auth_title']!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Text(
                  s['supabase_auth_body']!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 24),
                if (errorText != null) ...[
                  Text(
                    errorText,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                  ),
                  const SizedBox(height: 16),
                ],
                FilledButton.icon(
                  onPressed: supabase.signingIn ? null : () => session.signInWithGoogle(),
                  icon: supabase.signingIn
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: theme.colorScheme.onPrimary,
                          ),
                        )
                      : const Icon(Icons.login_rounded),
                  label: Text(s['supabase_auth_button']!),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: const StadiumBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
