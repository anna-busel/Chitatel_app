const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, sparse: true },
    name: String,
    avatarUrl: String,
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

    isDeleted: { type: Boolean, default: false },
    deletionRequestedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', userSchema);
