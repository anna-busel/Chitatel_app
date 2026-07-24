const mongoose = require('mongoose');

/**
 * MonthlyReport — ежемесячный ИИ-отчёт по цитатам пользователя
 * (промпты Анны из reader-bot monthlyReportService.js, экран отчёта 4.26).
 *
 * Генерируется job'ом src/jobs/monthly-report.js (cron 1-е число 10:00 МСК,
 * за ПРЕДЫДУЩИЙ календарный месяц), только для юзеров с aiConsent=true,
 * зарегистрированных до начала месяца и с >= 3 цитатами за месяц.
 *
 * Двухуровневая логика (экономия токенов):
 *   - если за месяц есть >= 2 недельных отчёта → месячный агрегирует их инсайты
 *     (MONTHLY_REPORT_WEEKLY_PROMPT);
 *   - иначе → фоллбек по топ-цитатам месяца (MONTHLY_REPORT_TOPQUOTES_PROMPT).
 *
 * Показывается ТОЛЬКО текст insights (глубокое письмо Анны). recommendations[] —
 * как в недельном: книги каталога по темам месяца, снимок + bookId для перехода.
 */
const recommendationSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    title: { type: String, default: '' },
    author: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    why: { type: String, default: '' },
  },
  { _id: false }
);

const monthlyReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Календарный месяц (1-12) и год — по ним ищется отчёт.
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    startDate: Date,
    endDate: Date,

    // Глубокое письмо Анны — единственное, что показывается на экране.
    insights: { type: String, default: '' },

    recommendations: { type: [recommendationSchema], default: [] },

    stats: {
      quotesCount: { type: Number, default: 0 },
      uniqueAuthors: { type: Number, default: 0 },
      activeDays: { type: Number, default: 0 },
      weeksActive: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Один отчёт на юзера в месяц. Повторный запуск job'а не создаёт дубль.
monthlyReportSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyReport', monthlyReportSchema);
