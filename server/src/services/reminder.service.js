const ReminderSetting = require('../models/ReminderSetting');

/**
 * Сервис настройки напоминания «Запишите цитату».
 *
 * Единственный документ ReminderSetting (singleton по key). Используется и
 * планировщиком (jobs/push-scheduler.js — текст, расписание, вкл/выкл), и
 * админкой (routes/admin-notifications.js — чтение/правка).
 */
const KEY = 'quote_reminder';

/**
 * Вернуть настройку, создав дефолтную при первом обращении (идемпотентно).
 */
async function getReminderSetting() {
  let s = await ReminderSetting.findOne({ key: KEY });
  if (!s) {
    s = await ReminderSetting.create({ key: KEY });
  }
  return s;
}

/**
 * Собрать cron-выражение из настройки: `min hour * * dow`.
 * weekdays пустой → каждый день (*).
 */
function reminderCron(s) {
  const days =
    s.weekdays && s.weekdays.length ? s.weekdays.join(',') : '*';
  return `${s.minute} ${s.hour} * * ${days}`;
}

module.exports = { getReminderSetting, reminderCron, KEY };
