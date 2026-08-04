/**
 * Одноразовый БЕЗОПАСНЫЙ фикс: убрать автора «Анна Бусел» у биографий.
 *
 * Использование:
 *   cd server
 *   node src/scripts/fix-biography-authors.js
 *
 * Зачем: у разборов-биографий («Биография Достоевского», «Биография Льва
 * Толстого», «Биография Владимира Набокова») в поле author стояло «Анна Бусел».
 * По просьбе Анны автора у биографий убираем — они показываются без автора.
 *
 * Что делает:
 * 1. Точечно правит источники, чтобы будущий `npm run seed` НЕ вернул автора:
 *    - reader-bot-catalog.json — платные биографии (Толстой, Набоков);
 *    - seed.js (FREE_BOOKS) — бесплатная «Биография Достоевского».
 * 2. Обновляет Book.author у всех биографий в БД (author «Анна Бусел» → ''),
 *    чтобы правка применилась сразу, без полного пересида.
 *
 * Идемпотентно: повторный запуск безопасен. Ничего кроме автора биографий
 * (author === 'Анна Бусел') не трогает.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');

const AUTHOR = 'Анна Бусел';

async function run() {
  console.log('=== Фикс: убрать автора «Анна Бусел» у биографий ===');

  // 1a) reader-bot-catalog.json — платные биографии (Толстой, Набоков).
  const jsonPath = path.join(__dirname, 'reader-bot-catalog.json');
  let rawJson = fs.readFileSync(jsonPath, 'utf8');
  const jsonNeedle = `"author":"${AUTHOR}"`;
  const jsonCount = rawJson.split(jsonNeedle).length - 1;
  if (jsonCount > 0) {
    rawJson = rawJson.split(jsonNeedle).join('"author":""');
    fs.writeFileSync(jsonPath, rawJson, 'utf8');
  }
  console.log(`JSON-источник: заменено авторов ${jsonCount} (0 = уже поправлен ранее)`);

  // 1b) seed.js — бесплатная «Биография Достоевского» в FREE_BOOKS.
  const seedPath = path.join(__dirname, 'seed.js');
  let rawSeed = fs.readFileSync(seedPath, 'utf8');
  const seedNeedle = `author: '${AUTHOR}',`;
  const seedCount = rawSeed.split(seedNeedle).length - 1;
  if (seedCount > 0) {
    rawSeed = rawSeed.split(seedNeedle).join("author: '',");
    fs.writeFileSync(seedPath, rawSeed, 'utf8');
  }
  console.log(`seed.js: заменено авторов ${seedCount} (0 = уже поправлен ранее)`);

  // 2) БД — все биографии (author === 'Анна Бусел') → пустой автор.
  await mongoose.connect(config.mongoUri);
  const res = await Book.updateMany(
    { author: AUTHOR },
    { $set: { author: '' } }
  );
  console.log(`БД: обновлено книг ${res.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Готово.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
