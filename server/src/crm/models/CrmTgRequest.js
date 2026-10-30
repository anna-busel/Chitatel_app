const mongoose = require('mongoose');

/**
 * Заявка на вступление в Telegram-канал, не принятая автоматически
 * (CRM-PLAN §2, A1). Только схема.
 */
const { ObjectId } = mongoose.Schema.Types;

const crmTgRequestSchema = new mongoose.Schema({
  tgUserId: { type: String, required: true },
  username: { type: String, default: null },
  chatId: { type: String, required: true },
  at: { type: Date, default: Date.now },
  clientId: { type: ObjectId, ref: 'CrmClient', default: null },
  // Почему не принято автоматически.
  reason: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined'],
    default: 'pending',
  },
});

crmTgRequestSchema.index({ status: 1, at: -1 });
crmTgRequestSchema.index({ tgUserId: 1, chatId: 1 });

module.exports = mongoose.model('CrmTgRequest', crmTgRequestSchema);
