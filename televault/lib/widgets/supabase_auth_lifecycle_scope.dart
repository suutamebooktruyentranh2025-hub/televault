import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';

/// Restores Supabase session on resume and shows TeleVault free-trial expiry dialog.
final class SupabaseAuthLifecycleScope extends StatefulWidget {
  const SupabaseAuthLifecycleScope({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  State<SupabaseAuthLifecycleScope> createState() =>
      _SupabaseAuthLifecycleScopeState();
}

final class _SupabaseAuthLifecycleScopeState extends State<SupabaseAuthLifecycleScope>
    with WidgetsBindingObserver {
  bool _dialogShowing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowTrialExpiredDialog());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(context.read<SessionProvider>().supabaseAuth.refreshSessionOnResume());
    }
  }

  void _maybeShowTrialExpiredDialog() {
    if (!mounted || _dialogShowing) return;
    final session = context.read<SessionProvider>();
    if (!session.supabaseAuth.freeUserTrialExpiredDialogPending) return;

    _dialogShowing = true;
    session.supabaseAuth.clearFreeUserTrialExpiredDialog();
    unawaited(_showTrialExpiredDialog(session));
  }

  Future<void> _showTrialExpiredDialog(SessionProvider session) async {
    final settings = context.read<AppSettingsProvider>();
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: Text(settings.t('free_trial_expired_title')),
          content: SingleChildScrollView(
            child: Text(settings.t('free_trial_expired_body')),
          ),
          actions: [
            FilledButton(
              onPressed: () async {
                Navigator.of(ctx).pop();
                await session.forceLogoutExpiredTrial();
              },
              child: Text(settings.t('free_trial_expired_confirm')),
            ),
          ],
        ),
      ),
    );
    if (mounted) {
      _dialogShowing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<SessionProvider>();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowTrialExpiredDialog());
    return widget.child;
  }
}
