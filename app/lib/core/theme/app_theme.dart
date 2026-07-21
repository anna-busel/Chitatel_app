import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';
import 'app_typography.dart';

/// ThemeData для приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секции 5.1–5.4
class AppTheme {
  AppTheme._();

  static ThemeData get light => ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.background,
    colorScheme: const ColorScheme.light(
      primary: AppColors.terracotta,
      onPrimary: Colors.white,
      secondary: AppColors.coral,
      surface: AppColors.cardBackground,
      error: AppColors.error,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.background,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
      iconTheme: IconThemeData(color: AppColors.terracotta),
      titleTextStyle: AppTypography.screenTitle,
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.background,
      selectedItemColor: AppColors.terracotta,
      unselectedItemColor: AppColors.textPrimary,
      type: BottomNavigationBarType.fixed,
      selectedLabelStyle: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w700,
      ),
      unselectedLabelStyle: TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.w500,
      ),
    ),
    // Разделители — холодный серый (бренд сайта).
    dividerTheme: const DividerThemeData(
      color: AppColors.coldGray,
      thickness: 1,
      space: 0,
    ),
    textTheme: const TextTheme(
      headlineLarge: AppTypography.screenTitle,
      titleMedium: AppTypography.sectionHeader,
      bodyLarge: AppTypography.bodyLarge,
      bodyMedium: AppTypography.body,
      bodySmall: AppTypography.caption,
      labelSmall: AppTypography.small,
    ),
  );
}
