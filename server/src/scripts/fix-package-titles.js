/**
 * Одноразовый БЕЗОПАСНЫЙ фикс названий пакетов (капс → как во всём каталоге).
 *
 * Использование:
 *   cd server
 *   node src/scripts/fix-package-titles.js
 *
 * Зачем: названия пакетов были заведены капсом и разными кавычками
 * («ЛЮБОВНЫЕ ОТНОШЕНИЯ», «ФАКУЛЬТАТИВ ...»), что расходится с остальным
 * каталогом (обычный регистр, кавычки « »). Приводим к единому виду.
 *
 * Что делает:
 * 1. Точечно правит сам источник — reader-bot-catalog.json — заменой строк
 *    (формат файла сохраняется, меняются только 8 названий), чтобы будущий
 *    `npm run seed` НЕ вернул капс.
 * 2. Обновляет Package.title в БД по packageSlug — чтобы правка применилась
 *    сразу, без полного пересида.
 *
 * Идемпотентно: повторный запуск безопасен (уже применённые замены
 * пропускаются). Ничего кроме названий пакетов не трогает.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');
const Package = require('../models/Package');

// Точечные замены для JSON-источника (старая подстрока → новая).
// Старые строки взяты РОВНО как в файле (внутренние " экранированы как \",
// у части названий — «кудрявые» кавычки “ ”).
const RAW_REPLACEMENTS = [
  ['Пакет разборов \\"Я - ЖЕНЩИНА\\"', 'Пакет разборов «Я — женщина»'],
  ['Пакет разборов \\"ЛЮБОВНЫЕ ОТНОШЕНИЯ\\"', 'Пакет разборов «Любовные отношения»'],
  ['Пакет разборов “ДОСТИЖЕНИЕ ЦЕЛЕЙ”', 'Пакет разборов «Достижение целей»'],
  ['Пакет разборов “КАК ПОНЯТЬ СЕБЯ?”', 'Пакет разборов «Как понять себя?»'],
  ['ФАКУЛЬТАТИВ «Федор Достоевский»', 'Факультатив «Фёдор Достоевский»'],
  ['ФАКУЛЬТАТИВ «Лев Толстой»', 'Факультатив «Лев Толстой»'],
  ['ФАКУЛЬТАТИВ «Зарубежная классика»', 'Факультатив «Зарубежная классика»'],
  ['ФАКУЛЬТАТИВ «Русская классика»', 'Факультатив «Русская классика»'],
];

// Итоговые названия по packageSlug — для обновления БД.
const RENAMES = {
  paket_woman: 'Пакет разборов «Я — женщина»',
  paket_love_rel: 'Пакет разборов «Любовные отношения»',
  paket_goals_ach: 'Пакет разборов «Достижение целей»',
  paket_understand_yourself: 'Пакет разборов «Как понять себя?»',
  facultativ_dostoevsky: 'Факультатив «Фёдор Достоевский»',
  facultativ_tolstoy: 'Факультатив «Лев Толстой»',
  facultativ_foreign: 'Факультатив «Зарубежная классика»',
  facultativ_russian: 'Факультатив «Русская классика»',
};

async function run() {
  console.log('=== Фикс названий пакетов (капс → каталог) ===');

  // 1) Правим сам источник reader-bot-catalog.json.
  const jsonPath = path.join(__dirname, 'reader-bot-catalog.json');
  let raw = fs.readFileSync(jsonPath, 'utf8');
  let jsonChanged = 0;
  for (const [oldS, newS] of RAW_REPLACEMENTS) {
    const count = raw.split(oldS).length - 1;
    if (count === 1) {
      raw = raw.split(oldS).join(newS);
      jsonChanged += 1;
    } else if (count === 0) {
      // Уже заменено (идемпотентность) — пропускаем.
    } else {
      console.log(`  ! Неоднозначная замена (${count}): ${oldS}`);
    }
  }
  if (jsonChanged > 0) {
    fs.writeFileSync(jsonPath, raw, 'utf8');
  }
  console.log(`JSON-источник: заменено названий ${jsonChanged} (0 = уже поправлен ранее)`);

  // 2) Обновляем названия в БД.
  await mongoose.connect(config.mongoUri);
  let dbChanged = 0;
  for (const [slug, title] of Object.entries(RENAMES)) {
    const res = await Package.updateOne(
      { packageSlug: slug },
      { $set: { title } }
    );
    if (res.modifiedCount > 0) dbChanged += 1;
    const mark = res.matchedCount === 0 ? '  (нет в БД)' : '';
    console.log(`  ${slug} → ${title}${mark}`);
  }
  console.log(`БД: обновлено названий ${dbChanged}`);

  await mongoose.disconnect();
  console.log('Готово.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
