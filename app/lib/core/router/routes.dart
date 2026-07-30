/// Константы маршрутов приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 4.47
///
/// Использование: context.go(Routes.home) или context.push(Routes.book('123'))
class Routes {
  Routes._();

  // — Онбординг и Auth —
  static const String onboarding = '/onboarding';
  static const String login = '/login';
  static const String emailLogin = '/login/email';
  static const String register = '/register';
  static const String forgotPassword = '/forgot-password';
  static const String survey = '/survey';
  static const String aiConsent = '/ai-consent';
  static const String pushConsent = '/push-consent';

  // — Главные табы (ShellRoute) —
  static const String home = '/home';
  static const String catalog = '/catalog';
  static const String club = '/club';
  static const String profile = '/profile';

  // — Экраны из профиля —
  static const String diary = '/diary';
  static const String editProfile = '/edit-profile';
  static const String myPurchases = '/my-purchases';
  static const String myProgress = '/my-progress';
  static const String manageSub = '/manage-sub';
  static const String deleteAccount = '/delete-account';
  static const String notificationSettings = '/notification-settings';
  static const String support = '/support';

  /// Заблокированные участницы (Фаза 6, A1). Единственный способ снять
  /// блокировку — Apple требует, чтобы она была обратимой.
  static const String blockedUsers = '/blocked-users';

  // — Дневник (Фаза 5) —

  /// Экран анализа цитаты (4.25). Открывается из дневника.
  static String analysis(String quoteId) => '/analysis/$quoteId';
  static const String analysisPath = '/analysis/:quoteId';

  /// Еженедельный отчёт (4.26). Открывается из дневника.
  static const String weeklyReport = '/weekly-report';

  /// Ежемесячный отчёт (4.26). Открывается из дневника.
  static const String monthlyReport = '/monthly-report';

  // — Контент —
  static String book(String id) => '/book/$id';
  static const String bookPath = '/book/:id';
  static String player(String bookId) => '/player/$bookId';
  static const String playerPath = '/player/:bookId';
  static String package(String id) => '/package/$id';
  static const String packagePath = '/package/:id';
  static const String search = '/search';
  static const String paywall = '/paywall';
  static const String notifications = '/notifications';
}
