const cron = require('node-cron');
const logger = require('../config/logger');
const pushService = require('../services/push.service');
const { thoughtForDate } = require('../services/thought.service');
const { getReminderSetting, reminderCron } = require('../services/reminder.service');
const { getNotif } = require('../services/notification-setting.service');

/**
 * Планировщик push по расписанию (MASTER 7.9).
 * Вызывается один раз при старте сервера (server.js).
 *
 * Задача 1: напоминание записать цитату. Текст, время и дни берутся из БД
 * (ReminderSetting) и редактируются в админке (раздел «Уведомления»). При
 * сохранении в админке cron перепланируется на лету (reloadReminder).
 * Задача 2: мысль дня — ежедневно 10:00. Текст из общего источника
 * thoughtForDate (services/thought.service), поэтому пуш всегда совпадает с
 * карточкой «Мысль дня» на главной.
 *
 * Всё по Москве (Europe/Moscow) — аудитория клуба РФ/РБ. Пуш по локальному
 * времени пользователя потребовал бы хранить его часовой пояс и слать почасово
 * с фильтром — отдельная задача, не для MVP.
 *
 * ⚠️ PM2 — строго fork mode, 1 инстанс, иначе cron задвоится.
 */

// Ссылки на текущие cron-задачи — чтобы останавливать и пересоздавать при
// смене расписания из админки (по одной на процесс).
let reminderTask = null;
let dailyQuoteTask = null;

/**
 * (Пере)создать cron напоминания из текущей настройки БД. Текст и флаг enabled
 * дополнительно перечитываются в момент срабатывания — чтобы правка текста/
 * выключения применялась мгновенно даже без перепланирования.
 */
async function scheduleReminder() {
  const setting = await getReminderSetting();

  if (reminderTask) {
    reminderTask.stop();
    reminderTask = null;
  }

  const expr = reminderCron(setting);
  reminderTask = cron.schedule(
    expr,
    () => {
      getReminderSetting()
        .then((cur) => {
          if (!cur.enabled) return null;
          return pushService.broadcast(
            { audience: 'all' },
            {
              title: cur.title || 'ЧИТАТЕЛЬ',
              body: cur.body,
              data: { type: 'reminder_quote' },
            },
            'reminders'
          );
        })
        .catch((err) => {
          logger.error('Push reminder cron error', { message: err.message });
        });
    },
    { timezone: 'Europe/Moscow' }
  );

  logger.info(
    `Reminder cron scheduled: \"${expr}\" (enabled=${setting.enabled}) Europe/Moscow`
  );
}

/**
 * Пересоздать напоминание после правки настройки в админке (вызывается из
 * routes/admin-notifications.js). Живёт в том же процессе — прямой вызов.
 */
async function reloadReminder() {
  await scheduleReminder();
}

/**
 * (Пере)создать cron мысли дня из редактируемой настройки (notification-setting:
 * daily_quote — время, заголовок, вкл/выкл). Тело — сама мысль дня из общего
 * источника thoughtForDate, поэтому пуш совпадает с карточкой на главной.
 * Заголовок и enabled перечитываются в момент срабатывания — мгновенная правка.
 */
async function scheduleDailyQuote() {
  const n = await getNotif('daily_quote');

  if (dailyQuoteTask) {
    dailyQuoteTask.stop();
    dailyQuoteTask = null;
  }

  const expr = `${n.minute} ${n.hour} * * *`;
  dailyQuoteTask = cron.schedule(
    expr,
    () => {
      // thoughtForDate асинхронна (список в БД, config/daily-thoughts — фолбэк).
      Promise.all([thoughtForDate(Date.now()), getNotif('daily_quote')])
        .then(([{ text }, cur]) => {
          if (!cur.enabled) return null;
          return pushService.broadcast(
            { audience: 'all' },
            {
              title: cur.title || 'Мысль дня',
              body: text,
              data: { type: 'daily_quote' },
            },
            'dailyQuote'
          );
        })
        .catch((err) => {
          logger.error('Push daily-quote cron error', { message: err.message });
        });
    },
    { timezone: 'Europe/Moscow' }
  );

  logger.info(
    `Daily-quote cron scheduled: \"${expr}\" (enabled=${n.enabled}) Europe/Moscow`
  );
}

/**
 * Пересоздать мысль дня после правки настройки в админке (вызывается из
 * routes/admin-notifications.js). Тот же процесс — прямой вызов.
 */
async function reloadDailyQuote() {
  await scheduleDailyQuote();
}

const schedulePushJobs = async () => {
  // Напоминание записать цитату — из настройки БД (редактируется в админке).
  try {
    await scheduleReminder();
  } catch (err) {
    logger.error('Reminder initial schedule error', { message: err.message });
  }

  // Мысль дня — расписание из настройки БД (редактируется в админке). Гейт
  // dailyQuote; в ленту не пишем (broadcast) — массовая рассылка, не история.
  try {
    await scheduleDailyQuote();
  } catch (err) {
    logger.error('Daily-quote initial schedule error', { message: err.message });
  }

  logger.info(
    'Push cron scheduled (reminder + daily quote configurable; Europe/Moscow)'
  );
};

module.exports = { schedulePushJobs, reloadReminder, reloadDailyQuote };
