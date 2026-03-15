/// Отступы и скругления приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 5.3
class AppSpacing {
  AppSpacing._();

  // ── Padding экрана ──
  static const double screenPadding = 20.0;
  static const double authScreenPadding = 28.0;

  // ── Скругления ──
  static const double radiusCard = 16.0;
  static const double radiusButton = 14.0;
  static const double radiusChip = 20.0;
  static const double radiusInput = 12.0;
  static const double radiusAvatar = 100.0; // 50% = круг

  // ── Промежутки ──
  static const double cardGap = 8.0;
  static const double cardGapLarge = 10.0;

  // ── Tap target (Apple HIG) ──
  static const double minTapTarget = 44.0;
}
