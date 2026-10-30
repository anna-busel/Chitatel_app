const mongoose = require('mongoose');
const { condSchema } = require('./CrmSegment');

/**
 * Рассылка (CRM-PLAN §2, A1). Только схема.
 * Адресаты — сохранённый сегмент (segmentId) или условия прямо в рассылке (conds).
 */
const { ObjectId } = mongoose.Schema.Types;

const crmCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    segmentId: { type: ObjectId, ref: 'CrmSegment', default: null },
    conds: { type: [condSchema], default: [] },
    channel: { type: String, enum: ['email', 'bot', 'both'], default: 'email' },
    subject: { type: String, default: '' },
    format: { type: String, enum: ['text', 'html'], default: 'text' },
    body: { type: String, default: '' },
    scheduleAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent'],
      default: 'draft',
    },
    stats: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
      unsub: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      complained: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

crmCampaignSchema.index({ status: 1, scheduleAt: 1 });

module.exports = mongoose.model('CrmCampaign', crmCampaignSchema);
