const mongoose = require('mongoose');

/**
 * Промокод (CRM-PLAN §2, A1). Только схема.
 */
const crmPromoSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ['%', 'fixed'], required: true },
    value: { type: Number, required: true },
    scope: { type: String, enum: ['all', 'club', 'content'], default: 'all' },
    // null = без ограничения.
    limit: { type: Number, default: null },
    used: { type: Number, default: 0 },
    until: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

crmPromoSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('CrmPromo', crmPromoSchema);
