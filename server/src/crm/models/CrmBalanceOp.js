const mongoose = require('mongoose');

/**
 * Операция по балансу клиентки (CRM-PLAN §2, A1). Только схема.
 *
 * amount — ± BYN. CrmClient.balance — кэш суммы операций. Списание делается
 * атомарно: findOneAndUpdate({_id, balance: {$gte: x}}, {$inc: {balance: -x}}).
 */
const { ObjectId } = mongoose.Schema.Types;

const crmBalanceOpSchema = new mongoose.Schema({
  clientId: { type: ObjectId, ref: 'CrmClient', required: true },
  amount: { type: Number, required: true },
  reason: { type: String, default: null },
  orderId: { type: ObjectId, ref: 'CrmOrder', default: null },
  by: { type: ObjectId, ref: 'CrmMember', default: null },
  at: { type: Date, default: Date.now },
});

crmBalanceOpSchema.index({ clientId: 1, at: -1 });
crmBalanceOpSchema.index({ orderId: 1 }, { sparse: true });

module.exports = mongoose.model('CrmBalanceOp', crmBalanceOpSchema);
