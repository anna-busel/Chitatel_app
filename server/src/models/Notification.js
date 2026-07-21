const mongoose = require('mongoose');

/**
 * Уведомление для ленты внутри приложения (MASTER 4.30).
 *
 * Пишется при отправке значимых персональных push (push.service, PERSIST_TYPES).
 * Лента — это история: запись создаётся независимо от того, включён ли push
 * и есть ли токен у устройства.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Тип для иконки на экране 4.30:
    // new_audio | ai_ready | chat_reply | reminder | weekly_report | admin
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    // Полезная нагрузка для навигации по тапу (quoteId, week/year и т.п.).
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Лента юзера — новые сверху.
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
