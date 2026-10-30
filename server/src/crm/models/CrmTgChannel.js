const mongoose = require('mongoose');

/**
 * Telegram-канал/чат, доступ в который даёт CRM (CRM-PLAN §2, A1). Только схема.
 * chatId — строкой (id Telegram бывают большими отрицательными числами).
 */
const { ObjectId } = mongoose.Schema.Types;

const crmTgChannelSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true },
    title: { type: String, default: '' },
    kind: { type: String, enum: ['club_month', 'season', 'product'], required: true },
    // Ключ месяца YYYY-M (как clubMonthKey в middleware/subscription.js).
    clubMonthKey: { type: String, default: null },
    productIds: { type: [ObjectId], ref: 'CrmProduct', default: [] },
  },
  { timestamps: true }
);

crmTgChannelSchema.index({ chatId: 1 }, { unique: true });
crmTgChannelSchema.index({ clubMonthKey: 1 }, { sparse: true });
crmTgChannelSchema.index({ productIds: 1 });

module.exports = mongoose.model('CrmTgChannel', crmTgChannelSchema);
