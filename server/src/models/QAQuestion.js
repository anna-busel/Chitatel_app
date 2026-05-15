const mongoose = require('mongoose');

/**
 * Вопрос участницы клуба к Анне (Q&A).
 *
 * Отдельная сущность от чата чтобы вопросы не терялись в потоке сообщений.
 * Анна отвечает по пятницам (фиксированный день — см. AI-CONTEXT v5,
 * согласовано 15.05.2026; push-напоминание в пятницу утром).
 *
 * Жизненный цикл:
 * 1. Участница задаёт вопрос — answerText/answeredAt пустые
 * 2. Анна в админке (9.4: POST /api/admin/qa/:id/answer) пишет ответ
 * 3. Push участнице «Анна ответила на ваш вопрос»
 * 4. Вопрос виден всем участницам клуба (публично — учимся друг у друга)
 *
 * Связь:
 * - clubMonthId — к какому клубу вопрос. Если клуб закончился, вопросы
 *   видны в архиве участницам с активной подпиской.
 *
 * Дублирующиеся вопросы (QA_DUPLICATE — MASTER 7.5):
 * - На сервисном уровне в 4.4 — если похожий вопрос уже есть, отдаём 409.
 *   Похожесть определяется простой эвристикой (нормализация текста + точное
 *   совпадение в рамках одного clubMonthId). ML-похожесть — post-MVP.
 */
const qaQuestionSchema = new mongoose.Schema(
  {
    clubMonthId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClubMonth',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    questionText: {
      type: String,
      required: true,
      maxlength: 500, // MASTER 12.3 — Вопрос Q&A: 500 символов
    },

    // Заполняется когда Анна отвечает
    answerText: { type: String, default: null },
    answeredAt: { type: Date, default: null },
    answeredByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    }, // Анна (роль admin)
  },
  {
    timestamps: true,
  }
);

// Список вопросов клуба, новые сверху.
qaQuestionSchema.index({ clubMonthId: 1, createdAt: -1 });

// Для админки: неотвеченные вопросы (admin endpoint /api/admin/qa/unanswered).
qaQuestionSchema.index({ answeredAt: 1, createdAt: 1 });

module.exports = mongoose.model('QAQuestion', qaQuestionSchema);
