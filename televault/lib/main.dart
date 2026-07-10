import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config/app_config.dart';
import 'providers/app_settings_provider.dart';
import 'providers/session_provider.dart';
import 'screens/auth_screen.dart';
import 'screens/home_shell.dart';
import 'screens/supabase_auth_screen.dart';
import 'screens/telegram_api_setup_screen.dart';
import 'settings/app_settings.dart';
import 'services/macos_window_theme.dart';
import 'services/supabase/supabase_session_local_storage.dart';
import 'theme/crawler_theme.dart';
import 'widgets/supabase_auth_lifecycle_scope.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (AppConfig.hasSupabaseCredentials) {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      anonKey: AppConfig.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
        autoRefreshToken: false,
        localStorage: supabaseSessionLocalStorage,
      ),
    );
  }
  final settings = AppSettingsProvider();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        ChangeNotifierProvider(
          create: (_) => SessionProvider(onSettingsReady: settings.attachDb)..start(),
        ),
      ],
      child: const TeleVaultApp(),
    ),
  );
}

class TeleVaultApp extends StatelessWidget {
  const TeleVaultApp({super.key});

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettingsProvider>();
    return SupabaseAuthLifecycleScope(
      child: MaterialApp(
        title: settings.t('app_name'),
        theme: CrawlerTheme.light(),
        darkTheme: CrawlerTheme.dark(),
        themeMode: settings.themePreference.themeMode,
        builder: (context, child) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            MacosWindowTheme.sync(Theme.of(context).brightness);
          });
          return child ?? const SizedBox.shrink();
        },
        home: Consumer<SessionProvider>(
          builder: (context, s, _) => switch (s.phase) {
            SessionPhase.booting || SessionPhase.telegramBooting => const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              ),
            SessionPhase.supabaseAuth => const SupabaseAuthScreen(),
            SessionPhase.telegramApiSetup => const TelegramApiSetupScreen(),
            SessionPhase.auth when s.bootError != null => Scaffold(
                body: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.error_outline, size: 48, color: Colors.red),
                      const SizedBox(height: 16),
                      Text(s.bootError!, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      Text(settings.t('tdlib_error_hint'), textAlign: TextAlign.center),
                    ]),
                  ),
                ),
              ),
            SessionPhase.auth => AuthScreen(
                state: s.authState,
                errorText: s.syncError ?? s.authError,
                onPhone: s.submitPhone,
                onCode: s.submitCode,
                onPassword: s.submitPassword,
              ),
            SessionPhase.syncing => Scaffold(
                body: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text('${settings.t('syncing')} ${s.scannedCount} ${settings.t('sync_items')}'),
                ]))),
            SessionPhase.ready => const HomeShell(),
          },
        ),
      ),
    );
  }
}
