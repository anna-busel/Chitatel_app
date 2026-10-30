const mongoose = require('mongoose');

/**
 * Задача команды (CRM-PLAN §2, A1). Только схема.
 * autoRule — ключ правила, которое создало задачу (r1…r8), null = вручную.
 */
const { ObjectId } = mongoose.Schema.Types;

const crmTaskSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['call', 'msg', 'offer', 'meet'], required: true },
    title: { type: String, required: true },
    clientId: { type: ObjectId, ref: 'CrmClient', default: null },
    orderId: { type: ObjectId, ref: 'CrmOrder', default: null },
    due: { type: Date, default: null },
    priority: { type: String, enum: ['high', 'mid', 'low'], default: 'mid' },
    assigneeId: { type: ObjectId, ref: 'CrmMember', default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    autoRule: { type: String, default: null },
  },
  { timestamps: true }
);

crmTaskSchema.index({ assigneeId: 1, done: 1, due: 1 });
crmTaskSchema.index({ clientId: 1 });
crmTaskSchema.index({ orderId: 1 }, { sparse: true });

module.exports = mongoose.model('CrmTask', crmTaskSchema);
