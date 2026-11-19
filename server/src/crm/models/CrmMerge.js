const mongoose = require('mongoose');

/**
 * Объединение дублей клиенток (CRM-PLAN D3). Только схема.
 *
 * Снимок того, что перенесено с карточки fromId на intoId, — чтобы «Отменить»
 * вернуло всё как было (в течение 30 минут, пока перенесённое не менялось).
 * moved — id перенесённых документов по коллекциям; added — что добавилось
 * в карточку intoId; filled — пустые поля intoId, заполненные из fromId.
 */
const { ObjectId, Mixed } = mongoose.Schema.Types;

const crmMergeSchema = new mongoose.Schema({
  fromId: { type: ObjectId, ref: 'CrmClient', required: true },
  intoId: { type: ObjectId, ref: 'CrmClient', required: true },
  by: { type: ObjectId, ref: 'CrmMember', default: null },
  at: { type: Date, default: Date.now },
  balance: { type: Number, default: 0 },
  moved: { type: Mixed, default: {} },
  added: { type: Mixed, default: {} },
  filled: { type: Mixed, default: {} },
  // Связь с аккаунтом приложения перенесена с fromId на intoId.
  linkMovedUserId: { type: ObjectId, ref: 'User', default: null },
  // Заказы, которые объединение выдало (applyClientOrders) — при отмене снимаются.
  grantedOrderIds: { type: [ObjectId], default: [] },
  // Статусы перенесённых заказов на момент объединения.
  orderStatus: { type: Mixed, default: {} },
  undoneAt: { type: Date, default: null },
});

crmMergeSchema.index({ fromId: 1, at: -1 });
crmMergeSchema.index({ intoId: 1, at: -1 });

module.exports = mongoose.model('CrmMerge', crmMergeSchema);
