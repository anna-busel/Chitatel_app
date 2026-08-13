const DailyThought = require('../models/DailyThought');
const { THOUGHTS } = require('../config/daily-thoughts');

/**
 * Сервис «Мысли дня».
 *
 * Единый источник для карточки на главной (routes/home.js) и ежедневного push
 * (jobs/push-scheduler.js) — поэтому карточка и пуш всегда показывают одну и ту же
 * мысль в один и тот же день.
 *
 * Ротация — детерминированная по дню по московской границе суток: dayIndex по
 * кругу через все АКТИВНЫЕ фразы, отсортированные (order, _id). Тот же алгоритм,
 * что был в config/daily-thoughts.js, только список берётся из БД.
 *
 * Фолбэк: если коллекция DailyThought пуста (БД ещё не засеяна), используется
 * статический список из config/daily-thoughts.js — ничего не ломается до
 * первого захода в админку.
 */

// Смещение к МСК (+3ч): граница суток по Москве (аудитория клуба), чтобы мысль
// менялась в местную полночь, а не в 3 ночи по UTC.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

function normalizeStatic(item) {
  return typeof item === 'string'
    ? { text: item, author: 'Анна Бусел' }
    : { text: item.text, author: item.author };
}

/**
 * Мысль дня на момент nowMs — { text, author }.
 * Асинхронна: читает активные фразы из БД. При ошибке БД или пустом списке —
 * фолбэк на статический config/daily-thoughts.js.
 */
async function thoughtForDate(nowMs) {
  const dayIndex = Math.floor((nowMs + MSK_OFFSET_MS) / 86400000);

  let list = [];
  try {
    list = await DailyThought.find({ isActive: true })
      .sort({ order: 1, _id: 1 })
      .select('text author')
      .lean();
  } catch (_err) {
    list = [];
  }

  if (!list || list.length === 0) {
    const item = THOUGHTS[dayIndex % THOUGHTS.length];
    return normalizeStatic(item);
  }

  const item = list[dayIndex % list.length];
  return { text: item.text, author: item.author || 'Анна Бусел' };
}

/**
 * Засеять коллекцию из статического списка, если она пуста. Идемпотентно:
 * если хоть одна фраза уже есть — ничего не делает. Возвращает число фраз в
 * коллекции после вызова.
 */
async function ensureSeeded() {
  const count = await DailyThought.estimatedDocumentCount();
  if (count > 0) return count;

  const docs = THOUGHTS.map((item, i) => {
    const n = normalizeStatic(item);
    return { text: n.text, author: n.author, order: i, isActive: true };
  });
  await DailyThought.insertMany(docs);
  return docs.length;
}

module.exports = { thoughtForDate, ensureSeeded, MSK_OFFSET_MS };
