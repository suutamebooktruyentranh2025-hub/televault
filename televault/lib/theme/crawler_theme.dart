import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Material 3 — đồng bộ với crawler_mobile / desktop crawler.
final class CrawlerTheme {
  CrawlerTheme._();

  static ThemeData light() {
    const ColorScheme colorScheme = ColorScheme(
      brightness: Brightness.light,
      primary: Color(0xFF5A3799),
      onPrimary: Color(0xFFFFFFFF),
      primaryContainer: Color(0xFFE8DEFF),
      onPrimaryContainer: Color(0xFF21005D),
      secondary: Color(0xFF4A4458),
      onSecondary: Color(0xFFFFFFFF),
      secondaryContainer: Color(0xFFDAE2F7),
      onSecondaryContainer: Color(0xFF1E192B),
      tertiary: Color(0xFF7F5260),
      onTertiary: Color(0xFFFFFFFF),
      error: Color(0xFFB3261E),
      onError: Color(0xFFFFFFFF),
      surface: Color(0xFFFAFAFA),
      onSurface: Color(0xFF1C1B1F),
      onSurfaceVariant: Color(0xFF49454F),
      outline: Color(0xFF79747E),
      outlineVariant: Color(0xFFCAC4D0),
      surfaceContainerHighest: Color(0xFFE6E0E9),
      surfaceContainerHigh: Color(0xFFE6E0E9),
      surfaceContainer: Color(0xFFECE7F0),
      surfaceContainerLow: Color(0xFFF7F2FA),
      surfaceContainerLowest: Color(0xFFFAFAFA),
      inverseSurface: Color(0xFF313033),
      onInverseSurface: Color(0xFFF4EFF4),
      inversePrimary: Color(0xFFCDBDFF),
      shadow: Color(0xFF000000),
      scrim: Color(0xFF000000),
    );

    final TextTheme baseText = ThemeData(brightness: Brightness.light).textTheme;
    final TextTheme textTheme = GoogleFonts.interTextTheme(baseText).apply(
      bodyColor: colorScheme.onSurface,
      displayColor: colorScheme.onSurface,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colorScheme.surface,
      textTheme: textTheme,
      dividerColor: colorScheme.outlineVariant.withValues(alpha: 0.5),
      appBarTheme: AppBarTheme(
        backgroundColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      cardTheme: CardThemeData(
        color: colorScheme.surfaceContainerLow,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          elevation: 3,
          shadowColor: const Color(0xFF5A3799).withValues(alpha: 0.35),
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
          shape: const StadiumBorder(),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: colorScheme.primary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerHighest,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.primary, width: 1.5),
        ),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  static ThemeData dark() {
    const ColorScheme colorScheme = ColorScheme(
      brightness: Brightness.dark,
      primary: Color(0xFFCDBDFF),
      onPrimary: Color(0xFF370096),
      primaryContainer: Color(0xFF8054FF),
      onPrimaryContainer: Color(0xFFFFFFFF),
      secondary: Color(0xFFADC8F2),
      onSecondary: Color(0xFF143153),
      secondaryContainer: Color(0xFF2D486B),
      onSecondaryContainer: Color(0xFF9CB7DF),
      tertiary: Color(0xFFFFB689),
      onTertiary: Color(0xFF512300),
      error: Color(0xFFFFB4AB),
      onError: Color(0xFF690005),
      surface: Color(0xFF131313),
      onSurface: Color(0xFFE5E2E1),
      onSurfaceVariant: Color(0xFFC0C7D4),
      outline: Color(0xFF8A919E),
      outlineVariant: Color(0xFF404752),
      surfaceContainerHighest: Color(0xFF353535),
      surfaceContainerHigh: Color(0xFF2A2A2A),
      surfaceContainer: Color(0xFF202020),
      surfaceContainerLow: Color(0xFF1B1B1C),
      surfaceContainerLowest: Color(0xFF0E0E0E),
      inverseSurface: Color(0xFFE5E2E1),
      onInverseSurface: Color(0xFF303030),
      inversePrimary: Color(0xFF6833EA),
      shadow: Color(0xFF000000),
      scrim: Color(0xFF000000),
    );

    final TextTheme baseText = ThemeData(brightness: Brightness.dark).textTheme;
    final TextTheme textTheme = GoogleFonts.interTextTheme(baseText).apply(
      bodyColor: colorScheme.onSurface,
      displayColor: colorScheme.onSurface,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colorScheme.surface,
      textTheme: textTheme,
      dividerColor: colorScheme.outlineVariant.withValues(alpha: 0.35),
      appBarTheme: AppBarTheme(
        backgroundColor: colorScheme.surface,
        foregroundColor: colorScheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      cardTheme: CardThemeData(
        color: colorScheme.surfaceContainer,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: colorScheme.primary),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerHigh,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: colorScheme.primary, width: 1.5),
        ),
      ),
      listTileTheme: ListTileThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
