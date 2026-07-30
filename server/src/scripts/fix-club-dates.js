/**
 * Одноразовый БЕЗОПАСНЫЙ фикс дат клубов.
 *
 * Использование:
 *   cd server
 *   node src/scripts/fix-club-dates.js
 *
 * Зачем: seed-club.js создавал ClubMonth с ФЕЙКОВЫМИ датами (относительные
 * смещения от даты запуска: «+25 дней» и т.п.), из-за чего клиент показывал
 * неправильный отсчёт («август через 24 дня» вместо 1 августа). Логика клуба
 * (club.js) определяет текущий/архив/ближайший по РЕАЛЬНЫМ окнам дат, поэтому
 * достаточно привести даты к календарю.
 *
 * Что делает: у КАЖДОЙ записи ClubMonth пересчитывает по её year/month:
 *   - startsAt = 1-е число месяца, 00:00
 *   - endsAt   = последний день месяца, 23:59:59
 *   - archiveUntilDate = конец СЛЕДУЮЩЕГО календарного месяца (архив-окно,
 *     как в middleware/subscription.js archiveWindowEnd)
 *   - isActive = true если сейчас внутри [startsAt, endsAt]
 *
 * Что НЕ трогает: bookId, title/author, чат, юзеров, прогресс, покупки.
 * Полностью безопасно на проде.
 */

const mongoose = require('mongoose');
const config = require('../config');
const ClubMonth = require('../models/ClubMonth');

// Границы календарного месяца (month — 1..12).
function monthBounds(year, month) {
  const startsAt = new Date(year, month - 1, 1, 0, 0, 0, 0);
  // day 0 следующего месяца = последний день текущего.
  const endsAt = new Date(year, month, 0, 23, 59, 59, 999);
  // Архив = весь следующий календарный месяц после месяца endsAt.
  const archiveUntilDate = new Date(
    endsAt.getFullYear(),
    endsAt.getMonth() + 2,
    0,
    23,
    59,
    59,
    999
  );
  return { startsAt, endsAt, archiveUntilDate };
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

async function run() {
  console.log('=== Фикс дат клубов (только даты, безопасно) ===');
  await mongoose.connect(config.mongoUri);

  const clubs = await ClubMonth.find({}).sort({ year: 1, month: 1 });
  if (clubs.length === 0) {
    console.log('ClubMonth не найдено — нечего чинить.');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  let fixed = 0;
  for (const c of clubs) {
    const { startsAt, endsAt, archiveUntilDate } = monthBounds(c.year, c.month);
    c.startsAt = startsAt;
    c.endsAt = endsAt;
    c.archiveUntilDate = archiveUntilDate;
    c.isActive = startsAt <= now && now <= endsAt;
    await c.save();
    fixed += 1;
    const mark = c.isActive ? ' [ТЕКУЩИЙ]' : '';
    console.log(
      `${c.year}-${String(c.month).padStart(2, '0')}: ` +
        `${iso(startsAt)} → ${iso(endsAt)} (архив до ${iso(archiveUntilDate)})${mark}`
    );
  }

  console.log(`Готово. Исправлено клубов: ${fixed}`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
