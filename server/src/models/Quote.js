const mongoose = require('mongoose');

/**
 * Quote — цитата в дневнике пользователя (MASTER 7.3, экраны 4.17 / 4.24 / 4.25).
 *
 * aiStatus — состояние ИИ-анализа (MASTER 7.5, коды AI_ANALYSIS_PENDING / AI_ANALYSIS_FAILED):
 *   'skipped' — юзер не давал согласия на ИИ (aiConsent=false) → анализ не запускался
 *   'pending' — анализ запущен, ещё не готов
 *   'ready'   — анализ готов, лежит в aiAnalysis
 *   'failed'  — OpenAI не ответил / вернул ошибку после ретраев
 *
 * aiAnalysis — результат разбора цитаты (поля соответствуют JSON-ответу промпта
 * из MASTER 7.7: resonance / context / question).
 */
const quoteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: { type: String, required: true, maxlength: 2000 },
    author: String,
    bookTitle: String,
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', default: null },

    // Секунда в аудио, на которой юзер сохранил цитату (если шторка открыта из плеера).
    audioTimestamp: { type: Number, default: null },

    aiStatus: {
      type: String,
      enum: ['skipped', 'pending', 'ready', 'failed'],
      default: 'skipped',
    },

    aiAnalysis: {
      resonance: String,
      context: String,
      question: String,
      createdAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Лента дневника: цитаты юзера, новые сверху (4.24).
quoteSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Quote', quoteSchema);
