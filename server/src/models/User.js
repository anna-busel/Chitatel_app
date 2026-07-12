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

    hasArchiveAccess: { type: Boolean, default: false },
    purchasedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
    purchasedPackages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Package' }],

    aiConsent: { type: Boolean, default: false },
    pushToken: String,
    pushSettings: {
      dailyQuote: { type: Boolean, default: true },
      newAudio: { type: Boolean, default: true },
      aiReady: { type: Boolean, default: true },
      chatMessages: { type: Boolean, default: true },
      weeklyReport: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true },
    },
    surveyAnswers: mongoose.Schema.Types.Mixed,
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    city: String,

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
