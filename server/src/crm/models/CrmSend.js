const mongoose = require('mongoose');

/**
 * Один получатель одной рассылки или автописьма (CRM-PLAN §2, A1). Только схема.
 * campaignId — для рассылки, autoKey — для автописьма (a1…a7).
 * extId — SES MessageId / Telegram message_id.
 */
const { ObjectId } = mongoose.Schema.Types;

const crmSendSchema = new mongoose.Schema({
  campaignId: { type: ObjectId, ref: 'CrmCampaign', default: null },
  autoKey: { type: String, default: null },
  clientId: { type: ObjectId, ref: 'CrmClient', required: true },
  channel: { type: String, enum: ['email', 'bot'], required: true },
  extId: { type: String, default: null },
  status: { type: String, default: 'queued' },
  at: { type: Date, default: Date.now },
  openedAt: { type: Date, default: null },
  clickedAt: { type: Date, default: null },
});

crmSendSchema.index({ campaignId: 1, status: 1 });
crmSendSchema.index({ autoKey: 1, clientId: 1 });
crmSendSchema.index({ clientId: 1, at: -1 });
crmSendSchema.index({ extId: 1 }, { sparse: true });

module.exports = mongoose.model('CrmSend', crmSendSchema);
