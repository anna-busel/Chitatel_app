const mongoose = require('mongoose');

/**
 * Взаимная дружба (UPDATES-PLAN F2, 27.11.2026).
 *
 * Одна запись на пару: pairKey — два id по возрастанию через «:», уникальный
 * индекс не даёт завести вторую запись в обратную сторону. pending — заявка
 * requesterId → addresseeId; accepted — друзья. Отклонённая заявка и
 * удалённая дружба удаляются совсем.
 */
const friendshipSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addresseeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pairKey: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

friendshipSchema.index({ addresseeId: 1, status: 1 });
friendshipSchema.index({ requesterId: 1, status: 1, createdAt: -1 });

friendshipSchema.statics.pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

module.exports = mongoose.model('Friendship', friendshipSchema);
