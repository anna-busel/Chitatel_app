const mongoose = require('mongoose');

/**
 * Карточка плана продаж (CRM-PLAN §2, A1). Только схема.
 */
const { ObjectId } = mongoose.Schema.Types;

const crmSalesCardSchema = new mongoose.Schema(
  {
    clientId: { type: ObjectId, ref: 'CrmClient', required: true },
    kind: {
      type: String,
      enum: ['unpaid', 'renew', 'lapsed', 'content', 'manual'],
      required: true,
    },
    stage: {
      type: String,
      enum: ['todo', 'contact', 'think', 'won', 'lost'],
      default: 'todo',
    },
    lossReason: { type: String, default: null },
    offerProductId: { type: ObjectId, ref: 'CrmProduct', default: null },
    orderId: { type: ObjectId, ref: 'CrmOrder', default: null },
    assigneeId: { type: ObjectId, ref: 'CrmMember', default: null },
    movedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

crmSalesCardSchema.index({ stage: 1, assigneeId: 1 });
crmSalesCardSchema.index({ clientId: 1 });
crmSalesCardSchema.index({ orderId: 1 }, { sparse: true });

module.exports = mongoose.model('CrmSalesCard', crmSalesCardSchema);
