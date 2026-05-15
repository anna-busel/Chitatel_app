const mongoose = require('mongoose');

/**
 * Сообщение в чате клуба.
 *
 * Расширенная схема v5 (см. AI-CONTEXT 13.05.2026 — секция «ЧАТ КЛУБА»).
 * Поддерживает все 9 must-have фич Telegram-уровня:
 * 1. Текст + reply
 * 2. Картинки (type='image' + imageUrl)
 * 3. Reactions (6 эмодзи белый список — см. ALLOWED_REACTIONS ниже)
 * 4. Edit/Delete своих сообщений (editedAt, deletedAt — soft delete)
 * 5. Mentions @Анна (mentions: [userId])
 * 6. Закреплённые сообщения (isPinned + ClubMonth.pinnedMessageId)
 * 7. Read receipts (readBy: [userId]) — опционально, для Анны
 * 8. Push на новое сообщение (обрабатывается в socket-хендлере)
 * 9. Голосовые сообщения (type='voice', AAC m4a 64kbps mono, макс 3 мин)
 *
 * Voice messages:
 * - voiceUrl — signed URL через тот же AUDIO_SECRET что и в задаче 2.3
 *   (другая подпапка: AUDIO_BASE_PATH/voice-messages/<userId>/<messageId>.m4a)
 * - voiceDurationSec — длительность в секундах (макс 180)
 * - voiceWaveform — 40 семплов 0-100 для отрисовки, считаются на клиенте
 *
 * Soft delete:
 * - Удалённые сообщения остаются в БД с deletedAt
 * - На клиенте показываются как «сообщение удалено» (для контекста reply)
 * - Для модерации/аудита — нужны полные данные
 *
 * Модерация:
 * - isHidden — скрыто модератором (Анной), не показывается в ленте
 * - reportCount — счётчик жалоб для приоритизации в админке
 */

// Белый список реакций v5 (AI-CONTEXT): бережный набор для женского
// психологического сообщества. Предотвращает токсичность.
const ALLOWED_REACTIONS = ['❤️', '👍', '🔥', '👏', '🥲', '🙏'];

const reactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      required: true,
      enum: ALLOWED_REACTIONS,
    },
    userIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    // К какому клубу относится сообщение
    clubMonthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClubMonth',
      required: true,
      index: true,
    },

    // Автор
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Тип сообщения определяет какие поля заполнены
    type: {
      type: String,
      enum: ['text', 'image', 'voice'],
      default: 'text',
      required: true,
    },

    // Текст: основной для type='text', caption для image/voice
    text: { type: String, default: '' },

    // Картинка (type='image')
    imageUrl: { type: String, default: null },

    // Голосовое (type='voice')
    voiceUrl: { type: String, default: null }, // signed URL
    voiceDurationSec: { type: Number, default: null }, // макс 180 (3 мин)
    voiceWaveform: { type: [Number], default: [] }, // 40 семплов 0-100

    // Reply на другое сообщение
    replyToId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
    },

    // Reactions (массив по эмодзи)
    reactions: { type: [reactionSchema], default: [] },

    // Mentions — упомянутые пользователи (для push-уведомлений)
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Edit
    editedAt: { type: Date, default: null },

    // Soft delete
    deletedAt: { type: Date, default: null },

    // Read receipts (опционально, видит только Анна)
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Закреплено Анной (1 на клуб — управляется через ClubMonth.pinnedMessageId)
    isPinned: { type: Boolean, default: false },

    // Модерация
    isHidden: { type: Boolean, default: false }, // скрыто модератором
    reportCount: { type: Number, default: 0 }, // счётчик жалоб
  },
  {
    timestamps: true,
  }
);

// Основной запрос: история чата конкретного клуба, новые сверху или снизу.
chatMessageSchema.index({ clubMonthId: 1, createdAt: -1 });

// Для пагинации «before»: clubMonthId + createdAt < before.
chatMessageSchema.index({ clubMonthId: 1, createdAt: 1 });

// Для модерации в админке (4.4): сообщения с жалобами.
chatMessageSchema.index({ reportCount: -1, createdAt: -1 });

// Экспортируем модель и константу — оба нужны в роутах/Zod-схемах (4.2).
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;
module.exports.ALLOWED_REACTIONS = ALLOWED_REACTIONS;
