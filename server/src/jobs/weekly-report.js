const cron = require('node-cron');
const logger = require('../config/logger');
const User = require('../models/User');
const Quote = require('../models/Quote');
const WeeklyReport = require('../models/WeeklyReport');
const { generateWeeklySummary } = require('../services/ai.service');
const pushService = require('../services/push.service');

/**
 * Еженедельный ИИ-отчёт (MASTER 7.7, экран 4.26).
 *
 * Cron: каждое воскресенье 10:00 (Europe/Moscow = UTC+3).
 * Условия генерации (STEP-BY-STEP 5.1):
 *   - у юзера aiConsent === true
 *   - за последние 7 дней сохранено >= 3 цитат
 *
 * Push «Еженедельный отчёт готов» — шлётся после генерации (задача 6.1).
 */

const MIN_QUOTES_FOR_REPORT = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Номер ISO-недели для даты (1-53). Нужен для ключа отчёта (year + weekNumber). */
const getIsoWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Четверг текущей недели определяет год и номер недели по ISO 8601.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
};

/**
 * Прогон отчётов по всем подходящим юзерам.
 * Идемпотентен: повторный запуск в ту же неделю обновляет существующий отчёт.
 */
const runWeeklyReports = async () => {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - WEEK_MS);
  const { weekNumber, year } = getIsoWeek(startDate);

  const users = await User.find({
    aiConsent: true,
    isDeleted: { $ne: true },
  })
    .select('_id aiConsent')
    .lean();

  logger.info('Weekly report job started', {
    users: users.length,
    weekNumber,
    year,
  });

  let created = 0;

  for (const user of users) {
    try {
      const quotes = await Quote.find({
        userId: user._id,
        createdAt: { $gte: startDate, $lte: endDate },
      })
        .sort({ createdAt: 1 })
        .lean();

      if (quotes.length < MIN_QUOTES_FOR_REPORT) {
        continue;
      }

      const aiSummary = await generateWeeklySummary(user, quotes);

      const analysesCount = quotes.filter((q) => q.aiStatus === 'ready').length;

      await WeeklyReport.findOneAndUpdate(
        { userId: user._id, year, weekNumber },
        {
          $set: {
            startDate,
            endDate,
            stats: {
              // Минуты прослушивания за неделю пока не считаем: Progress хранит
              // только суммарное время без разбивки по дням (недельная статистика —
              // задача 6.2, GET /api/progress/stats).
              minutesListened: 0,
              quotesCount: quotes.length,
              analysesCount,
            },
            aiSummary,
            quotes: quotes.map((q) => q._id),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      created += 1;

      // Push «еженедельный отчёт готов» (задача 6.1). Гейтится настройкой weeklyReport.
      pushService
        .sendToUser(
          user._id,
          {
            title: 'Еженедельный отчёт',
            body: `${quotes.length} цитат за неделю — читайте разбор`,
            data: {
              type: 'weekly_report',
              year: String(year),
              week: String(weekNumber),
            },
          },
          'weeklyReport'
        )
        .catch(() => {});
    } catch (err) {
      // Один упавший юзер не должен ронять весь прогон.
      logger.error('Weekly report failed for user', {
        userId: String(user._id),
        message: err.message,
      });
    }
  }

  logger.info('Weekly report job finished', { reports: created });
  return created;
};

/** Планировщик. Вызывается один раз при старте сервера (server.js). */
const scheduleWeeklyReports = () => {
  // Воскресенье 10:00 по Москве (UTC+3).
  cron.schedule(
    '0 10 * * 0',
    () => {
      runWeeklyReports().catch((err) => {
        logger.error('Weekly report cron error', { message: err.message });
      });
    },
    { timezone: 'Europe/Moscow' }
  );

  logger.info('Weekly report cron scheduled (Sun 10:00 Europe/Moscow)');
};

module.exports = { runWeeklyReports, scheduleWeeklyReports };
