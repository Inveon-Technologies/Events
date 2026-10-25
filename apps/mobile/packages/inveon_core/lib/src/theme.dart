import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// "Electric Discovery" design tokens from the Stitch designs
/// (stitch_inveon_event_booking_app/electric_discovery/DESIGN.md).
class InveonColors {
  static const primary = Color(0xFF0066FF);
  static const primaryPressed = Color(0xFF0052CC);
  static const primaryDeep = Color(0xFF0050CB);
  static const secondary = Color(0xFFFF7A00);
  static const amberStart = Color(0xFFFF9900);
  static const amberEnd = Color(0xFFFF5E00);
  static const tertiary = Color(0xFF00D2FF);
  static const midnight = Color(0xFF0B132B);
  static const ink = Color(0xFF131A33);
  static const slate = Color(0xFF475569);
  static const muted = Color(0xFF94A3B8);
  static const canvas = Color(0xFFF8FAFC);
  static const surface = Colors.white;
  static const surfaceTint = Color(0xFFF3F3FF);
  static const outline = Color(0x1A0B132B);
  static const success = Color(0xFF16A34A);
  static const successBg = Color(0xFFE8F8EE);
  static const urgencyBg = Color(0xFFFFF3E6);
  static const error = Color(0xFFBA1A1A);
  static const errorBg = Color(0xFFFFDAD6);

  static const amberGradient = LinearGradient(colors: [amberStart, secondary]);
  static const electricGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryDeep, primary, tertiary],
    stops: [0, 0.6, 1],
  );
  static const midnightGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0B132B), Color(0xFF13234F)],
  );
}

class InveonShadows {
  static const card = [BoxShadow(color: Color(0x0A0B132B), blurRadius: 16, offset: Offset(0, 4), spreadRadius: -2)];
  static const raised = [
    BoxShadow(color: Color(0x140066FF), blurRadius: 25, offset: Offset(0, 10), spreadRadius: -4),
    BoxShadow(color: Color(0x0A0B132B), blurRadius: 10, offset: Offset(0, 4), spreadRadius: -2),
  ];
  static const blueGlow = [BoxShadow(color: Color(0x4D0066FF), blurRadius: 16, offset: Offset(0, 4))];
  static const amberGlow = [BoxShadow(color: Color(0x40FF7A00), blurRadius: 14, offset: Offset(0, 4))];
}

class InveonRadius {
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
}

ThemeData buildInveonTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: InveonColors.primary,
      primary: InveonColors.primary,
      secondary: InveonColors.secondary,
      tertiary: InveonColors.tertiary,
      surface: InveonColors.surface,
      error: InveonColors.error,
    ),
    scaffoldBackgroundColor: InveonColors.canvas,
  );
  final text = GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(bodyColor: InveonColors.ink, displayColor: InveonColors.midnight);
  return base.copyWith(
    textTheme: text.copyWith(
      displaySmall: text.displaySmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.8, fontSize: 28),
      headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5, fontSize: 24),
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3, fontSize: 20),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, fontSize: 18),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600, fontSize: 16),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600, letterSpacing: 0.1),
      labelSmall: text.labelSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: 0.4, fontSize: 10.5),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: InveonColors.canvas,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      foregroundColor: InveonColors.midnight,
      titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: InveonColors.midnight),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: InveonColors.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(InveonRadius.lg)),
        textStyle: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: InveonColors.midnight,
        minimumSize: const Size.fromHeight(52),
        side: const BorderSide(color: Color(0x260B132B), width: 1.5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(InveonRadius.lg)),
        textStyle: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: InveonColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(InveonRadius.md),
        borderSide: const BorderSide(color: Color(0x1F0B132B)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(InveonRadius.md),
        borderSide: const BorderSide(color: Color(0x1F0B132B)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(InveonRadius.md),
        borderSide: const BorderSide(color: InveonColors.primary, width: 2),
      ),
      hintStyle: const TextStyle(color: InveonColors.muted),
    ),
    chipTheme: base.chipTheme.copyWith(
      shape: const StadiumBorder(),
      side: BorderSide.none,
      backgroundColor: const Color(0x0A0B132B),
      selectedColor: InveonColors.primary,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: InveonColors.midnight,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(InveonRadius.md)),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: FadeForwardsPageTransitionsBuilder(), TargetPlatform.iOS: CupertinoPageTransitionsBuilder()},
    ),
  );
}
