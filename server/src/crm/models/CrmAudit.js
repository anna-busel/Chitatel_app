const mongoose = require('mongoose');

/**
 * Журнал действий команды в CRM (CRM-PLAN §2, задача A3).
 * Пишется middleware crm/middleware/audit.js на каждое изменяющее действие.
 *
 * diff — { before, after } (без паролей, кодов и токенов).
 */
const { ObjectId } = mongoose.Schema.Types;

const crmAuditSchema = new mongoose.Schema({
  memberId: { type: ObjectId, ref: 'CrmMember', required: true },
  at: { type: Date, default: Date.now },
  action: { type: String, required: true },
  entity: { type: String, default: null },
  entityId: { type: String, default: null },
  diff: { type: mongoose.Schema.Types.Mixed, default: null },
});

crmAuditSchema.index({ at: -1 });
crmAuditSchema.index({ entity: 1, entityId: 1, at: -1 });
crmAuditSchema.index({ memberId: 1, at: -1 });

module.exports = mongoose.model('CrmAudit', crmAuditSchema);
