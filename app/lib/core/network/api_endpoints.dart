/// Все URL эндпоинтов API.
/// Источник: MASTER.md секция 7.4
///
/// Базовый URL меняется при деплое на VPS.
/// Для локальной разработки: http://localhost:3000/api
class ApiEndpoints {
  ApiEndpoints._();

  // Базовый URL — пока localhost, позже https://api.chitatel.app
  static const String baseUrl = 'http://localhost:3000/api';

  // — Auth —
  static const String register = '/auth/register';
  static const String login = '/auth/login';
  static const String google = '/auth/google';
  static const String apple = '/auth/apple';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';
  static const String forgotPassword = '/auth/forgot-password';
  static const String resetPassword = '/auth/reset-password';
  static const String deleteAccount = '/auth/account';

  // — Profile —
  static const String profile = '/profile';
  static const String profileAvatar = '/profile/avatar';
  static const String profilePassword = '/profile/password';
  static const String profilePushSettings = '/profile/push-settings';
  static const String profileAiConsent = '/profile/ai-consent';
  static const String profileSurvey = '/profile/survey';
  static const String profileReferral = '/profile/referral';

  // — Home & Catalog —
  static const String home = '/home';
  static const String books = '/books';
  static const String booksFeatured = '/books/featured';
  static const String booksSearch = '/books/search';
  static const String packages = '/packages';

  /// GET /api/books/:id — детальная информация о книге.
  static String bookById(String id) => '/books/$id';

  /// GET /api/books/:id/audio/:partNumber — signed URL для аудио (задача 2.3/2.7).
  /// Ответ: { audioUrl, duration, partNumber, title, isPreview }
  /// TTL signed URL — 1 час (AUDIO_URL_TTL_SECONDS).
  static String bookAudio(String bookId, int partNumber) =>
      '/books/$bookId/audio/$partNumber';

  // — Progress (задача 2.3 сервер / задача 2.7 клиент) —

  /// POST /api/progress — сохранить прогресс прослушивания.
  /// Body: { bookId, currentPartNumber, positionSeconds, markPartCompleted? }
  static const String progress = '/progress';

  /// GET /api/progress/:bookId — получить прогресс по конкретной книге.
  /// Если прогресса нет — возвращает defaults (часть 1, позиция 0).
  static String progressByBook(String bookId) => '/progress/$bookId';

  // — Health —
  static const String health = '/health';
}
