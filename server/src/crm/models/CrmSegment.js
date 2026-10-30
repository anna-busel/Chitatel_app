const mongoose = require('mongoose');

/**
 * Сегмент для рассылок (CRM-PLAN §2, A1). Только схема.
 *
 * Поля условий: club (в клубе в месяце), nopay (не покупала N месяцев),
 * boughtCat, bought (продукт), tag, country, linked (приложение),
 * bot (Telegram-бот), tier2 (Тариф 2 в этом месяце), balance (есть остаток).
 */
const SEGMENT_FIELDS = [
  'club', 'nopay', 'boughtCat', 'bought', 'tag', 'country', 'linked', 'bot', 'tier2', 'balance',
];

const condSchema = new mongoose.Schema(
  {
    field: { type: String, enum: SEGMENT_FIELDS, required: true },
    val: { type: mongoose.Schema.Types.Mixed, default: null },
    not: { type: Boolean, default: false },
    join: { type: String, enum: ['and', 'or'], default: 'and' },
  },
  { _id: false }
);

const crmSegmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    conds: { type: [condSchema], default: [] },
  },
  { timestamps: true }
);

crmSegmentSchema.statics.FIELDS = SEGMENT_FIELDS;

module.exports = mongoose.model('CrmSegment', crmSegmentSchema);
module.exports.condSchema = condSchema;
