const path = require('path');
const fs = require('fs');
const util = require('util');
const { execFile } = require('child_process');
const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const multer = require('multer');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const imageService = require('../services/image.service');
const Book = require('../models/Book');
const ClubMonth = require('../models/ClubMonth');
const Package = require('../models/Package');

const router = Router();

// Все эндпоинты каталога — только для админа.
router.use(requireAuth, requireAdmin);

const execFileAsync = util.promisify(execFile);

/* ------------------------------------------------------------------ *
 *                     ФИКСИРОВАННЫЕ КАТЕГОРИИ                        *
 * ------------------------------------------------------------------ *
 * Источник истины — app/lib/core/constants/book_categories.dart.
 * В БД категории хранятся КАПСОМ (наследие Telegram-бота Анны), на UI
 * приложения показываются sentence-case. Админка выбирает категорию из
 * ЭТОГО же списка, чтобы значение в Book.categories совпадало с тем, по
 * которому фильтрует каталог (точное сравнение строк). Порядок — как в
 * приложении (по частоте использования). */
const CATEGORIES = [
  { value: 'КРИЗИСЫ', label: 'Кризисы' },
  { value: 'Я — ЖЕНЩИНА', label: 'Я — женщина' },
  { value: 'ЛЮБОВЬ', label: 'Любовь' },
  { value: 'ОТНОШЕНИЯ', label: 'Отношения' },
  { value: 'СЕМЕЙНЫЕ ОТНОШЕНИЯ', label: 'Семейные отношения' },
  { value: 'ПОИСК СЕБЯ', label: 'Поиск себя' },
  { value: 'СМЫСЛ ЖИЗНИ', label: 'Смысл жизни' },
  { value: 'СЧАСТЬЕ', label: 'Счастье' },
  { value: 'ОДИНОЧЕСТВО', label: 'Одиночество' },
  { value: 'СМЕРТЬ', label: 'Смерть' },
  { value: 'ДЕНЬГИ', label: 'Деньги' },
  { value: 'ВРЕМЯ И ПРИВЫЧКИ', label: 'Время и привычки' },
  { value: 'ОБЩЕСТВО', label: 'Общество' },
  { value: 'ДОБРО И ЗЛО', label: 'Добро и зло' },
];
const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

/* ------------------------------------------------------------------ *
 *                       ТРАНСЛИТЕРАЦИЯ SLUG                          *
 * ------------------------------------------------------------------ *
 * bookSlug — идентификатор для ссылок и ИМЯ ПАПКИ с аудио/обложкой на диске
 * (<AUDIO_BASE_PATH>/<slug>/part-N.mp3, book-covers/<slug>/...). Поэтому:
 *  - только латиница/цифры/дефис (безопасно для файловой системы и URL);
 *  - генерируется ОДИН раз при создании книги из title, дальше НЕ меняется
 *    (иначе осиротеют уже загруженные файлы). */
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

function slugify(input) {
  const lower = String(input || '').toLowerCase().trim();
  let out = '';
  for (const ch of lower) {
    if (Object.prototype.hasOwnProperty.call(TRANSLIT, ch)) {
      out += TRANSLIT[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (/[\s\-_.]/.test(ch)) {
      out += '-';
    }
    // прочие символы (знаки препинания, эмодзи) отбрасываем
  }
  // схлопываем повторяющиеся дефисы, убираем по краям
  out = out.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return out || 'book';
}

/**
 * Подобрать УНИКАЛЬНЫЙ slug: если base уже занят другой книгой — добавляем
 * -2, -3, ... Проверяем по БД.
 */
async function uniqueSlug(base) {
  const clean = slugify(base);
  let candidate = clean;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Book.exists({ bookSlug: candidate })) {
    candidate = `${clean}-${n}`;
    n += 1;
  }
  return candidate;
}

/* ------------------------------------------------------------------ *
 *                        ДЛИТЕЛЬНОСТЬ АУДИО                          *
 * ------------------------------------------------------------------ *
 * ffprobe есть на VPS (проверено import-audio.js, ffmpeg 6.1.1). Читаем
 * длительность из уже записанного на диск файла, округляем до секунд. */
async function probeDuration(fullPath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      fullPath,
    ]);
    const seconds = parseFloat(String(stdout).trim());
    return Number.isFinite(seconds) ? Math.round(seconds) : 0;
  } catch (_err) {
    // ffprobe недоступен/файл битый — не валим загрузку, вернём 0.
    return 0;
  }
}

/* ------------------------------------------------------------------ *
 *                            MULTER                                  *
 * ------------------------------------------------------------------ */
// Обложка — картинка, тот же лимит что и в чате (8 МБ), те же MIME.
const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageService.MAX_FILE_SIZE_BYTES },
});

// Аудио-часть разбора. Лимит 500 МБ — часть аудиокниги бывает большой.
const AUDIO_MAX_BYTES = 500 * 1024 * 1024;
const AUDIO_ALLOWED_MIME = new Map([
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
]);
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_BYTES },
});

/* ------------------------------------------------------------------ *
 *                        СЕРИАЛИЗАЦИЯ                                *
 * ------------------------------------------------------------------ */
// Полная карточка книги для редактора админки (включая audioFilename частей —
// админу можно, в отличие от публичного /api/books).
function serializeBook(book) {
  return {
    id: String(book._id),
    title: book.title,
    author: book.author,
    description: book.description,
    coverImageUrl: book.coverImageUrl,
    coverGradientColors: book.coverGradientColors,
    coverLabel: book.coverLabel,
    categories: book.categories,
    tags: book.tags,
    priceUsd: book.priceUsd,
    priceRub: book.priceRub,
    priceByn: book.priceByn,
    isFree: book.isFree,
    appleProductId: book.appleProductId,
    bookSlug: book.bookSlug,
    purchaseUrl: book.purchaseUrl,
    isPartOfClub: book.isPartOfClub,
    clubMonth: book.clubMonth,
    freeChapterIndex: book.freeChapterIndex,
    durationTotal: book.durationTotal,
    rating: book.rating,
    reviewCount: book.reviewCount,
    isPublished: book.isPublished,
    publishedAt: book.publishedAt,
    parts: (book.parts || []).map((p) => ({
      number: p.number,
      title: p.title,
      duration: p.duration,
      audioFilename: p.audioFilename,
      isPreviewAvailable: p.isPreviewAvailable,
    })),
  };
}

/**
 * Пересчитать durationTotal по сумме частей.
 */
function recomputeDuration(book) {
  book.durationTotal = (book.parts || []).reduce(
    (sum, p) => sum + (p.duration || 0),
    0
  );
}

/**
 * Проставить appleProductId по правилу `book.<slug>` для платных, null для
 * бесплатных. Продукт с этим id Анна заводит в App Store Connect вручную.
 */
function applyAppleProductId(book) {
  book.appleProductId = book.isFree ? null : `book.${book.bookSlug}`;
}

/* ================================================================== *
 *                            КАТЕГОРИИ                               *
 * ================================================================== */
// GET /api/admin/catalog/categories — фиксированный список для выпадашки.
router.get('/categories', (_req, res) => {
  return success(res, { categories: CATEGORIES });
});

// GET /api/admin/catalog/packages — список пакетов (для выдачи доступа в
// разделе «Люди»): выбор из списка по названию вместо ввода slug руками.
router.get('/packages', async (_req, res, next) => {
  try {
    const pkgs = await Package.find()
      .sort({ createdAt: -1 })
      .select('title packageSlug isPublished')
      .lean();
    const items = pkgs.map((p) => ({
      id: String(p._id),
      title: p.title,
      packageSlug: p.packageSlug,
      isPublished: p.isPublished,
    }));
    return success(res, { items, total: items.length });
  } catch (err) {
    return next(err);
  }
});

/* ================================================================== *
 *                          СПИСОК КНИГ                               *
 * ================================================================== */
// GET /api/admin/catalog — все разборы (включая неопубликованные), кратко.
router.get('/', async (_req, res, next) => {
  try {
    const books = await Book.find()
      .sort({ createdAt: -1 })
      .select(
        'title author coverImageUrl coverGradientColors coverLabel ' +
          'categories isFree priceRub priceUsd bookSlug isPartOfClub ' +
          'clubMonth isPublished durationTotal parts'
      )
      .lean();

    const items = books.map((b) => ({
      id: String(b._id),
      title: b.title,
      author: b.author,
      coverImageUrl: b.coverImageUrl,
      coverGradientColors: b.coverGradientColors,
      coverLabel: b.coverLabel,
      categories: b.categories,
      isFree: b.isFree,
      priceRub: b.priceRub,
      priceUsd: b.priceUsd,
      bookSlug: b.bookSlug,
      isPartOfClub: b.isPartOfClub,
      clubMonth: b.clubMonth,
      isPublished: b.isPublished,
      durationTotal: b.durationTotal,
      partsCount: (b.parts || []).length,
    }));

    return success(res, { items, total: items.length });
  } catch (err) {
    return next(err);
  }
});

/* ================================================================== *
 *                       ОДНА КНИГА (карточка)                        *
 * ================================================================== */
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }
    const book = await Book.findById(req.params.id);
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }
    return success(res, { book: serializeBook(book) });
  } catch (err) {
    return next(err);
  }
});

/* ================================================================== *
 *                          СОЗДАНИЕ КНИГИ                            *
 * ================================================================== */
const upsertSchema = z.object({
  title: z.string().trim().min(1, 'Название обязательно').max(300),
  author: z.string().trim().max(200).default(''),
  description: z.string().trim().min(1, 'Описание обязательно').max(5000),
  categories: z
    .array(z.enum(CATEGORY_VALUES))
    .max(14)
    .default([]),
  tags: z.array(z.string().trim().max(60)).max(30).default([]),
  isFree: z.boolean().default(false),
  priceRub: z.number().nonnegative().nullable().default(null),
  priceUsd: z.number().nonnegative().nullable().default(null),
  priceByn: z.number().nonnegative().nullable().default(null),
  coverGradientColors: z
    .array(z.string().regex(/^#?[0-9a-fA-F]{6}$/))
    .length(2)
    .optional(),
  coverLabel: z.string().trim().max(4).default(''),
  purchaseUrl: z.string().trim().max(500).default(''),
  freeChapterIndex: z.number().int().min(0).default(0),
});

// POST /api/admin/catalog — создать разбор (без файлов; обложку и аудио
// грузят отдельными запросами после создания).
router.post('/', validate(upsertSchema), async (req, res, next) => {
  try {
    const data = req.body;
    const bookSlug = await uniqueSlug(data.title);

    const book = new Book({
      title: data.title,
      author: data.author,
      description: data.description,
      categories: data.categories,
      tags: data.tags,
      isFree: data.isFree,
      priceRub: data.isFree ? null : data.priceRub,
      priceUsd: data.isFree ? null : data.priceUsd,
      priceByn: data.isFree ? null : data.priceByn,
      coverGradientColors: data.coverGradientColors || ['#1A0E08', '#3A2018'],
      coverLabel: data.coverLabel,
      purchaseUrl: data.purchaseUrl,
      freeChapterIndex: data.freeChapterIndex,
      bookSlug,
      isPublished: false,
    });
    applyAppleProductId(book);
    await book.save();

    return success(res, { book: serializeBook(book) }, 201);
  } catch (err) {
    return next(err);
  }
});

/* ================================================================== *
 *                        РЕДАКТИРОВАНИЕ КНИГИ                        *
 * ================================================================== */
// PATCH /api/admin/catalog/:id — метаданные. bookSlug НЕ меняем (к нему
// привязаны имена файлов на диске).
router.patch('/:id', validate(upsertSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }
    const book = await Book.findById(req.params.id);
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }

    const data = req.body;
    book.title = data.title;
    book.author = data.author;
    book.description = data.description;
    book.categories = data.categories;
    book.tags = data.tags;
    book.isFree = data.isFree;
    book.priceRub = data.isFree ? null : data.priceRub;
    book.priceUsd = data.isFree ? null : data.priceUsd;
    book.priceByn = data.isFree ? null : data.priceByn;
    if (data.coverGradientColors) {
      book.coverGradientColors = data.coverGradientColors;
    }
    book.coverLabel = data.coverLabel;
    book.purchaseUrl = data.purchaseUrl;
    book.freeChapterIndex = data.freeChapterIndex;
    applyAppleProductId(book);
    await book.save();

    return success(res, { book: serializeBook(book) });
  } catch (err) {
    return next(err);
  }
});

/* ================================================================== *
 *                          ПУБЛИКАЦИЯ                                *
 * ================================================================== */
const publishSchema = z.object({ isPublished: z.boolean() });

// POST /api/admin/catalog/:id/publish — опубликовать/снять с публикации.
router.post(
  '/:id/publish',
  validate(publishSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
      }
      const book = await Book.findById(req.params.id);
      if (!book) {
        throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
      }

      // Нельзя опубликовать разбор без частей — в приложении он будет пустым.
      if (req.body.isPublished && (book.parts || []).length === 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Нельзя опубликовать разбор без аудио-частей',
          400
        );
      }

      book.isPublished = req.body.isPublished;
      book.publishedAt = req.body.isPublished
        ? book.publishedAt || new Date()
        : null;
      await book.save();

      return success(res, { book: serializeBook(book) });
    } catch (err) {
      return next(err);
    }
  }
);

/* ================================================================== *
 *                        ЗАГРУЗКА ОБЛОЖКИ                            *
 * ================================================================== *
 * Обложка новых разборов НЕ в ассетах приложения (те требуют пересборки),
 * а на сервере: <AUDIO_BASE_PATH>/book-covers/<slug>/<uuid>.<ext>. Отдаётся
 * через /images/... по signed URL (image.service, фикс. exp 2099 → стабильный
 * URL, кэшируется). Book.coverImageUrl = этот URL; приложение уже умеет
 * https-обложки (BookCoverImage → Image.network). */
router.post(
  '/:id/cover',
  uploadCover.single('cover'),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
      }
      const book = await Book.findById(req.params.id);
      if (!book) {
        throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
      }
      if (!req.file) {
        throw new AppError('VALIDATION_ERROR', 'Файл обложки не получен', 400);
      }

      const ext = imageService.ALLOWED_MIME.get(req.file.mimetype);
      if (!ext) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Недопустимый формат картинки (jpg, png, webp, heic)',
          400
        );
      }

      const dir = path.join(
        config.audio.basePath,
        'book-covers',
        book.bookSlug
      );
      await fs.promises.mkdir(dir, { recursive: true });

      const fileName = imageService.generateImageFileName(ext);
      const fullPath = path.join(dir, fileName);
      await fs.promises.writeFile(fullPath, req.file.buffer);

      const relPath = path.posix.join(
        'book-covers',
        book.bookSlug,
        fileName
      );
      book.coverImageUrl = imageService.generateImageSignedUrl(relPath);
      await book.save();

      return success(res, { book: serializeBook(book) });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        return next(
          new AppError('VALIDATION_ERROR', 'Файл обложки слишком большой', 400)
        );
      }
      return next(err);
    }
  }
);

/* ================================================================== *
 *                      ЗАГРУЗКА АУДИО-ЧАСТИ                          *
 * ================================================================== *
 * Файл пишем в <AUDIO_BASE_PATH>/<slug>/part-<N>.<ext> (та же схема что у
 * import-audio.js). audioFilename = '<slug>/part-<N>.<ext>' (относительный
 * путь для signed URL). Длительность — ffprobe. Если часть с таким номером
 * уже была — перезаписываем (старый файл удаляем). */
const audioMetaSchema = z.object({
  partNumber: z.coerce.number().int().min(1).max(50),
  title: z.string().trim().max(200).optional(),
  isPreviewAvailable: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

router.post(
  '/:id/audio',
  uploadAudio.single('audio'),
  validate(audioMetaSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
      }
      const book = await Book.findById(req.params.id);
      if (!book) {
        throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
      }
      if (!req.file) {
        throw new AppError('VALIDATION_ERROR', 'Аудиофайл не получен', 400);
      }

      const ext = AUDIO_ALLOWED_MIME.get(req.file.mimetype);
      if (!ext) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Недопустимый формат аудио (mp3, m4a, aac, wav)',
          400
        );
      }

      const partNumber = req.body.partNumber;

      // Если часть с таким номером уже есть и её файл отличается по имени —
      // удалим старый файл, чтобы не копить мусор на диске.
      const existing = (book.parts || []).find(
        (p) => p.number === partNumber
      );
      const newRelPath = path.posix.join(
        book.bookSlug,
        `part-${partNumber}.${ext}`
      );
      if (existing && existing.audioFilename && existing.audioFilename !== newRelPath) {
        const oldFull = path.join(config.audio.basePath, existing.audioFilename);
        fs.promises.unlink(oldFull).catch(() => {});
      }

      const dir = path.join(config.audio.basePath, book.bookSlug);
      await fs.promises.mkdir(dir, { recursive: true });
      const fullPath = path.join(dir, `part-${partNumber}.${ext}`);
      await fs.promises.writeFile(fullPath, req.file.buffer);

      const duration = await probeDuration(fullPath);

      const title =
        req.body.title && req.body.title.length > 0
          ? req.body.title
          : `Часть ${partNumber}`;

      if (existing) {
        existing.title = title;
        existing.duration = duration;
        existing.audioFilename = newRelPath;
        if (typeof req.body.isPreviewAvailable === 'boolean') {
          existing.isPreviewAvailable = req.body.isPreviewAvailable;
        }
      } else {
        book.parts.push({
          number: partNumber,
          title,
          duration,
          audioFilename: newRelPath,
          isPreviewAvailable: req.body.isPreviewAvailable || false,
        });
      }

      // Держим части упорядоченными по номеру.
      book.parts.sort((a, b) => a.number - b.number);
      recomputeDuration(book);
      await book.save();

      return success(res, { book: serializeBook(book) });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        return next(
          new AppError('VALIDATION_ERROR', 'Аудиофайл слишком большой', 400)
        );
      }
      return next(err);
    }
  }
);

/* ================================================================== *
 *                       УДАЛЕНИЕ АУДИО-ЧАСТИ                         *
 * ================================================================== */
router.delete('/:id/audio/:partNumber', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }
    const book = await Book.findById(req.params.id);
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }

    const partNumber = parseInt(req.params.partNumber, 10);
    const part = (book.parts || []).find((p) => p.number === partNumber);
    if (!part) {
      throw new AppError('NOT_FOUND', 'Часть не найдена', 404);
    }

    if (part.audioFilename) {
      const full = path.join(config.audio.basePath, part.audioFilename);
      fs.promises.unlink(full).catch(() => {});
    }

    book.parts = book.parts.filter((p) => p.number !== partNumber);
    recomputeDuration(book);
    await book.save();

    return success(res, { book: serializeBook(book) });
  } catch (err) {
    return next(err);
  }
});

/* ================================================================== *
 *                          УДАЛЕНИЕ КНИГИ                            *
 * ================================================================== *
 * Разрешаем только если разбор не привязан к клубу месяца (иначе клуб
 * останется со ссылкой на несуществующую книгу). Файлы на диске оставляем
 * как есть — их чистка вручную, чтобы случайное удаление не стирало аудио. */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }
    const book = await Book.findById(req.params.id);
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор не найден', 404);
    }

    const usedByClub = await ClubMonth.exists({ bookId: book._id });
    if (usedByClub) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Разбор используется в клубе месяца — сначала отвяжите его от клуба',
        400
      );
    }

    await book.deleteOne();
    return success(res, { deleted: true, id: String(book._id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
