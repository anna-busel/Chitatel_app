const mongoose = require('mongoose');

/**
 * Продукт CRM (CRM-PLAN §2, A1). Только схема; что выдаёт grant — B2.
 *
 * price: null = «по договорённости».
 * slug — адрес страницы оплаты (pay.chitatel.app/<slug>).
 */
const CURRENCIES = ['BYN', 'USD', 'RUB', 'GEL', 'EUR'];

const crmProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    cat: { type: String, enum: ['club', 'content', 'card', 'other'], required: true },
    price: { type: Number, default: null },
    cur: { type: String, enum: CURRENCIES, default: 'BYN' },
    active: { type: Boolean, default: true },
    // «Что входит».
    desc: { type: String, default: '' },
    // Текст письма после оплаты.
    letter: { type: String, default: '' },
    tgChatId: { type: String, default: null },
    tgLink: { type: String, default: null },
    grant: {
      type: {
        type: String,
        enum: ['month', 'months', 'year', 'book', 'pack', 'tier2', 'deposit', 'none'],
        default: 'none',
      },
      months: { type: [String], default: [] },
      bookSlugs: { type: [String], default: [] },
      packageSlug: { type: String, default: null },
      deposit: { type: Number, default: null },
    },
    term: {
      mode: { type: String, enum: ['forever', 'date', 'months'], default: 'forever' },
      date: { type: Date, default: null },
      n: { type: Number, default: null },
    },
    // Рассрочка: доступ после первого платежа.
    accessOnFirstPayment: { type: Boolean, default: false },
    // Тариф 3.
    materialsForever: { type: Boolean, default: false },
    chatForever: { type: Boolean, default: false },
    // Зум, вне приложения.
    tier2: { type: Boolean, default: false },
    // Разбор прошедшего месяца.
    sellSeparately: { type: Boolean, default: false },
    // Сопоставление покупок стора.
    appleProductId: { type: String, default: null },
    googleProductId: { type: String, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

crmProductSchema.index({ slug: 1 }, { unique: true });
crmProductSchema.index({ cat: 1, active: 1 });
crmProductSchema.index({ appleProductId: 1 }, { sparse: true });
crmProductSchema.index({ googleProductId: 1 }, { sparse: true });

crmProductSchema.statics.CURRENCIES = CURRENCIES;

module.exports = mongoose.model('CrmProduct', crmProductSchema);
