/**
 * Скрыть из каталога разборы, у которых пока НЕТ аудио (обратимо).
 *
 * Использование:
 *   cd server
 *   node src/scripts/hide-pending-audio.js          # скрыть (isPublished=false)
 *   node src/scripts/hide-pending-audio.js --show    # вернуть (isPublished=true)
 *
 * Список — HIDE_SLUGS ниже. Это разборы без записей (пакет «Факультатив
 * Набоков» убран, аудио к ним не залито). Не удаляем — просто снимаем с
 * публикации, чтобы не висели пустыми. Когда появится аудио: залить + прогнать
 * import-audio, затем `--show` (или убрать слаг из списка и `npm run seed`).
 *
 * ⚠️ Чтобы `npm run seed` не вернул их обратно, те же слаги лежат в
 * HIDDEN_UNTIL_AUDIO в seed.js — держим списки синхронными.
 *
 * Идемпотентно. Трогает ТОЛЬКО поле isPublished перечисленных разборов.
 */

const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');

const HIDE_SLUGS = [
  'ada_ili_otrada',
  'zaschita_luzhina',
  'biografiya_vladimira_nabokova',
  'dar',
  'sobache_serdtse',
];

async function run() {
  const show = process.argv.includes('--show');
  const publish = show;
  console.log(
    `=== ${show ? 'ВЕРНУТЬ' : 'СКРЫТЬ'} разборы без аудио (isPublished=${publish}) ===`
  );

  await mongoose.connect(config.mongoUri);
  const res = await Book.updateMany(
    { bookSlug: { $in: HIDE_SLUGS } },
    { $set: { isPublished: publish } }
  );
  console.log(`Слагов в списке: ${HIDE_SLUGS.length}`);
  console.log(`Найдено в БД: ${res.matchedCount}, обновлено: ${res.modifiedCount}`);

  await mongoose.disconnect();
  console.log('Готово.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
