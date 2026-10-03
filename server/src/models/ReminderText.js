const mongoose = require('mongoose');

/**
 * Текст напоминания «Запишите цитату» — одна формулировка из списка, который
 * крутится по кругу (jobs/push-scheduler.js, задача 1).
 *
 * ИСТОРИЯ: до 03.10.2026 текст был один — поле `body` в ReminderSetting. Анна
 * попросила несколько формулировок по очереди, не повторяясь, и правку списка
 * из админки. Сделано по образцу «Мысли дня» (DailyThought): список в БД,
 * config/reminder-texts.js остался сидом и фолбэком.
 *
 * Отличие от DailyThought: у «Мысли дня» ротация детерминированная по дате
 * (одна и та же мысль у всех в течение суток, она же на карточке главной).
 * Здесь показывать нечего — есть только сам пуш, и уходит он не каждый день, а
 * по выбранным дням недели. Привязка к номеру дня перемешала бы очередь,
 * поэтому порядок держит курсор в ReminderSetting.cursor.
 *
 * Поля:
 * - text     — сама формулировка (обязательно);
 * - order    — место в очереди (по возрастанию). Новая обычно = максимум+1;
 * - isActive — выключенные в ротации не участвуют (мягкое скрытие вместо
 *              удаления: Анна может отложить формулировку, не теряя её).
 */
const reminderTextSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Ротация читает активные тексты в стабильном порядке (order, затем _id).
reminderTextSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('ReminderText', reminderTextSchema);
