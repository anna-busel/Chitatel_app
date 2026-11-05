/**
 * Пересчёт ClubMonth.archiveUntilDate по правилу «месяц клуба + следующий
 * месяц» (05.11.2026). Чинит клубы, заведённые через админку: из-за пояса
 * сервера им записывался архив на месяц длиннее (октябрь — до 31.12 вместо
 * 30.11). Доступ после исправления в subscription.js считается правильно и без
 * этого скрипта; поле нужно для списка клубов и надписи «Архив до …».
 *
 * Использование (на сервере):
 *   cd server
 *   node src/scripts/fix-archive-dates.js          — только показать «было → станет»
 *   node src/scripts/fix-archive-dates.js --apply  — записать
 *
 * Трогает только archiveUntilDate. Даты клуба, чат, доступы — не меняет.
 */
const mongoose = require('mongoose');
const config = require('../config');
const ClubMonth = require('../models/ClubMonth');
const { archiveWindowEnd } = require('../middleware/subscription');

const APPLY = process.argv.includes('--apply');

function msk(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}

async function run() {
  await mongoose.connect(config.mongoUri);
  const clubs = await ClubMonth.find({}).sort({ year: 1, month: 1 });
  let changed = 0;
  for (const c of clubs) {
    const next = archiveWindowEnd(c.endsAt);
    const prev = c.archiveUntilDate;
    const same = prev && new Date(prev).getTime() === next.getTime();
    console.log(
      `${c.year}-${String(c.month).padStart(2, '0')}: архив до ${msk(prev)} → ${msk(next)}` +
        (same ? '' : '  ← меняется')
    );
    if (!same) {
      changed += 1;
      if (APPLY) {
        c.archiveUntilDate = next;
        await c.save();
      }
    }
  }
  console.log(
    APPLY ? `Записано: ${changed}` : `Будет изменено: ${changed}. Запустите с --apply, чтобы записать.`
  );
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
