const mongoose = require('mongoose');

/**
 * Участница команды CRM (CRM-PLAN §2, задачи A1/A2).
 *
 * Отдельно от User приложения: свой вход, свой JWT (scope:'crm').
 * passwordHash, totpSecret и refreshTokens по умолчанию не выбираются.
 *
 * totpSecret = null — 2FA ещё не настроена: при первом входе после пароля
 * сервер выдаёт секрет для приложения-аутентификатора, и вход завершается
 * только кодом из него (crm/routes/auth.js).
 *
 * refreshTokens — sha256 действующих refresh-токенов (ротация, не больше 5;
 * поле нужно для refresh из A2, в §2 плана не перечислено).
 */
const ROLES = ['owner', 'admin', 'marketing', 'manager'];

const crmMemberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    totpSecret: { type: String, default: null, select: false },
    lastAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    refreshTokens: { type: [String], default: [], select: false },
  },
  { timestamps: true }
);

crmMemberSchema.index({ email: 1 }, { unique: true });

crmMemberSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('CrmMember', crmMemberSchema);
