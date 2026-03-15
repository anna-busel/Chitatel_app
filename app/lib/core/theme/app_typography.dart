import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Все текстовые стили приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 5.2
/// Заголовки — Playfair Display (serif).
/// Всё остальное — системный шрифт (SF Pro на iOS, Roboto на Android).
class AppTypography {
  AppTypography._();

  // ── Serif (Playfair Display) — заголовки ──

  /// 30px, weight 700 — онбординг слайды
  static TextStyle get serifHeadline => GoogleFonts.playfairDisplay(
    fontSize: 30,
    fontWeight: FontWeight.w700,
    height: 1.2,
    color: AppColors.textPrimary,
  );

  /// 26px, weight 800 — цена годового тарифа
  static TextStyle get serifPrice => GoogleFonts.playfairDisplay(
    fontSize: 26,
    fontWeight: FontWeight.w800,
    color: AppColors.textPrimary,
  );

  /// 23px, weight 700 — названия книг
  static TextStyle get serifBookTitle => GoogleFonts.playfairDisplay(
    fontSize: 23,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  /// 22px, weight 700 — заголовки секций (serif)
  static TextStyle get serifSectionTitle => GoogleFonts.playfairDisplay(
    fontSize: 22,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  /// 21px, weight 700 — названия в плеере/клубе
  static TextStyle get serifPlayerTitle => GoogleFonts.playfairDisplay(
    fontSize: 21,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  /// 19px, weight 600, letterSpacing 4 — логотип ЧИТАТЕЛЬ
  static TextStyle get serifLogo => GoogleFonts.playfairDisplay(
    fontSize: 19,
    fontWeight: FontWeight.w600,
    letterSpacing: 4,
    color: AppColors.textPrimary,
  );

  /// 17px, weight 700, italic — цитаты
  static TextStyle get serifQuote => GoogleFonts.playfairDisplay(
    fontSize: 17,
    fontWeight: FontWeight.w700,
    fontStyle: FontStyle.italic,
    height: 1.55,
    color: AppColors.textPrimary,
  );

  // ── Sans-serif (системный) — основной текст ──

  /// 20px, weight 700 — заголовки экранов
  static const TextStyle screenTitle = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  /// 17px, weight 700 — кнопки, средние заголовки
  static const TextStyle button = TextStyle(
    fontSize: 17,
    fontWeight: FontWeight.w700,
    color: Colors.white,
  );

  /// 16px, weight 700 — средние заголовки (SH)
  static const TextStyle sectionHeader = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  /// 15px, weight 400-600 — body text увеличенный, варианты опроса
  static const TextStyle bodyLarge = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w400,
    height: 1.6,
    color: AppColors.textPrimary,
  );

  static const TextStyle bodyLargeMedium = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  /// 14px, weight 400-600 — основной текст, поля ввода, ссылки
  static const TextStyle body = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.5,
    color: AppColors.textPrimary,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  static const TextStyle bodyBold = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );

  /// 13px, weight 400-600 — описания, метаданные, навигационные ссылки
  static const TextStyle caption = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
  );

  static const TextStyle captionMedium = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.textSecondary,
  );

  /// 12px, weight 400-600 — подписи, мелкий текст, tab labels
  static const TextStyle small = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: AppColors.textTertiary,
  );

  static const TextStyle smallMedium = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w600,
    color: AppColors.textTertiary,
  );

  /// 11px, weight 400-700 — юридический текст, секционные заголовки uppercase
  static const TextStyle micro = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: AppColors.textTertiary,
  );

  static const TextStyle microBold = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    color: AppColors.textTertiary,
  );

  /// 10px, weight 700 — бейджи (БЕСПЛАТНО, КУПЛЕНО, НОВОЕ). Только uppercase
  static const TextStyle badge = TextStyle(
    fontSize: 10,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.5,
    color: Colors.white,
  );

  /// 16px, placeholder для Input
  static const TextStyle inputPlaceholder = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w400,
    color: AppColors.textPlaceholder,
  );

  /// 14px, текст ввода
  static const TextStyle inputText = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: AppColors.textPrimary,
  );
}
