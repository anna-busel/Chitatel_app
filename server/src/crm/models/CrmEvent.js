const mongoose = require('mongoose');

/**
 * История карточки клиентки (CRM-PLAN §2, A1). Только схема.
 *
 * who — id участницы команды (строкой) или подпись источника:
 * 'Система' | 'Сайт' | 'App Store' | 'Импорт'.
 */
const { ObjectId } = mongoose.Schema.Types;

const crmEventSchema = new mongoose.Schema({
  clientId: { type: ObjectId, ref: 'CrmClient', required: true },
  orderId: { type: ObjectId, ref: 'CrmOrder', default: null },
  at: { type: Date, default: Date.now },
  who: { type: String, default: 'Система' },
  text: { type: String, required: true },
  type: { type: String, default: null },
});

crmEventSchema.index({ clientId: 1, at: -1 });
crmEventSchema.index({ orderId: 1 }, { sparse: true });

module.exports = mongoose.model('CrmEvent', crmEventSchema);
