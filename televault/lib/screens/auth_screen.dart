import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/app_settings_provider.dart';
import '../services/telegram/auth_service.dart';

class AuthScreen extends StatefulWidget {
  final AuthState state;
  final Future<void> Function(String) onPhone;
  final Future<void> Function(String) onCode;
  final Future<void> Function(String) onPassword;
  final String? errorText;

  const AuthScreen({super.key, required this.state, required this.onPhone,
      required this.onCode, required this.onPassword, this.errorText});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _controller = TextEditingController(text: '+84');
  bool _busy = false;

  @override
  void didUpdateWidget(AuthScreen old) {
    super.didUpdateWidget(old);
    if (old.state != widget.state) {
      _controller.text = widget.state == AuthState.waitPhone ? '+84' : '';
      _busy = false;
    }
  }

  (String, String, bool) _labelsFor(Map<String, String> s) => switch (widget.state) {
        AuthState.waitCode => (s['auth_code_label']!, s['auth_code_hint']!, false),
        AuthState.waitPassword => (s['auth_password_label']!, s['auth_password_hint']!, true),
        _ => (s['auth_phone_label']!, s['auth_phone_hint']!, false),
      };

  Future<void> _submit() async {
    setState(() => _busy = true);
    final text = _controller.text.trim();
    try {
      switch (widget.state) {
        case AuthState.waitCode:
          await widget.onCode(text);
        case AuthState.waitPassword:
          await widget.onPassword(text);
        default:
          await widget.onPhone(text);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettingsProvider>();
    final s = settings.labels;
    final (label, hint, obscure) = _labelsFor(s);
    final theme = Theme.of(context);
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 380),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.inventory_2_outlined, size: 64, color: theme.colorScheme.primary),
                const SizedBox(height: 12),
                Text(s['app_name']!, textAlign: TextAlign.center,
                    style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(s['app_subtitle']!, textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: 24),
                Text(label, style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                TextField(
                  controller: _controller,
                  obscureText: obscure,
                  autofocus: true,
                  decoration: InputDecoration(hintText: hint, errorText: widget.errorText,
                      border: const OutlineInputBorder()),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
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
