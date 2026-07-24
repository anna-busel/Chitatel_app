const mongoose = require('mongoose');

/**
 * WeeklyReport — еженедельный ИИ-отчёт по цитатам пользователя
 * (MASTER 7.3, 7.7 «Еженедельный отчёт», экран 4.26).
 *
 * Генерируется job'ом src/jobs/weekly-report.js (cron понедельник 10:00 МСК,
 * за ПРЕДЫДУЩУЮ завершённую ISO-неделю), только для юзеров с aiConsent=true,
 * зарегистрированных до начала недели и с >= 3 цитатами за неделю.
 *
 * Структура (решение проекта 24.07.2026): показываем ТОЛЬКО текст insights
 * (личное письмо Анны), без хардкод-полей «тема/тон». dominantThemes и
 * emotionalTone хранятся для рекомендаций и аналитики, но на экране не выводятся.
 *
 * recommendations[] — книги каталога, подобранные по темам недели
 * (ai.service.resolveRecommendations: пересечение dominantThemes/категорий цитат
 * с Book.categories/tags среди опубликованных разборов). Снимок title/author/
 * coverImageUrl кладётся в отчёт, bookId — для перехода на экран разбора.
 * Если подходящих книг нет — массив пустой, блок рекомендаций не показывается.
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

const weeklyReportSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ISO-номер недели (1-53) и ISO-год — по ним ищется отчёт (GET /api/reports/weekly?week=&year=)
    weekNumber: { type: Number, required: true },
    year: { type: Number, required: true },

    startDate: Date,
    endDate: Date,

    // Личное письмо Анны — единственное, что показывается на экране.
    insights: { type: String, default: '' },

    // Служебные поля модели (для рекомендаций/аналитики, не для экрана).
    dominantThemes: { type: [String], default: [] },
    emotionalTone: { type: String, default: '' },

    recommendations: { type: [recommendationSchema], default: [] },

    stats: {
      quotesCount: { type: Number, default: 0 },
      uniqueAuthors: { type: Number, default: 0 },
      activeDays: { type: Number, default: 0 },
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
