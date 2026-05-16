/// Все URL эндпоинтов API.
/// Источник: MASTER.md секция 7.4
///
/// Базовый URL меняется при деплое на VPS.
/// Для локальной разработки: http://localhost:3000/api
class ApiEndpoints {
  ApiEndpoints._();

  // Базовый URL — пока localhost, позже https://api.chitatel.app
  static const String baseUrl = 'http://localhost:3000/api';

  // Базовый URL без /api — для Socket.io (он подключается к корню).
  static const String socketBaseUrl = 'http://localhost:3000';

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

  // — Клуб (задача 4.5, бэкенд 4.1-4.4) —

  /// GET /api/club/list — список клубов которые юзер может открыть.
  /// Возвращает { archive[], current[], future[] } для построения dropdown'а.
  /// Каждый клуб содержит поле `relation` ('archive'/'current'/'future').
  static const String clubList = '/club/list';

  /// GET /api/club/current — текущий активный клуб месяца + книга + access.
  static const String clubCurrent = '/club/current';

  /// GET /api/club/:clubMonthId — конкретный клуб (для архивных или будущих).
  static String clubById(String clubMonthId) => '/club/$clubMonthId';

  /// GET /api/club/:clubMonthId/chat — история чата с пагинацией.
  /// Query: limit (1-50, default 20), before (ISO date, опц.).
  /// Возвращает messages[] DESC + hasMore.
  ///
  /// POST /api/club/:clubMonthId/chat — отправить text/image/voice сообщение.
  /// Body: { type, text?, imageUrl?, voiceUrl?, voiceDurationSec?, voiceWaveform?, replyToId?, mentions? }
  static String clubChat(String clubMonthId) => '/club/$clubMonthId/chat';

  /// POST /api/club/:clubMonthId/chat/image — загрузить картинку в чат.
  /// multipart/form-data: поле "image" (файл), опц. "text" (caption), "replyToId".
  /// Возвращает созданное сообщение type=image с signed imageUrl (TTL 1 час).
  static String clubChatImage(String clubMonthId) =>
      '/club/$clubMonthId/chat/image';

  /// POST /api/club/chat/:messageId/report — жалоба на сообщение.
  /// Body: { reason, comment? }
  /// Reason: spam/inappropriate/offensive/copyright/other.
  static String clubChatReport(String messageId) => '/club/chat/$messageId/report';

  /// GET /api/club/:clubMonthId/qa — список вопросов клуба.
  /// POST /api/club/:clubMonthId/qa — задать вопрос Анне.
  /// Body: { questionText } (5-500 символов)
  static String clubQa(String clubMonthId) => '/club/$clubMonthId/qa';

  // — Health —
  static const String health = '/health';
}
