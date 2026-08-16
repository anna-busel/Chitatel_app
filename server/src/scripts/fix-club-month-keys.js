/**
 * Починка ключей клубных месяцев в User.clubMonthsEntitled (аудит P7).
 *
 * Использование:
 *   cd server
 *   node src/scripts/fix-club-month-keys.js
 *
 * Проблема: admin-users.js (ручная выдача подписки) писал ключи вида
 * 'YYYY-0M' (с ведущим нулём), а middleware/subscription.js сравнивает с
 * clubMonthKey = `${club.year}-${club.month}` → 'YYYY-M'. Из-за этого доступ
 * к клубу января–сентября по выданной вручную подписке не открывался.
 *
 * Скрипт проходит по всем юзерам с непустым clubMonthsEntitled, заменяет
 * 'YYYY-0M' → 'YYYY-M', убирает дубли и сохраняет updateOne.
 * Идемпотентно. Трогает ТОЛЬКО поле clubMonthsEntitled.
 */

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');

// 'YYYY-0M' → 'YYYY-M'; остальные ключи как есть.
function normalizeKey(key) {
  const m = /^(\d{4})-0(\d)$/.exec(String(key));
  return m ? `${m[1]}-${m[2]}` : key;
}

async function run() {
  console.log('=== Починка ключей clubMonthsEntitled (YYYY-0M → YYYY-M) ===');

  await mongoose.connect(config.mongoUri);

  const users = await User.find({ 'clubMonthsEntitled.0': { $exists: true } })
    .select('clubMonthsEntitled')
    .lean();
  console.log(`Юзеров с clubMonthsEntitled: ${users.length}`);

  let updated = 0;
  for (const u of users) {
    const before = u.clubMonthsEntitled || [];
    const after = [...new Set(before.map(normalizeKey))];
    const changed =
      before.length !== after.length || before.some((k, i) => k !== after[i]);
    if (!changed) continue;
    // eslint-disable-next-line no-await-in-loop
    await User.updateOne(
      { _id: u._id },
      { $set: { clubMonthsEntitled: after } }
    );
    updated += 1;
    console.log(`  ${u._id}: [${before.join(', ')}] → [${after.join(', ')}]`);
  }
  console.log(`Обновлено юзеров: ${updated}`);

  await mongoose.disconnect();
  console.log('Готово.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
