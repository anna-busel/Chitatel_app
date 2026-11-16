const mongoose = require('mongoose');

/**
 * Последнее прочитанное сообщение чата клуба (UPDATES-PLAN V1, 10.11.2026).
 *
 * Одна запись на пару (userId, clubMonthId). Хранится на сервере, чтобы
 * «где остановилась» работало на нескольких устройствах.
 *
 * - lastReadAt — createdAt последнего прочитанного сообщения (берётся из БД,
 *   не от клиента). Только растёт: отметка более старого сообщения ничего не
 *   меняет (chat-unread.service.markRead).
 * - lastReadMessageId — id этого сообщения (клиенту — для разделителя
 *   «Новые сообщения»).
 *
 * Непрочитанные = видимые сообщения клуба новее lastReadAt, кроме своих и от
 * заблокированных (chat-unread.service.countUnread). Удаляется вместе с
 * аккаунтом (routes/auth.js DELETE /account).
 */
const chatReadStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    clubMonthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClubMonth',
      required: true,
    },
    lastReadAt: { type: Date, default: null },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
    },
    // Когда Анна последний раз открывала список «Вопросы» в чате (15.11.2026).
    // Новые вопросы = вопросы клуба новее этой отметки.
    questionsSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatReadStateSchema.index({ userId: 1, clubMonthId: 1 }, { unique: true });

module.exports = mongoose.model('ChatReadState', chatReadStateSchema);
