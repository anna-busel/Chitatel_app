/**
 * Платные разборы со слагом через дефис → слаг через подчёркивание.
 *
 * Зачем (13.10.2026): ID товара Apple = book.<slug>, а Apple принимает в нём
 * только буквы, цифры, «_» и «.». Админка до этой даты делала слаги через
 * дефис («k-vostoku-ot-edema»), и такие разборы невозможно завести в App Store
 * Connect. Сервер при покупке ищет разбор по slug из ID товара, поэтому
 * менять приходится сам slug, а не только appleProductId.
 *
 * Что делает для каждого платного НЕклубного разбора с «-» в slug:
 *   - переименовывает папки на диске: <AUDIO>/<slug>/ и <AUDIO>/book-covers/<slug>/;
 *   - parts[].audioFilename, previewAudioFilename — новый префикс папки;
 *   - coverImageUrl — заново подписанный URL на новый путь;
 *   - bookSlug и appleProductId = book.<новый slug>;
 *   - Purchase.itemId/appleProductId (ручные выдачи) и Package.bookSlugs.
 *
 * Клубные и бесплатные разборы НЕ трогает (у них нет товара в Apple).
 * Если новый slug занят или папка-назначение уже есть — разбор пропускается.
 *
 * ЗАПУСК:
 *   cd server
 *   node src/scripts/fix-hyphen-slugs.js           # только показать
 *   node src/scripts/fix-hyphen-slugs.js --apply   # выполнить
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');
const imageService = require('../services/image.service');
const Book = require('../models/Book');
const Package = require('../models/Package');
const Purchase = require('../models/Purchase');

const APPLY = process.argv.includes('--apply');
const BASE = config.audio.basePath;

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch (_e) {
    return false;
  }
}

// '/images/book-covers/<slug>/<file>?exp=..' → '<file>'
function coverFileName(url, oldSlug) {
  if (!url || !url.includes('/images/')) return null;
  try {
    const parts = new URL(url).pathname.split('/').map(decodeURIComponent);
    const i = parts.indexOf('book-covers');
    if (i < 0 || parts[i + 1] !== oldSlug) return null;
    return parts[i + 2] || null;
  } catch (_e) {
    return null;
  }
}

function swapPrefix(rel, oldSlug, newSlug) {
  if (!rel) return rel;
  return rel.startsWith(`${oldSlug}/`) ? `${newSlug}/${rel.slice(oldSlug.length + 1)}` : rel;
}

async function main() {
  console.log(`=== Слаги с дефисом → подчёркивание  |  ${APPLY ? 'ЗАПИСЬ' : 'только показать'} ===`);
  console.log(`Папка файлов: ${BASE}\n`);
  await mongoose.connect(config.mongoUri);

  const books = await Book.find({
    isFree: false,
    isPartOfClub: { $ne: true },
    bookSlug: /-/,
  });

  if (!books.length) {
    console.log('Таких разборов нет — делать нечего.');
    return;
  }

  for (const book of books) {
    const oldSlug = book.bookSlug;
    const newSlug = oldSlug.replace(/-+/g, '_');
    console.log(`«${book.title}»: ${oldSlug} → ${newSlug}`);

    if (await Book.exists({ bookSlug: newSlug, _id: { $ne: book._id } })) {
      console.log('  ! slug занят другим разбором — пропуск');
      continue;
    }

    const audioOld = path.join(BASE, oldSlug);
    const audioNew = path.join(BASE, newSlug);
    const coverOld = path.join(BASE, 'book-covers', oldSlug);
    const coverNew = path.join(BASE, 'book-covers', newSlug);
    if (exists(audioNew) || exists(coverNew)) {
      console.log('  ! папка с новым именем уже есть на диске — пропуск');
      continue;
    }

    const coverFile = coverFileName(book.coverImageUrl, oldSlug);
    console.log(
      `  аудио: ${exists(audioOld) ? 'папка есть' : 'папки нет'}, частей ${book.parts.length}; ` +
        `обложка: ${exists(coverOld) ? 'папка есть' : 'папки нет'}${coverFile ? '' : ' (URL не на сервере — не трогаем)'}`
    );

    if (!APPLY) continue;

    // 1) Файлы
    const renamed = [];
    try {
      if (exists(audioOld)) {
        fs.renameSync(audioOld, audioNew);
        renamed.push([audioNew, audioOld]);
      }
      if (exists(coverOld)) {
        fs.renameSync(coverOld, coverNew);
        renamed.push([coverNew, coverOld]);
      }
    } catch (e) {
      for (const [from, to] of renamed.reverse()) fs.renameSync(from, to);
      console.log(`  ! не удалось переименовать папки: ${e.message} — пропуск`);
      continue;
    }

    // 2) Документ разбора
    try {
      book.parts.forEach((p) => {
        p.audioFilename = swapPrefix(p.audioFilename, oldSlug, newSlug);
      });
      book.previewAudioFilename = swapPrefix(book.previewAudioFilename, oldSlug, newSlug);
      if (coverFile) {
        book.coverImageUrl = imageService.generateImageSignedUrl(
          path.posix.join('book-covers', newSlug, coverFile)
        );
      }
      book.bookSlug = newSlug;
      book.appleProductId = `book.${newSlug}`;
      await book.save();
    } catch (e) {
      for (const [from, to] of renamed.reverse()) fs.renameSync(from, to);
      console.log(`  ! не удалось сохранить разбор: ${e.message} — папки возвращены`);
      continue;
    }

    // 3) Ссылки на slug в других коллекциях
    const pr = await Purchase.updateMany(
      { itemType: 'book', itemId: oldSlug },
      { $set: { itemId: newSlug, appleProductId: `book.${newSlug}` } }
    );
    const pk = await Package.updateMany(
      { bookSlugs: oldSlug },
      { $set: { 'bookSlugs.$': newSlug } }
    );
    console.log(`  готово (покупок: ${pr.modifiedCount}, пакетов: ${pk.modifiedCount})`);
  }

  if (!APPLY) console.log('\nНичего не изменено. Для записи: --apply');
}

main()
  .catch((err) => {
    console.error('\nОШИБКА:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
