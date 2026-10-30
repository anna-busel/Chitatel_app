const mongoose = require('mongoose');

/**
 * Клиентка CRM (CRM-PLAN §2, задача A1).
 *
 * Пользовательниц приложения (User) CRM не копирует: связь — через appUserId
 * (null = аккаунт приложения не связан). Права доступа в приложении живут
 * в User, CRM пишет туда же (задачи B1/B2).
 *
 * Только схема, без бизнес-логики.
 */
const { ObjectId } = mongoose.Schema.Types;

const emailSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    source: { type: String, enum: ['gk', 'site', 'app', 'manual'], default: 'manual' },
  },
  { _id: false }
);

const commentSchema = new mongoose.Schema({
  memberId: { type: ObjectId, ref: 'CrmMember', default: null },
  at: { type: Date, default: Date.now },
  text: { type: String, required: true },
});

const crmClientSchema = new mongoose.Schema(
  {
    name: { type: String, default: '', trim: true },
    emails: { type: [emailSchema], default: [] },
    primaryEmail: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null },
    // Только цифры — поиск дублей.
    phoneNorm: { type: String, default: null },
    city: { type: String, default: null },
    country: { type: String, default: null },
    telegram: {
      username: { type: String, default: null },
      chatId: { type: String, default: null },
      botSubscribed: { type: Boolean, default: false },
    },
    whatsapp: { type: Boolean, default: false },
    appUserId: { type: ObjectId, ref: 'User', default: null },
    tags: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] },
    // Абонементы из Excel (импорт): ключи месяцев YYYY-M + примечание.
    legacyMonths: { type: [String], default: [] },
    legacyNote: { type: String, default: null },
    // BYN, кэш суммы CrmBalanceOp.
    balance: { type: Number, default: 0 },
    // {[tgChatId]: 'in'|'out'} — ручное включение/исключение из канала.
    channelOverrides: { type: Map, of: { type: String, enum: ['in', 'out'] }, default: {} },
    marketingOptOut: { type: Date, default: null },
    since: { type: Date, default: Date.now },
    firstPaidAt: { type: Date, default: null },
    lastPaidAt: { type: Date, default: null },
    ltvByn: { type: Number, default: 0 },
    gkId: { type: String, default: null },
    mergedInto: { type: ObjectId, ref: 'CrmClient', default: null },
  },
  { timestamps: true }
);

crmClientSchema.index({ primaryEmail: 1 });
crmClientSchema.index({ 'emails.email': 1 });
crmClientSchema.index({ phoneNorm: 1 });
crmClientSchema.index({ 'telegram.chatId': 1 });
crmClientSchema.index({ appUserId: 1 });
crmClientSchema.index({ tags: 1 });
crmClientSchema.index({ gkId: 1 }, { sparse: true });

module.exports = mongoose.model('CrmClient', crmClientSchema);
