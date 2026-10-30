const mongoose = require('mongoose');

/**
 * Автописьмо или автоправило (CRM-PLAN §2, A1). Только схема.
 * key: a1…a7 (автописьма), r1…r8 (правила задач/карточек).
 */
const crmAutoSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    on: { type: Boolean, default: false },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    counter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

crmAutoSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('CrmAuto', crmAutoSchema);
