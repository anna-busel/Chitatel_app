/**
 * Импорт аудио разборов из файловой системы в базу (задача 2.x, аудио).
 *
 * Что делает:
 * 1. Сканирует AUDIO_BASE_PATH (config.audio.basePath, обычно /var/audio/chitatel).
 * 2. Для каждой подпапки <slug> с файлами part-1.mp3, part-2.mp3 … находит Book
 *    по bookSlug и записывает parts: { number, title:'Часть N', duration (сек,
 *    из ffprobe), audioFilename:'<slug>/part-N.mp3', isPreviewAvailable:false }.
 *    durationTotal = сумма длительностей.
 * 3. Для ПЛАТНЫХ разборов режет 5-минутное превью из начала part-1.mp3 в
 *    <slug>/preview.mp3 (ffmpeg) и пишет previewAudioFilename/previewDuration.
 *    Бесплатным превью не нужно (играют целиком).
 *
 * Требует: ffmpeg + ffprobe в PATH (проверено: ffmpeg 6.1.1 на VPS).
 *
 * Запуск (из папки server, где работает `npm run seed`):
 *   node src/scripts/import-audio.js            # применить
 *   node src/scripts/import-audio.js --dry-run  # только показать, ничего не писать
 *   node src/scripts/import-audio.js --slug=malenkii_princ  # один разбор
 *
 * Идемпотентно: повторный запуск просто перезаписывает parts из файлов.
 * НЕ трогает книги, у которых нет папки с аудио.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');

const AUDIO_BASE = config.audio.basePath;
const PREVIEW_SECONDS = 300; // 5 минут

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_SLUG = (args.find((a) => a.startsWith('--slug=')) || '').split('=')[1] || null;

/** Длительность аудиофайла в секундах (округлённо) через ffprobe. */
function probeDuration(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
    { encoding: 'utf8' }
  );
  const sec = parseFloat(String(out).trim());
  return Number.isFinite(sec) ? Math.round(sec) : 0;
}

/** Файлы part-N.mp3 в папке, отсортированные по номеру. */
function listParts(dir) {
  return fs
    .readdirSync(dir)
    .map((f) => {
      const m = f.match(/^part-(\d+)\.mp3$/i);
      return m ? { file: f, number: parseInt(m[1], 10) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

/** Режет первые PREVIEW_SECONDS из part-1 в <dir>/preview.mp3. Возвращает имя или null. */
function makePreview(dir, slug, firstPartFile, firstPartDuration) {
  const previewSeconds = Math.min(PREVIEW_SECONDS, firstPartDuration || PREVIEW_SECONDS);
  const src = path.join(dir, firstPartFile);
  const dst = path.join(dir, 'preview.mp3');
  try {
    execFileSync(
      'ffmpeg',
      ['-y', '-i', src, '-t', String(previewSeconds), '-c', 'copy', dst],
      { stdio: 'ignore' }
    );
    return { filename: `${slug}/preview.mp3`, duration: previewSeconds };
  } catch (err) {
    console.log(`    ! превью не нарезалось для ${slug}: ${err.message}`);
    return null;
  }
}

async function run() {
  if (!fs.existsSync(AUDIO_BASE)) {
    console.error(`AUDIO_BASE не найден: ${AUDIO_BASE}`);
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri);
  console.log(`Mongo подключён. AUDIO_BASE = ${AUDIO_BASE}${DRY_RUN ? '  [DRY-RUN]' : ''}`);

  const slugs = fs
    .readdirSync(AUDIO_BASE, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((s) => !ONLY_SLUG || s === ONLY_SLUG)
    .sort();

  let updated = 0;
  const noBook = [];
  const noFiles = [];

  for (const slug of slugs) {
    const dir = path.join(AUDIO_BASE, slug);
    const partFiles = listParts(dir);
    if (partFiles.length === 0) {
      noFiles.push(slug);
      continue;
    }

    const book = await Book.findOne({ bookSlug: slug })
      .select('_id title isFree')
      .lean();
    if (!book) {
      noBook.push(slug);
      console.log(`  ! ${slug}: нет книги с таким bookSlug — пропуск`);
      continue;
    }

    const parts = [];
    let total = 0;
    for (const p of partFiles) {
      const duration = probeDuration(path.join(dir, p.file));
      total += duration;
      parts.push({
        number: p.number,
        title: `Часть ${p.number}`,
        duration,
        audioFilename: `${slug}/${p.file}`,
        isPreviewAvailable: false,
      });
    }

    // Превью только для платных.
    let preview = null;
    if (!book.isFree) {
      if (DRY_RUN) {
        preview = { filename: `${slug}/preview.mp3`, duration: Math.min(PREVIEW_SECONDS, parts[0].duration) };
      } else {
        preview = makePreview(dir, slug, partFiles[0].file, parts[0].duration);
      }
    }

    console.log(
      `  ${slug} (${book.title}): ${parts.length} частей, ${Math.round(total / 60)} мин` +
        (preview ? `, превью ${preview.duration}с` : book.isFree ? ', превью не нужно (бесплатный)' : '')
    );

    if (DRY_RUN) continue;

    await Book.updateOne(
      { _id: book._id },
      {
        $set: {
          parts,
          durationTotal: total,
          previewAudioFilename: preview ? preview.filename : null,
          previewDuration: preview ? preview.duration : 0,
        },
      }
    );
    updated += 1;
  }

  console.log('\n=== Итого ===');
  console.log(`  Обновлено разборов: ${updated}${DRY_RUN ? ' (dry-run: 0 записано)' : ''}`);
  if (noFiles.length) console.log(`  Папки без part-*.mp3: ${noFiles.join(', ')}`);
  if (noBook.length) console.log(`  Нет книги по bookSlug: ${noBook.join(', ')}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Импорт упал:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
