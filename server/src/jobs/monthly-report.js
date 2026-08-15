const cron = require('node-cron');
const logger = require('../config/logger');
const User = require('../models/User');
const Quote = require('../models/Quote');
const WeeklyReport = require('../models/WeeklyReport');
const MonthlyReport = require('../models/MonthlyReport');
const {
  generateMonthlyReport,
  resolveRecommendations,
} = require('../services/ai.service');
const pushService = require('../services/push.service');
const { getNotif } = require('../services/notification-setting.service');

/**
 * Ежемесячный ИИ-отчёт (промпты Анны, экран 4.26).
 *
 * Cron: 1-е число 10:00 Europe/Moscow — за ПРЕДЫДУЩИЙ календарный месяц (МСК).
 * Условия те же, что у недельного: aiConsent, регистрация до начала месяца,
 * >= 3 цитат за месяц. Идемпотентность по (userId, year, month); force —
 * генерация заново без порога/регистрации (админ-триггер).
 *
 * Двухуровневая логика (в ai.service): если за месяц есть >= 2 недельных
 * отчёта — агрегируем их инсайты; иначе — фоллбек по топ-цитатам месяца.
 */

const MIN_QUOTES_FOR_REPORT = 3;
const TOP_QUOTES_LIMIT = 20;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const getIsoWeek = (date) => {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
};

/** Границы предыдущего календарного месяца (МСК) в реальных UTC-инстантах. */
const getPreviousMonthRange = (now = new Date()) => {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const curMonthStartMsk = new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), 1)
  );
  const prevMonthStartMsk = new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth() - 1, 1)
  );
  const startUtc = new Date(prevMonthStartMsk.getTime() - MSK_OFFSET_MS);
  const endUtc = new Date(curMonthStartMsk.getTime() - MSK_OFFSET_MS);
  return {
    startUtc,
    endUtc,
    month: prevMonthStartMsk.getUTCMonth() + 1, // 1-12
    year: prevMonthStartMsk.getUTCFullYear(),
  };
};

const uniq = (arr) => [...new Set(arr)];

/** Топ-N частых элементов массива (по убыванию частоты). */
const topByFrequency = (items, n) => {
  const counts = new Map();
  for (const raw of items) {
    const key = String(raw || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
};

/**
 * Прогон месячных отчётов.
 * @param {object} options
 * @param {boolean} options.force
 * @param {string|null} options.userId
 * @returns {Promise<number>}
 */
const runMonthlyReports = async ({ force = false, userId = null } = {}) => {
  const { startUtc, endUtc, month, year } = getPreviousMonthRange();

  const userFilter = { aiConsent: true, isDeleted: { $ne: true } };
  if (userId) userFilter._id = userId;

  const users = await User.find(userFilter)
    .select('_id name aiConsent createdAt')
    .lean();

  logger.info('Monthly report job started', {
    users: users.length,
    month,
    year,
    force,
  });

  let created = 0;

  for (const user of users) {
    try {
      if (!force && user.createdAt && new Date(user.createdAt) >= startUtc) {
        continue;
      }

      if (!force) {
        const existing = await MonthlyReport.findOne({
          userId: user._id,
          year,
          month,
        })
          .select('_id')
          .lean();
        if (existing) continue;
      }

      const quotes = await Quote.find({
        userId: user._id,
        createdAt: { $gte: startUtc, $lt: endUtc },
      })
        .sort({ createdAt: 1 })
        .lean();

      if (force) {
        if (quotes.length === 0) continue;
      } else if (quotes.length < MIN_QUOTES_FOR_REPORT) {
        continue;
      }

      // Недельные отчёты этого месяца (для агрегата).
      const weeklyReports = await WeeklyReport.find({
        userId: user._id,
        startDate: { $gte: startUtc, $lt: endUtc },
      })
        .sort({ startDate: 1 })
        .select('insights dominantThemes emotionalTone')
        .lean();

      // Топ-цитаты месяца (фоллбек, если недельных < 2). Свежие сверху.
      const topQuotes = [...quotes]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, TOP_QUOTES_LIMIT);

      // Метрики месяца.
      const uniqueAuthors = new Set(
        quotes.map((q) => (q.author || '').trim()).filter(Boolean)
      ).size;
      const activeDays = new Set(
        quotes.map((q) =>
          Math.floor((new Date(q.createdAt).getTime() + MSK_OFFSET_MS) / DAY_MS)
        )
      ).size;
      const weeksActive = new Set(
        quotes.map((q) => {
          const w = getIsoWeek(new Date(new Date(q.createdAt).getTime() + MSK_OFFSET_MS));
          return `${w.year}-${w.weekNumber}`;
        })
      ).size;

      const quoteThemes = quotes.flatMap(
        (q) => (q.aiAnalysis && q.aiAnalysis.themes) || []
      );
      const weeklyThemes = weeklyReports.flatMap((r) => r.dominantThemes || []);
      const topThemes = topByFrequency([...weeklyThemes, ...quoteThemes], 5);

      const emotionalTrend = weeklyReports
        .map((r) => r.emotionalTone)
        .filter(Boolean)
        .join(' → ');

      const metrics = {
        month,
        totalQuotes: quotes.length,
        uniqueAuthors,
        weeksActive,
        topThemes,
        emotionalTrend,
      };

      const ai = await generateMonthlyReport(user, {
        weeklyReports,
        topQuotes,
        metrics,
      });

      // Рекомендации: топ-темы месяца + категории цитат.
      const categories = uniq(
        quotes.map((q) => q.aiAnalysis && q.aiAnalysis.category).filter(Boolean)
      );
      const excludeBookIds = uniq(quotes.map((q) => q.bookId).filter(Boolean));
      const recommendations = await resolveRecommendations({
        themes: topThemes,
        categories,
        excludeBookIds,
        limit: 3,
      });

      await MonthlyReport.findOneAndUpdate(
        { userId: user._id, year, month },
        {
          $set: {
            startDate: startUtc,
            endDate: endUtc,
            insights: ai.insights,
            recommendations,
            stats: {
              quotesCount: quotes.length,
              uniqueAuthors,
              activeDays,
              weeksActive,
            },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      created += 1;

      // Push «месячный отчёт готов». Текст/вкл — из редактируемой настройки
      // (notification-setting), гейтится ещё и личной настройкой reports.
      const mTpl = await getNotif('monthly_report');
      if (mTpl.enabled) {
        pushService
          .sendToUser(
            user._id,
            {
              title: mTpl.title,
              body: mTpl.body,
              data: {
                type: 'monthly_report',
                year: String(year),
                month: String(month),
              },
            },
            'reports'
          )
          .catch(() => {});
      }
    } catch (err) {
      logger.error('Monthly report failed for user', {
        userId: String(user._id),
        message: err.message,
      });
    }
  }

  logger.info('Monthly report job finished', { reports: created });
  return created;
};

/** Планировщик. Вызывается один раз при старте сервера (server.js). */
const scheduleMonthlyReports = () => {
  // 1-е число 10:00 по Москве (за прошедший месяц).
  cron.schedule(
    '0 10 1 * *',
    () => {
      runMonthlyReports().catch((err) => {
        logger.error('Monthly report cron error', { message: err.message });
      });
    },
    { timezone: 'Europe/Moscow' }
  );

  logger.info('Monthly report cron scheduled (1st 10:00 Europe/Moscow)');
};

module.exports = {
  runMonthlyReports,
  scheduleMonthlyReports,
  getPreviousMonthRange,
};
