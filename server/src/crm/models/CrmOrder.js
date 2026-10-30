const mongoose = require('mongoose');

/**
 * Заказ CRM (CRM-PLAN §2, A1). Только схема.
 *
 * num — сквозной номер, продолжает нумерацию GetCourse; выдаётся
 * CrmCounter.nextOrderNum().
 * status 'overdue' в базе не хранится — вычисляется по deadline.
 * granted — что именно выдано, чтобы при возврате снять ровно это (B2).
 */
const { ObjectId } = mongoose.Schema.Types;

const CURRENCIES = ['BYN', 'USD', 'RUB', 'GEL', 'EUR'];

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  cur: { type: String, enum: CURRENCIES, default: 'BYN' },
  method: {
    type: String,
    enum: ['bepaid', 'lava', 'transfer', 'balance', 'app_store', 'google_play', 'import'],
    required: true,
  },
  at: { type: Date, default: Date.now },
  // Перевод ждёт подтверждения (CrmSettings.requireTransferConfirm).
  pending: { type: Boolean, default: false },
  // Счёт/карта, куда пришёл перевод.
  account: { type: String, default: null },
  note: { type: String, default: null },
  // id платежа у провайдера (bePaid uid, lava id, Apple transactionId).
  extId: { type: String, default: null },
  by: { type: ObjectId, ref: 'CrmMember', default: null },
});

const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    who: { type: String, default: 'Система' },
    text: { type: String, required: true },
  },
  { _id: false }
);

const commentSchema = new mongoose.Schema({
  memberId: { type: ObjectId, ref: 'CrmMember', default: null },
  at: { type: Date, default: Date.now },
  text: { type: String, required: true },
});

const crmOrderSchema = new mongoose.Schema(
  {
    num: { type: Number, required: true },
    clientId: { type: ObjectId, ref: 'CrmClient', required: true },
    productId: { type: ObjectId, ref: 'CrmProduct', default: null },
    price: { type: Number, default: 0 },
    cur: { type: String, enum: CURRENCIES, default: 'BYN' },
    discount: { type: Number, default: 0 },
    promoCode: { type: String, default: null },
    status: {
      type: String,
      enum: ['new', 'partial', 'confirm', 'paid', 'free', 'fake', 'refund'],
      default: 'new',
    },
    source: {
      type: String,
      enum: ['site', 'manual', 'app_store', 'google_play', 'import', 'admin'],
      default: 'manual',
    },
    managerId: { type: ObjectId, ref: 'CrmMember', default: null },
    deadline: { type: Date, default: null },
    gift: {
      name: { type: String, default: null },
      email: { type: String, default: null, lowercase: true, trim: true },
      recipientClientId: { type: ObjectId, ref: 'CrmClient', default: null },
    },
    note: { type: String, default: null },
    tags: { type: [String], default: [] },
    payments: { type: [paymentSchema], default: [] },
    refund: {
      amount: { type: Number, default: null },
      mode: { type: String, enum: ['money', 'balance', null], default: null },
      reason: { type: String, default: null },
      at: { type: Date, default: null },
      by: { type: ObjectId, ref: 'CrmMember', default: null },
    },
    // Для заказов из стора.
    purchaseId: { type: ObjectId, ref: 'Purchase', default: null },
    granted: {
      at: { type: Date, default: null },
      months: { type: [String], default: [] },
      bookIds: { type: [ObjectId], ref: 'Book', default: [] },
      packageIds: { type: [ObjectId], ref: 'Package', default: [] },
      subscriptionSet: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    history: { type: [historySchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    remindersSent: {
      type: [
        new mongoose.Schema(
          { kind: { type: String, required: true }, at: { type: Date, default: Date.now } },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

crmOrderSchema.index({ num: 1 }, { unique: true });
crmOrderSchema.index({ clientId: 1, createdAt: -1 });
crmOrderSchema.index({ status: 1, createdAt: -1 });
crmOrderSchema.index({ productId: 1 });
crmOrderSchema.index({ managerId: 1 });
crmOrderSchema.index({ deadline: 1 });
crmOrderSchema.index({ purchaseId: 1 }, { sparse: true });
crmOrderSchema.index({ 'payments.extId': 1 }, { sparse: true });
crmOrderSchema.index({ 'gift.recipientClientId': 1 }, { sparse: true });

module.exports = mongoose.model('CrmOrder', crmOrderSchema);
