import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../providers/app_settings_provider.dart';
import '../providers/session_provider.dart';

class TelegramApiSetupScreen extends StatefulWidget {
  const TelegramApiSetupScreen({super.key});

  @override
  State<TelegramApiSetupScreen> createState() => _TelegramApiSetupScreenState();
}

class _TelegramApiSetupScreenState extends State<TelegramApiSetupScreen> {
  final _apiIdController = TextEditingController();
  final _apiHashController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _apiIdController.dispose();
    _apiHashController.dispose();
    super.dispose();
  }

  Future<void> _openMyTelegramOrg() async {
    final uri = Uri.parse('https://my.telegram.org/apps');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      final apiId = int.tryParse(_apiIdController.text.trim()) ?? 0;
      await context.read<SessionProvider>().submitTelegramApiCredentials(
            apiId: apiId,
            apiHash: _apiHashController.text.trim(),
          );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final s = context.watch<AppSettingsProvider>().labels;
    final theme = Theme.of(context);

    final errorKey = session.telegramApiError;
    final errorText = errorKey == null ? null : (s[errorKey] ?? errorKey);

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
                Icon(Icons.api_outlined, size: 64, color: theme.colorScheme.primary),
                const SizedBox(height: 16),
                Text(
                  s['telegram_api_title']!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Text(
                  s['telegram_api_body']!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                ),
                if (session.supabaseEmail != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    session.supabaseEmail!,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.center,
                  child: TextButton(
                    onPressed: _openMyTelegramOrg,
                    child: Text(s['telegram_api_link']!),
                  ),
                ),
                const SizedBox(height: 16),
                Text(s['telegram_api_id_label']!, style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                TextField(
                  controller: _apiIdController,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(
                    hintText: s['telegram_api_id_hint']!,
                    border: const OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 16),
                Text(s['telegram_api_hash_label']!, style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                TextField(
                  controller: _apiHashController,
                  decoration: InputDecoration(
                    hintText: s['telegram_api_hash_hint']!,
                    errorText: errorText,
                    border: const OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: theme.colorScheme.onPrimary,
                          ),
                        )
                      : Text(s['auth_continue']!),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
