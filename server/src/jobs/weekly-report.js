const cron = require('node-cron');
const logger = require('../config/logger');
const User = require('../models/User');
const Quote = require('../models/Quote');
const WeeklyReport = require('../models/WeeklyReport');
const {
  generateWeeklyReport,
  resolveRecommendations,
} = require('../services/ai.service');
const pushService = require('../services/push.service');

/**
 * Еженедельный ИИ-отчёт (промпт Анны, экран 4.26).
 *
 * Cron: понедельник 10:00 Europe/Moscow — за ПРЕДЫДУЩУЮ завершённую ISO-неделю
 * (пн 00:00 … вс 24:00 МСК). Условия генерации:
 *   - у юзера aiConsent === true;
 *   - юзер зарегистрирован ДО начала недели (иначе отчёт был бы «тонким»);
 *   - за неделю сохранено >= 3 цитат.
 *
 * Идемпотентность: если отчёт за (userId, year, weekNumber) уже есть — юзер
 * пропускается (без повторного вызова OpenAI). Это делает фоновый catch-up
 * при старте сервера дешёвым: он до-генерирует только пропущенные отчёты.
 * force=true (админ-триггер) генерирует заново и игнорирует порог/регистрацию.
 */

const MIN_QUOTES_FOR_REPORT = 3;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // Москва = UTC+3, без DST
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO-номер недели (1-53) и ISO-год для даты (по UTC-полям). */
const getIsoWeek = (date) => {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7; // пн=1 … вс=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // четверг этой недели определяет год/номер
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
  return { weekNumber, year: d.getUTCFullYear() };
};

/**
 * Границы предыдущей завершённой ISO-недели в МСК, приведённые к реальным
 * UTC-инстантам (для запроса по createdAt, который хранится в UTC).
 */
const getPreviousIsoWeekRange = (now = new Date()) => {
  // «Стенные часы» МСК: сдвигаем UTC на +3 и читаем UTC-полями.
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const dow = msk.getUTCDay() || 7; // пн=1 … вс=7
  // Понедельник 00:00 текущей недели (в МСК-календаре).
  const curMonMsk = new Date(
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate())
  );
  curMonMsk.setUTCDate(curMonMsk.getUTCDate() - (dow - 1));
  // Предыдущая неделя: [prevMon, curMon).
  const prevMonMsk = new Date(curMonMsk.getTime() - 7 * DAY_MS);

  const startUtc = new Date(prevMonMsk.getTime() - MSK_OFFSET_MS);
  const endUtc = new Date(curMonMsk.getTime() - MSK_OFFSET_MS);
  const { weekNumber, year } = getIsoWeek(prevMonMsk);
  return { startUtc, endUtc, weekNumber, year };
};

/** Ключ календарного дня (МСК) — для подсчёта активных дней недели. */
const mskDayKey = (date) =>
  Math.floor((new Date(date).getTime() + MSK_OFFSET_MS) / DAY_MS);

const uniq = (arr) => [...new Set(arr)];

/**
 * Прогон отчётов.
 * @param {object} options
 * @param {boolean} options.force - генерировать заново и без порога/регистрации (тест)
 * @param {string|null} options.userId - только один юзер (админ-триггер)
 * @returns {Promise<number>} сколько отчётов создано/обновлено
 */
const runWeeklyReports = async ({ force = false, userId = null } = {}) => {
  const { startUtc, endUtc, weekNumber, year } = getPreviousIsoWeekRange();

  const userFilter = { aiConsent: true, isDeleted: { $ne: true } };
  if (userId) userFilter._id = userId;

  const users = await User.find(userFilter)
    .select('_id name aiConsent createdAt')
    .lean();

  logger.info('Weekly report job started', {
    users: users.length,
    weekNumber,
    year,
    force,
  });

  let created = 0;

  for (const user of users) {
    try {
      // Гейт регистрации: отчёт только тем, кто был в приложении всю неделю.
      if (!force && user.createdAt && new Date(user.createdAt) >= startUtc) {
        continue;
      }

      // Идемпотентность: уже есть отчёт за эту неделю — пропускаем.
      if (!force) {
        const existing = await WeeklyReport.findOne({
          userId: user._id,
          year,
          weekNumber,
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

      // Порог; при force разрешаем от 1 цитаты (для теста), но не по нулю.
      if (force) {
        if (quotes.length === 0) continue;
      } else if (quotes.length < MIN_QUOTES_FOR_REPORT) {
        continue;
      }

      // Текст прошлого отчёта — для абзаца «динамика по сравнению с прошлой неделей».
      const prev = await WeeklyReport.findOne({
        userId: user._id,
        startDate: { $lt: startUtc },
      })
        .sort({ startDate: -1 })
        .select('insights')
        .lean();
      const previousReportText = (prev && prev.insights) || '';

      const ai = await generateWeeklyReport(user, quotes, previousReportText);

      // Рекомендации: темы отчёта + темы/категории цитат недели.
      const themes = uniq([
        ...ai.dominantThemes,
        ...quotes.flatMap((q) => (q.aiAnalysis && q.aiAnalysis.themes) || []),
      ]);
      const categories = uniq(
        quotes
          .map((q) => q.aiAnalysis && q.aiAnalysis.category)
          .filter(Boolean)
      );
      const excludeBookIds = uniq(
        quotes.map((q) => q.bookId).filter(Boolean)
      );
      const recommendations = await resolveRecommendations({
        themes,
        categories,
        excludeBookIds,
        limit: 3,
      });

      const uniqueAuthors = new Set(
        quotes.map((q) => (q.author || '').trim()).filter(Boolean)
      ).size;
      const activeDays = new Set(quotes.map((q) => mskDayKey(q.createdAt))).size;

      await WeeklyReport.findOneAndUpdate(
        { userId: user._id, year, weekNumber },
        {
          $set: {
            startDate: startUtc,
            endDate: endUtc,
            insights: ai.insights,
            dominantThemes: ai.dominantThemes,
            emotionalTone: ai.emotionalTone,
            recommendations,
            stats: {
              quotesCount: quotes.length,
              uniqueAuthors,
              activeDays,
            },
            quotes: quotes.map((q) => q._id),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      created += 1;

      // Push «отчёт готов». Гейтится настройкой reports (Отчёты).
      pushService
        .sendToUser(
          user._id,
          {
            title: 'Ваш отчёт за неделю готов',
            body: 'Анна разобрала ваши цитаты — почитайте',
            data: {
              type: 'weekly_report',
              year: String(year),
              week: String(weekNumber),
            },
          },
          'reports'
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
  // Понедельник 10:00 по Москве (за прошедшую неделю).
  cron.schedule(
    '0 10 * * 1',
    () => {
      runWeeklyReports().catch((err) => {
        logger.error('Weekly report cron error', { message: err.message });
      });
    },
    { timezone: 'Europe/Moscow' }
  );

  logger.info('Weekly report cron scheduled (Mon 10:00 Europe/Moscow)');
};

module.exports = { runWeeklyReports, scheduleWeeklyReports, getPreviousIsoWeekRange };
