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
 * `quote_analysis` Анны, config/ai-prompts.js):
 *   category  — одна из 14 категорий Анны (QUOTE_CATEGORIES)
 *   themes    — 1–3 коротких темы (существительные), используются для рекомендаций
 *   sentiment — 'positive' | 'neutral' | 'negative'
 *   insights  — художественный разбор в тоне «личной колонки»
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
      category: String,
      themes: { type: [String], default: undefined },
      sentiment: String,
      insights: String,
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
