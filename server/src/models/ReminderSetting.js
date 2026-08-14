const mongoose = require('mongoose');

/**
 * Настройка напоминания «Запишите цитату» (push по расписанию).
 *
 * Раньше текст и расписание были зашиты в jobs/push-scheduler.js. Задача 6.6
 * (админка) вынесла их в БД, чтобы Анна могла менять текст, время и дни без
 * правки кода. Один документ на весь сервер (singleton по ключу `key`).
 *
 * Поля:
 * - key      — идентификатор настройки ('quote_reminder'), уникальный;
 * - title    — заголовок пуша;
 * - body     — текст пуша;
 * - hour     — час отправки (0..23, по Москве);
 * - minute   — минута отправки (0..59);
 * - weekdays — дни недели в нотации cron (0=Вс, 1=Пн, ... 6=Сб);
 * - enabled  — включено ли напоминание.
 */
const reminderSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'quote_reminder', unique: true },
    title: { type: String, default: 'ЧИТАТЕЛЬ', trim: true },
    body: {
      type: String,
      default: 'Запишите цитату из сегодняшнего дня',
      trim: true,
    },
    hour: { type: Number, default: 20, min: 0, max: 23 },
    minute: { type: Number, default: 0, min: 0, max: 59 },
    weekdays: { type: [Number], default: [1, 3, 5, 0] }, // Пн/Ср/Пт/Вс
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ReminderSetting', reminderSettingSchema);
