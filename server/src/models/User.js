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
    subscriptionPlan: {
      type: String,
      enum: ['monthly', 'semiannual', 'annual', null],
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

    isDeleted: { type: Boolean, default: false },
    deletionRequestedAt: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 });
userSchema.index({ appleUserId: 1 });
userSchema.index({ googleUserId: 1 });
userSchema.index({ referralCode: 1 });

module.exports = mongoose.model('User', userSchema);
