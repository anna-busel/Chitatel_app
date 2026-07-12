const mongoose = require('mongoose');

/**
 * WeeklyReport — еженедельный ИИ-отчёт по цитатам пользователя
 * (MASTER 7.3, 7.7 «Еженедельный отчёт», экран 4.26).
 *
 * Генерируется job'ом src/jobs/weekly-report.js (cron воскресенье 10:00),
 * только для юзеров с aiConsent=true и >= 3 цитатами за неделю (STEP-BY-STEP 5.1).
 *
 * aiSummary — поля соответствуют JSON-ответу промпта из MASTER 7.7:
 * weekTheme / insight / recommendation { title, author, why }.
 */
const weeklyReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ISO-номер недели (1-53) и год — по ним ищется конкретный отчёт (GET /api/reports/weekly?week=&year=)
    weekNumber: { type: Number, required: true },
    year: { type: Number, required: true },

    startDate: Date,
    endDate: Date,

    stats: {
      minutesListened: { type: Number, default: 0 },
      quotesCount: { type: Number, default: 0 },
      analysesCount: { type: Number, default: 0 },
    },

    aiSummary: {
      weekTheme: String,
      insight: String,
      recommendation: {
        title: String,
        author: String,
        why: String,
      },
    },

    quotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quote' }],
  },
  {
    timestamps: true,
  }
);

// Один отчёт на юзера в неделю. Повторный запуск job'а не создаёт дубль.
weeklyReportSchema.index({ userId: 1, year: 1, weekNumber: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyReport', weeklyReportSchema);
