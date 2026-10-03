const ReminderText = require('../models/ReminderText');
const { REMINDER_TEXTS } = require('../config/reminder-texts');
const { getReminderSetting } = require('./reminder.service');

/**
 * Сервис списка текстов напоминания «Запишите цитату».
 *
 * Зачем: до 03.10.2026 текст был один (ReminderSetting.body). Анна попросила
 * крутить несколько формулировок по кругу, не повторяясь, и править список из
 * админки — как у «Мысли дня».
 *
 * Очередь держит курсор (ReminderSetting.cursor), а не номер дня: напоминание
 * уходит по выбранным дням недели, и счёт от даты перемешал бы порядок. Курсор
 * — индекс того текста, который уйдёт следующим; после отправки сдвигается на
 * 1 по кругу.
 *
 * Фолбэк: коллекция пуста → takeNextText() вернёт null, и планировщик
 * отправит ReminderSetting.body, как было раньше.
 */

/**
 * Активные тексты в стабильном порядке очереди.
 */
async function activeTexts() {
  try {
    return await ReminderText.find({ isActive: true })
      .sort({ order: 1, _id: 1 })
      .select('text')
      .lean();
  } catch (_err) {
    return [];
  }
}

/**
 * Привести курсор к допустимому индексу: список мог сократиться (Анна выключила
 * или удалила формулировки) — тогда курсор мог уехать за конец.
 */
function normalizeCursor(value, length) {
  if (!length) return 0;
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return ((n % length) + length) % length;
}

/**
 * Какой текст уйдёт следующим — БЕЗ сдвига курсора. Для админки.
 * Возвращает строку или null, если список пуст.
 */
async function peekNextText() {
  const list = await activeTexts();
  if (!list.length) return null;

  const setting = await getReminderSetting();
  return list[normalizeCursor(setting.cursor, list.length)].text;
}

/**
 * Взять следующий текст и сдвинуть курсор. Зовёт планировщик в момент
 * отправки. Возвращает строку или null, если список пуст (тогда отправитель
 * берёт ReminderSetting.body).
 */
async function takeNextText() {
  const list = await activeTexts();
  if (!list.length) return null;

  const setting = await getReminderSetting();
  const idx = normalizeCursor(setting.cursor, list.length);

  setting.cursor = (idx + 1) % list.length;
  await setting.save();

  return list[idx].text;
}

/**
 * Засеять коллекцию из статического списка, если она пуста. Идемпотентно:
 * если хоть один текст уже есть — ничего не делает. Возвращает число текстов
 * в коллекции после вызова.
 */
async function ensureSeeded() {
  const count = await ReminderText.estimatedDocumentCount();
  if (count > 0) return count;

  const docs = REMINDER_TEXTS.map((text, i) => ({
    text,
    order: i,
    isActive: true,
  }));
  await ReminderText.insertMany(docs);
  return docs.length;
}

module.exports = { peekNextText, takeNextText, ensureSeeded };
