const mongoose = require('mongoose');

/**
 * Диалог во «Входящих» (CRM-PLAN §2, A1). Только схема.
 * hintEmail — почта, которую клиентка назвала в письме (для привязки).
 */
const { ObjectId } = mongoose.Schema.Types;

const messageSchema = new mongoose.Schema({
  dir: { type: String, enum: ['in', 'out'], required: true },
  // Участница команды (для исходящих); null — клиентка или система.
  by: { type: ObjectId, ref: 'CrmMember', default: null },
  text: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  extId: { type: String, default: null },
});

const crmThreadSchema = new mongoose.Schema(
  {
    clientId: { type: ObjectId, ref: 'CrmClient', default: null },
    channel: {
      type: String,
      enum: ['bot', 'email', 'site_form', 'whatsapp'],
      required: true,
    },
    assigneeId: { type: ObjectId, ref: 'CrmMember', default: null },
    answered: { type: Boolean, default: false },
    spam: { type: Boolean, default: false },
    lastAt: { type: Date, default: Date.now },
    messages: { type: [messageSchema], default: [] },
    hintEmail: { type: String, default: null, lowercase: true, trim: true },
  },
  { timestamps: true }
);

crmThreadSchema.index({ answered: 1, spam: 1, lastAt: -1 });
crmThreadSchema.index({ clientId: 1, lastAt: -1 });
crmThreadSchema.index({ assigneeId: 1, answered: 1 });

module.exports = mongoose.model('CrmThread', crmThreadSchema);
