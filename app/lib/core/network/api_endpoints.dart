/// Все URL эндпоинтов API.
/// Источник: MASTER.md секция 7.4
///
/// Базовый хост берётся из переменной сборки API_BASE.
/// По умолчанию — прод (https://api.chitatel.app).
/// Для локальной разработки против сервера на маке:
///   flutter run --dart-define=API_BASE=http://localhost:3000
class ApiEndpoints {
  ApiEndpoints._();

  // Базовый хост сервера. По умолчанию — прод. Переопределяется при сборке:
  //   flutter run --dart-define=API_BASE=http://localhost:3000
  static const String _host = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://api.chitatel.app',
  );

  // Базовый URL с /api — для REST-запросов.
  static const String baseUrl = '$_host/api';

  // Базовый URL без /api — для Socket.io (он подключается к корню).
  static const String socketBaseUrl = _host;

  // — Auth —
  static const String register = '/auth/register';
  static const String login = '/auth/login';
  static const String google = '/auth/google';
  static const String apple = '/auth/apple';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';
  static const String forgotPassword = '/auth/forgot-password';
  static const String resetPassword = '/auth/reset-password';

  /// DELETE /api/auth/account — удаление аккаунта (Apple 5.1.1(v), экран 4.34).
  /// Body: { confirm: 'УДАЛИТЬ' }. Аккаунт помечается удалённым, PII стирается,
  /// цитаты/отчёты/прогресс удаляются, сообщения чата анонимизируются.
  static const String deleteAccount = '/auth/account';

  // — Profile —
  static const String profile = '/profile';
  static const String profileAvatar = '/profile/avatar';
  static const String profilePassword = '/profile/password';
  static const String profilePushSettings = '/profile/push-settings';
  static const String profileAiConsent = '/profile/ai-consent';
  static const String profileSurvey = '/profile/survey';
  static const String profileReferral = '/profile/referral';

  // — Пользователи: блокировка и жалобы (Фаза 6, A1 — Apple Guideline 1.2) —

  /// GET /api/users/blocked — список заблокированных мной участников.
  /// Экран «Заблокированные» в профиле (единственный способ разблокировать).
  static const String usersBlocked = '/users/blocked';

  /// POST /api/users/:id/block — заблокировать участника.
  /// DELETE /api/users/:id/block — разблокировать.
  /// Сообщения заблокированного не приходят в чате и не показываются в
  /// превью ответов. Администратора (Анну) заблокировать нельзя.
  static String userBlock(String userId) => '/users/$userId/block';

  /// POST /api/users/:id/report — жалоба на участника целиком.
  /// Body: { reason, comment? }. Жалоба на конкретное сообщение — отдельно,
  /// clubChatReport.
  static String userReport(String userId) => '/users/$userId/report';

  // — Админ (роль admin — аккаунт Анны) —

  /// POST /api/admin/qa/:questionId/answer — ответить на вопрос Q&A.
  /// Body: { answerText } (1..5000). Доступно только с ролью admin.
  /// Используется кнопкой «Ответить» в табе Q&A под аккаунтом Анны —
  /// чтобы отвечать прямо из приложения, а не только из веб-админки.
  static String adminQaAnswer(String questionId) =>
      '/admin/qa/$questionId/answer';

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

  /// GET /api/progress/stats — сводная статистика прослушивания (экран 4.45,
  /// задача 6.2): всего минут, книг начато/завершено, цитат, streak.
  static const String progressStats = '/progress/stats';

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

  /// GET /api/club/:clubMonthId/mentionable — список кого можно упомянуть
  /// через @ (задача 4.9). Сейчас = админы (Анна). Возвращает
  /// { mentionable: [{ id, name, avatarUrl, isAdmin }] }.
  static String clubMentionable(String clubMonthId) =>
      '/club/$clubMonthId/mentionable';

  /// GET /api/club/:clubMonthId/chat — история чата с пагинацией.
  /// Query: limit (1-50, default 20), before (ISO date, опц.).
  /// Возвращает messages[] DESC + hasMore.
  ///
  /// POST /api/club/:clubMonthId/chat — отправить text/image сообщение.
  /// Body: { type, text?, imageUrl?, replyToId?, mentions? }
  static String clubChat(String clubMonthId) => '/club/$clubMonthId/chat';

  /// GET /api/club/:clubMonthId/chat/context/:messageId — сообщение + контекст
  /// вокруг него (для перехода к закрепу/reply как в Telegram).
  /// Query: radius (1-30, default 15 — сколько до и после).
  /// Возвращает { messages[] DESC, targetId, hasMoreBefore, hasMoreAfter }.
  static String clubChatContext(String clubMonthId, String messageId) =>
      '/club/$clubMonthId/chat/context/$messageId';

  /// POST /api/club/:clubMonthId/chat/image — загрузить картинку в чат.
  /// multipart/form-data: поле "image" (файл), опц. "text" (caption), "replyToId".
  /// Возвращает созданное сообщение type=image с signed imageUrl (TTL 1 час).
  static String clubChatImage(String clubMonthId) =>
      '/club/$clubMonthId/chat/image';

  /// POST /api/club/:clubMonthId/chat/voice — загрузить голосовое (4.12).
  /// multipart/form-data: "voice" (m4a файл), "durationSec", "waveform"
  /// (JSON-массив 40 чисел), опц. "replyToId".
  /// ТОЛЬКО Анна-admin (бэк проверяет role). Возвращает сообщение type=voice
  /// с signed voiceUrl (TTL 1 час).
  static String clubChatVoice(String clubMonthId) =>
      '/club/$clubMonthId/chat/voice';

  /// POST /api/club/:clubMonthId/chat/read — отметить сообщения прочитанными
  /// (задача 4.11). Body: { messageIds: [string] } (1-100).
  static String clubChatRead(String clubMonthId) =>
      '/club/$clubMonthId/chat/read';

  /// POST /api/club/:clubMonthId/chat/:messageId/pin — закрепить/открепить
  /// сообщение (задача 4.10, только Анна-admin). Body: { pinned: bool }.
  /// Эмитит chat:pin_changed по WS.
  static String clubChatPin(String clubMonthId, String messageId) =>
      '/club/$clubMonthId/chat/$messageId/pin';

  /// PATCH /api/club/chat/:messageId — редактировать своё сообщение.
  /// Body: { text }. Окно 15 мин, только автор, не voice.
  /// DELETE /api/club/chat/:messageId — soft-delete своё сообщение (автор/админ).
  static String clubChatMessage(String messageId) =>
      '/club/chat/$messageId';

  /// POST /api/club/chat/:messageId/reaction — поставить/снять реакцию (toggle).
  /// Body: { emoji } — один из 6 разрешённых (❤️👍🔥👏🥲🙏).
  /// Возвращает обновлённый массив reactions; эмитит chat:reaction_updated по WS.
  static String clubChatReaction(String messageId) =>
      '/club/chat/$messageId/reaction';

  /// POST /api/club/chat/:messageId/report — жалоба на сообщение.
  /// Body: { reason, comment? }
  /// Reason: spam/inappropriate/offensive/copyright/other.
  static String clubChatReport(String messageId) => '/club/chat/$messageId/report';

  /// GET /api/club/:clubMonthId/qa — список вопросов клуба.
  /// POST /api/club/:clubMonthId/qa — задать вопрос Анне.
  /// Body: { questionText } (5-500 символов)
  static String clubQa(String clubMonthId) => '/club/$clubMonthId/qa';

  // — Платежи (задача 3.2 клиент / 3.3 сервер) —

  /// POST /api/purchases/verify — верификация покупки Apple.
  /// Body: { signedTransaction } (JWS из StoreKit 2).
  /// Возвращает обновлённую сводку прав пользователя.
  static const String purchasesVerify = '/purchases/verify';

  /// GET /api/purchases/history — история покупок юзера (экран 4.44, задача 6.2).
  static const String purchasesHistory = '/purchases/history';

  // — Дневник (Фаза 5: задачи 5.1-5.3) —

  /// POST /api/quotes — сохранить цитату.
  /// Body: { text, author?, bookTitle?, bookId?, audioTimestamp? }
  /// Если у юзера включён ИИ-анализ — цитата вернётся с aiStatus='pending',
  /// разбор досчитается на сервере в фоне.
  ///
  /// GET /api/quotes?page=&limit=&bookId= — лента дневника (новые сверху).
  static const String quotes = '/quotes';

  /// GET /api/quotes/:id — цитата с разбором (экран 4.25).
  /// DELETE /api/quotes/:id — удалить свою цитату.
  static String quoteById(String id) => '/quotes/$id';

  /// GET /api/reports/weekly/latest — последний еженедельный отчёт (4.26).
  /// Если отчётов нет — { report: null }.
  static const String reportsWeeklyLatest = '/reports/weekly/latest';

  /// GET /api/reports/weekly?week=&year= — конкретный отчёт.
  static const String reportsWeekly = '/reports/weekly';

  // — Health —
  static const String health = '/health';
}
