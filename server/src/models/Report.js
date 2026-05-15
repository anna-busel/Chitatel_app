const mongoose = require('mongoose');

/**
 * Жалоба на сообщение в чате клуба или на пользователя.
 *
 * Обязательно для Apple Guideline 1.2 (UGC moderation).
 * Анна должна разбирать за 24 часа (MASTER 6.1 п.8).
 *
 * Что жалуем:
 * - targetType='message' — конкретное сообщение в чате
 * - targetType='user' — пользователь целиком (от блокировки переходим к жалобе
 *   если человек продолжает нарушать, чтобы Анна забанила)
 *
 * Действия по жалобе (выполняет Анна в админке, MASTER 9.4):
 * - hide_message — скрыть сообщение (ChatMessage.isHidden=true)
 * - warn_user — предупреждение пользователю (push + запись)
 * - mute_user — мьют на N дней (требует поле user.mutedUntil — добавим в 4.4)
 * - ban_user — бан совсем (user.isBanned=true — добавим в 4.4)
 * - dismiss — отклонить жалобу как необоснованную
 *
 * Один пользователь может жаловаться на одно сообщение только раз —
 * unique index (targetType=message + targetId + reporterUserId).
 */
const reportSchema = new mongoose.Schema(
  {
    // Кто жалуется
    reporterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // На что жалоба
    targetType: {
      type: String,
      enum: ['message', 'user'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Если жалоба на сообщение — для удобства запросов и контекста
    // храним ссылку на ClubMonth (чтобы быстро фильтровать жалобы по клубу).
    clubMonthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClubMonth',
      default: null,
      index: true,
    },

    // Причина (MASTER 4.36 — 5 причин)
    reason: {
      type: String,
      enum: [
        'spam',
        'inappropriate',
        'offensive',
        'copyright',
        'other',
      ],
      required: true,
    },

    // Дополнительный комментарий от пользователя (если выбрана 'other')
    comment: { type: String, default: '', maxlength: 500 },

    // Статус обработки
    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
      index: true,
    },

    // Действие модератора (заполняется при разрешении)
    actionTaken: {
      type: String,
      enum: ['hide_message', 'warn_user', 'mute_user', 'ban_user', 'dismiss', null],
      default: null,
    },
    resolvedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Один пользователь — одна жалоба на одно сообщение/пользователя.
reportSchema.index(
  { reporterUserId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);

// Для админки: pending жалобы, новые сверху.
reportSchema.index({ status: 1, createdAt: -1 });

// Все жалобы на конкретный target (для приоритизации в админке —
// если на одно сообщение 10 жалоб, это горящее).
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('Report', reportSchema);
