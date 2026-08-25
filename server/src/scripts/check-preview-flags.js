/**
 * Диагностика: у каких платных книг части помечены isPreviewAvailable.
 * Часть с этим флагом отдаётся ЦЕЛИКОМ без авторизации (routes/books.js,
 * checkPartAccess) — допустимо максимум для части №1 как ознакомительной.
 *
 * Запуск: node src/scripts/check-preview-flags.js
 * Только читает базу, ничего не меняет.
 */
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');

(async () => {
  await mongoose.connect(config.mongoUri);
  const books = await Book.find({ isPublished: true, isFree: false })
    .select('title parts.number parts.isPreviewAvailable')
    .lean();

  let flagged = 0;
  let multi = 0;
  for (const b of books) {
    const parts = b.parts || [];
    const open = parts.filter((p) => p.isPreviewAvailable);
    if (open.length === 0) continue;
    flagged++;
    const nums = open.map((p) => p.number).join(', ');
    const warn = open.length > 1 || (open.length === 1 && open[0].number !== 1);
    if (warn) multi++;
    console.log(
      (warn ? 'PROBLEM  ' : 'ok       ') +
        b.title +
        ' — открыты части: ' +
        nums +
        ' (всего частей: ' +
        parts.length +
        ')'
    );
  }

  console.log('---');
  console.log('Платных книг: ' + books.length);
  console.log('С флагом хоть на одной части: ' + flagged);
  console.log(
    multi === 0
      ? 'ИТОГ: дыры нет — открыта максимум первая часть.'
      : 'ИТОГ: ПРОБЛЕМНЫХ КНИГ ' + multi + ' — открыты не только первые части!'
  );
  await mongoose.disconnect();
})();
