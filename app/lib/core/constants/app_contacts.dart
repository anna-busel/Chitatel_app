/// Контакты и внешние ссылки приложения.
///
/// Почта поддержки — рабочий ящик support.chitatel@gmail.com (17.08.2026).
/// Письма из приложения и запросы по данным приходят именно туда,
/// Apple проверяет живой канал связи.
///
/// Зачем отдельный файл: раньше пришлось бы править почту в нескольких экранах.
/// Теперь на стороне приложения она правится РОВНО ЗДЕСЬ. На сервере адрес
/// дополнительно встречается в юридических страницах
/// (server/public/legal/privacy.html, terms.html и support.html) — их правим
/// отдельно, там он внутри юридических формулировок.
///
/// ⚠️ Смена почты требует ПЕРЕСБОРКИ приложения — константа зашита в билд.
class AppContacts {
  AppContacts._();

  /// Почта поддержки (экран 4.40 + юридические страницы).
  static const String supportEmail = 'support.chitatel@gmail.com';

  /// Политика конфиденциальности. Указывается в App Store Connect
  /// (Privacy Policy URL) и открывается с paywall и экрана поддержки.
  static const String privacyUrl = 'https://api.chitatel.app/legal/privacy';

  /// Условия использования (EULA). Ссылка обязательна на paywall.
  static const String termsUrl = 'https://api.chitatel.app/legal/terms';

  /// Страница поддержки. Указывается в App Store Connect (Support URL) —
  /// Apple проверяет, что она открывается.
  static const String supportUrl = 'https://api.chitatel.app/legal/support';
}
