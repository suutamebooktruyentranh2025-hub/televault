/// Supabase + OAuth redirect (cùng project với crawler).
final class AppConfig {
  AppConfig._();

  /// Same whitelist form as crawler / crawler_mobile.
  static final Uri whitelistRegisterFormUri =
      Uri.parse('https://forms.gle/nyy47Fi5FQESaHyU7');

  static const int freeUserTokenMax = 100;

  static const String oauthRedirectUrl = 'com.televault.televault://oauth2callback';
  static const String oauthRedirectScheme = 'com.televault.televault';
  static const String oauthRedirectHost = 'oauth2callback';

  static const String _embeddedSupabaseUrl =
      'https://eurlodsgnskbqjpxtcsh.supabase.co';
  static const String _embeddedAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1cmxvZHNnbnNrYnFqcHh0Y3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NDM2MzUsImV4cCI6MjA5MzAxOTYzNX0.cPWu5I1Dw2JhPl5XLgnDv0erJZ0cMjaG1KZLSiXIIPQ';

  static String get supabaseUrl {
    const fromEnv = String.fromEnvironment('SUPABASE_URL', defaultValue: '');
    final trimmed = fromEnv.trim();
    if (trimmed.isNotEmpty) return trimmed.replaceAll(RegExp(r'/+$'), '');
    return _embeddedSupabaseUrl.replaceAll(RegExp(r'/+$'), '');
  }

  static String get supabaseAnonKey {
    const fromEnv = String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
    final trimmed = fromEnv.trim();
    if (trimmed.isNotEmpty) return trimmed;
    return _embeddedAnonKey;
  }

  static bool get hasSupabaseCredentials =>
      supabaseUrl.trim().isNotEmpty && supabaseAnonKey.trim().isNotEmpty;

  /// TeleVault entitlement (separate from crawler `resolve-user-profile`).
  static Uri resolveTelevaultAccessFunctionUri() {
    return Uri.parse('$supabaseUrl/functions/v1/resolve-televault-access');
  }

  static Uri consumeTelevaultCreditFunctionUri() {
    return Uri.parse('$supabaseUrl/functions/v1/consume-televault-credit');
  }
}
