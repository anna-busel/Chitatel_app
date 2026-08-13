const cron = require('node-cron');
const logger = require('../config/logger');
const pushService = require('../services/push.service');
const { thoughtForDate } = require('../services/thought.service');

/**
 * Планировщик push по расписанию (MASTER 7.9).
 * Вызывается один раз при старте сервера (server.js).
 *
 * Задача 1: напоминание записать цитату (настройка reminders).
 * Задача 2: мысль дня — ежедневно 10:00 (настройка dailyQuote). Текст берём из
 * общего источника thoughtForDate (config/daily-thoughts), поэтому пуш всегда
 * совпадает с карточкой «Мысль дня» на главной.
 * «Q&A сегодня» появится, когда будет расписание Q&A (доращивание админки, 6.6).
 *
 * Всё по Москве (Europe/Moscow) — аудитория клуба РФ/РБ. Пуш по локальному
 * времени пользователя потребовал бы хранить его часовой пояс и слать почасово
 * с фильтром — отдельная задача, не для MVP.
 *
 * ⚠️ PM2 — строго fork mode, 1 инстанс, иначе cron задвоится.
 */

const schedulePushJobs = () => {
  // Напоминание записать цитату — Пн/Ср/Пт/Вс в 20:00 (4 раза в неделю, MASTER 7.9).
  cron.schedule(
    '0 20 * * 1,3,5,0',
    () => {
      pushService
        .broadcast(
          { audience: 'all' },
          {
            title: 'ЧИТАТЕЛЬ',
            body: 'Запишите цитату из сегодняшнего дня',
            data: { type: 'reminder_quote' },
          },
          'reminders'
        )
        .catch((err) => {
          logger.error('Push reminder cron error', { message: err.message });
        });
    },
    { timezone: 'Europe/Moscow' }
  );

  // Мысль дня — ежедневно в 10:00 (MASTER 7.9). Гейт dailyQuote; в ленту не
  // пишем (broadcast) — как и напоминания, это массовая рассылка, а не история.
  // Текст — та же мысль, что показывает карточка на главной в этот день.
  cron.schedule(
    '0 10 * * *',
    () => {
      // thoughtForDate теперь асинхронна (список в БД, config/daily-thoughts —
      // фолбэк). Разворачиваем промис и ловим ошибки чтения БД тоже.
      thoughtForDate(Date.now())
        .then(({ text }) =>
          pushService.broadcast(
            { audience: 'all' },
            {
              title: 'Мысль дня',
              body: text,
              data: { type: 'daily_quote' },
            },
            'dailyQuote'
          )
        )
        .catch((err) => {
          logger.error('Push daily-quote cron error', { message: err.message });
        });
    },
    { timezone: 'Europe/Moscow' }
  );

  logger.info(
    'Push cron scheduled (reminders Mon/Wed/Fri/Sun 20:00; daily quote 10:00; Europe/Moscow)'
  );
};

module.exports = { schedulePushJobs };
