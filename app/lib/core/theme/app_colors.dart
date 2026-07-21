import 'package:flutter/material.dart';

/// Все цвета приложения ЧИТАТЕЛЬ.
///
/// ⚠️ 21.07.2026 — ПАЛИТРА ПЕРЕВЕДЕНА НА БРЕНД САЙТА annabusel.org:
/// белый · чёрный · беж (#E6E3D8) · винный (#750009) · холодный серый (#DDDDDD).
/// Винный подтверждён по странице клуба сайта (тёмно-бордовый, не яркий).
///
/// Имена полей СОХРАНЕНЫ (terracotta/coral/…) НАМЕРЕННО — чтобы не править
/// десятки экранов, которые на них ссылаются. Поменялись только ЗНАЧЕНИЯ:
/// `terracotta` теперь винный, `coral` — светлее винный (для градиента).
///
/// Кофейный тёмный слой (darkCoffee/lightCoffee — чат-закреп, плеер) пока
/// оставлен: по бренду чёрный — акцент/текст, а не крупные плиты, поэтому
/// эти места смягчаются отдельно (беж/белый вместо тёмных плит).
///
/// НИКОГДА не используй хардкод цветов — только через AppColors.
class AppColors {
  AppColors._();

  // ── Основные (акцент — винный) ──
  static const Color terracotta = Color(0xFF750009); // бренд: винный акцент
  static const Color coral = Color(0xFF9B1C24);      // светлее винный (градиент)
  static const Color darkCoffee = Color(0xFF1A0E08);
  static const Color lightCoffee = Color(0xFF3A2018);
  static const Color background = Color(0xFFFAFAF7);
  static const Color cardBackground = Color(0xFFFFFFFF);

  // ── Бренд-нейтрали (сайт) ──
  static const Color beige = Color(0xFFE6E3D8);      // подложки, карточки-акценты
  static const Color beigeDeep = Color(0xFFDAD6C7);
  static const Color coldGray = Color(0xFFDDDDDD);   // разделители
  static const Color brandBlack = Color(0xFF141210); // текст, тонкие акценты

  // ── Текст ──
  static const Color textPrimary = Color(0xFF1A1A1A);
  static const Color textSecondary = Color(0xFF666666);
  static const Color textTertiary = Color(0xFF7A6E62);
  static const Color textPlaceholder = Color(0xFF757575);
  static const Color textMetadata = Color(0xFFC0B8B0);

  // ── Семантические ──
  static const Color success = Color(0xFF2D7F5E);
  static const Color successLight = Color(0xFF2D9F6E);
  static const Color error = Color(0xFFDC3545);
  static const Color purple = Color(0xFF7B61FF);
  static const Color gold = Color(0xFFFFB800);

  // ── Фоновые поверхности ──
  static const Color surfaceLight = Color(0xFFF5F3EF);
  static const Color surfaceMedium = Color(0xFFF0EDE8);
  static const Color border = Color(0xFFE8E5E0);

  // ── Градиенты (используются в обложках, плеере, клубе) ──
  static const LinearGradient coffeeGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [darkCoffee, lightCoffee],
  );

  // Винный градиент (имя сохранено). Цвета — винный → светлее винный.
  static const LinearGradient terracottaGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [terracotta, coral],
  );

  static const LinearGradient successGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [successLight, Color(0xFF4CC98A)],
  );

  // ── Тени (из прототипа) ──
  static List<BoxShadow> get cardShadow => [
    const BoxShadow(
      color: Color(0x0A000000),
      blurRadius: 4,
      offset: Offset(0, 1),
    ),
    const BoxShadow(
      color: Color(0x08000000),
      blurRadius: 0,
      spreadRadius: 1,
    ),
  ];

  // Тень кнопки — винная (была терракотовая).
  static List<BoxShadow> get buttonShadow => [
    const BoxShadow(
      color: Color(0x33750009),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  static List<BoxShadow> get dangerButtonShadow => [
    const BoxShadow(
      color: Color(0x26DC3545),
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];
}
