const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, sparse: true },
    name: String,

    // Ссылка на аватар (signed URL с фиксированным exp — стабильна, кэшируется).
    // Она же попадает в снапшот автора каждого сообщения чата, поэтому фото
    // видно напротив реплик участницы.
    avatarUrl: String,
    // Относительный путь файла на диске (для перевыпуска ссылки и удаления
    // старого файла при смене фото). Появился в Фазе 6 (задача 6.2).
    avatarStoragePath: String,

    authProvider: { type: String, enum: ['apple', 'google', 'email'] },
    appleUserId: { type: String, unique: true, sparse: true },

    // Refresh-токен Apple, полученный обменом authorizationCode при входе
    // (Фаза 6, A2). Нужен РОВНО для одного: отозвать доступ приложения при
    // удалении аккаунта (Apple требует revoke у приложений с Sign in with
    // Apple). Больше нигде не используется. Клиенту не отдаётся никогда.
    // ⚠️ У пользователей, вошедших ДО этой правки, поля нет — отзывать нечего,
    // удаление аккаунта просто пройдёт без revoke (в логах будет предупреждение).
    appleRefreshToken: String,

    googleUserId: { type: String, unique: true, sparse: true },
    passwordHash: String,

    subscriptionStatus: {
      type: String,
      enum: ['free', 'basic', 'premium', 'expired'],
      default: 'free',
    },
    // Период подписки. 'season' — сезонный тариф 3 мес (club.basic.season,
    // модель подписок 15.06.2026). Добавлен фиксом B4 аудита 07.07.2026:
    // раньше enum его не знал, и purchase.service писал null.
    subscriptionPlan: {
      type: String,
      enum: ['monthly', 'season', 'semiannual', 'annual', null],
      default: null,
    },
    subscriptionExpiresAt: Date,
    subscriptionOriginalTransactionId: String,
    gracePeriodExpiresAt: Date,

    // Клубные месяцы, ОПЛАЧЕННЫЕ подпиской (ключи 'YYYY-M', month 1..12).
    // Пополняется в purchase.service.applyTransaction при каждой успешной
    // транзакции подписки; при возврате денег (refunded) оплаченные той
    // транзакцией месяцы снимаются. Доступ к клубу и к книге клуба сверяется
    // РОВНО с этим набором (а не вычисляется из subscriptionExpiresAt) — см.
    // resolveClubAccess и userHasBookAccess. Появилось 30.07.2026 при переходе
    // на хранимый оплаченный набор. Существующим подписчикам засевается
    // одноразовым scripts/backfill-club-entitlements.js.
    clubMonthsEntitled: { type: [String], default: [] },

    hasArchiveAccess: { type: Boolean, default: false },
    purchasedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    purchasedPackages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Package' }],

    aiConsent: { type: Boolean, default: false },
    pushToken: String,
    // Настройки push (экран 4.31). reports — недельный + месячный отчёты (одна
    // настройка, решение проекта 24.07.2026, заменила weeklyReport). news —
    // новости/анонсы сезона. aiReady — «разбор цитаты готов».
    pushSettings: {
      dailyQuote: { type: Boolean, default: true },
      newAudio: { type: Boolean, default: true },
      aiReady: { type: Boolean, default: true },
      chatMessages: { type: Boolean, default: true },
      reports: { type: Boolean, default: true },
      news: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
    },
    surveyAnswers: mongoose.Schema.Types.Mixed,
    // Флаг прохождения персонализации (онбординг-опрос, задача 6.3). Ставится
    // true при завершении опроса ИЛИ при «Пропустить» — чтобы больше не
    // переспрашивать (вариант А). Гейтит показ опроса на сервере, поэтому
    // переживает переустановку и вход на втором устройстве.
    onboardingCompleted: { type: Boolean, default: false },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    country: String,
    city: String,
    // Почта для рассылки/новостей вне приложения (экран онбординга «Страна/
    // город/рассылка»). Отдельно от email аккаунта: при Apple «Скрыть email»
    // аккаунтная почта техническая, поэтому реальную для рассылки спрашиваем
    // явно и с отдельным согласием (marketingConsent) — под это нужна строка в
    // Политике конфиденциальности.
    marketingEmail: String,
    marketingConsent: { type: Boolean, default: false },

    refreshTokens: [String],

    role: { type: String, enum: ['user', 'admin'], default: 'user' },

    // Модерация (задача 4.4). Apple Guideline 1.2 — UGC moderation tools.
    // isBanned — полный бан, юзер не может ни писать, ни заходить в клуб.
    // mutedUntil — временный мьют (Date в будущем); после этой даты автоматически снимается.
    isBanned: { type: Boolean, default: false },
    mutedUntil: { type: Date, default: null },

    // Блокировка участников самим пользователем (Фаза 6, A1).
    // Apple Guideline 1.2 требует, чтобы в приложении с UGC участник мог
    // заблокировать другого участника — тогда его сообщения не показываются.
    // Фильтрация на сервере: GET /api/club/chat, /chat/context, pinnedMessage
    // и reply-снапшоты; на клиенте — входящие сообщения по WebSocket.
    // Заблокировать администратора (автора клуба) нельзя — см. routes/users.js.
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    isDeleted: { type: Boolean, default: false },
    deletionRequestedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
