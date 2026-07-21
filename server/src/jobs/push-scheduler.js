const cron = require('node-cron');
const logger = require('../config/logger');
const pushService = require('../services/push.service');

/**
 * Планировщик push по расписанию (MASTER 7.9).
 * Вызывается один раз при старте сервера (server.js).
 *
 * Заход 1: напоминание записать цитату (есть настройка reminders).
 * «Мысль дня» и «Q&A сегодня» появятся, когда будет источник контента и
 * соответствующая настройка (доращивание админки, задача 6.6) — сейчас слать
 * их нечем и нечем гейтить, поэтому не планируем.
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

  logger.info(
    'Push cron scheduled (reminders Mon/Wed/Fri/Sun 20:00 Europe/Moscow)'
  );
};

module.exports = { schedulePushJobs };
