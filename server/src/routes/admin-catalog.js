const path = require('path');
const fs = require('fs');
const os = require('os');
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
const User = require('../models/User');

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
// Аудио пишем на диск во временную папку (не в память — 500 МБ в буфере
// роняли процесс по max_memory_restart), в роуте переносим в AUDIO_BASE_PATH.
const AUDIO_TMP_DIR = path.join(os.tmpdir(), 'chitatel-upload');
const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdir(AUDIO_TMP_DIR, { recursive: true }, (err) =>
        cb(err, AUDIO_TMP_DIR)
      );
    },
  }),
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

// Клубный разбор (isPartOfClub) не продаётся отдельно: его нет в каталоге,
// доступ даёт только подписка на клуб (books.js checkPartAccess →
// userHasBookAccess → clubMonthsEntitled). Поэтому isFree/цены/IAP-продукт
// для него принудительно пустые — что бы ни пришло из формы. «Бесплатный»
// клубный разбор был бы дырой: checkPartAccess при isFree отдаёт аудио всем
// без авторизации, то есть в обход подписки.
function applyClubExclusive(book) {
  book.isFree = false;
  book.priceRub = null;
  book.priceUsd = null;
  book.priceByn = null;
  book.appleProductId = null;
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
      .select('title packageSlug isPublished priceUsd coverImageUrl books')
      .lean();
    const items = pkgs.map((p) => ({
      id: String(p._id),
      title: p.title,
      packageSlug: p.packageSlug,
      isPublished: p.isPublished,
      isFacultativ: (p.packageSlug || '').startsWith('facultativ'),
      priceUsd: p.priceUsd != null ? p.priceUsd : null,
      booksCount: (p.books || []).length,
      coverImageUrl: p.coverImageUrl || '',
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
  // Клубный разбор: помечается ПРИ СОЗДАНИИ (кнопка «Создать разбор для клуба»).
  // Ставит isPartOfClub сразу, чтобы разбор НЕ попадал в общий каталог с самого
  // начала — независимо от того, опубликован он и привязан ли уже к клубу.
  // Учитывается только в POST (создание). В PATCH игнорируется: связь с клубом
  // после создания ведёт логика клуба (markBookInClub/unmarkBookIfUnused).
  isClubExclusive: z.boolean().default(false),
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
      // Клубный разбор скрыт из каталога сразу (см. upsertSchema.isClubExclusive
      // и фильтр в books.js: isPartOfClub:{$ne:true}). При создании клуба
      // markBookInClub оставит флаг true и проставит clubMonth.
      isPartOfClub: data.isClubExclusive === true,
    });
    applyAppleProductId(book);
    if (book.isPartOfClub) applyClubExclusive(book);
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
    if (book.isPartOfClub) applyClubExclusive(book);
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
      // Сначала во временный файл рядом, потом атомарный rename — читатели
      // не увидят полузаписанную часть. Временный файл multer (в os.tmpdir)
      // может быть на другой ФС — rename не сработает, тогда copyFile.
      const tmpPath = `${fullPath}.tmp`;
      try {
        await fs.promises.rename(req.file.path, tmpPath);
      } catch (_e) {
        await fs.promises.copyFile(req.file.path, tmpPath);
      }
      await fs.promises.rename(tmpPath, fullPath);

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

      // 5-минутное превью для ПЛАТНОГО каталожного разбора — режем из 1-й части
      // (как scripts/import-audio.js: ffmpeg -t 300). Клубные (isPartOfClub) и
      // бесплатные — БЕЗ превью: в клубе бесплатного не показываем, а бесплатные
      // разборы и так открыты целиком. Ошибка ffmpeg не валит загрузку части —
      // превью пересоздастся при повторной загрузке 1-й части.
      if (partNumber === 1 && !book.isFree && !book.isPartOfClub) {
        const previewSeconds = Math.min(300, duration || 300);
        const previewPath = path.join(dir, 'preview.mp3');
        const codecArgs =
          ext === 'mp3' ? ['-c', 'copy'] : ['-c:a', 'libmp3lame', '-b:a', '128k'];
        try {
          await execFileAsync('ffmpeg', [
            '-y', '-i', fullPath, '-t', String(previewSeconds),
            ...codecArgs, previewPath,
          ]);
          book.previewAudioFilename = path.posix.join(book.bookSlug, 'preview.mp3');
          book.previewDuration = previewSeconds;
        } catch (_e) {
          // превью не нарезалось (нет кодека/битый файл) — не критично
        }
      }

      await book.save();

      return success(res, { book: serializeBook(book) });
    } catch (err) {
      if (err instanceof multer.MulterError) {
        return next(
          new AppError('VALIDATION_ERROR', 'Аудиофайл слишком большой', 400)
        );
      }
      return next(err);
    } finally {
      // Временный файл multer (если он ещё есть — при ошибке до rename).
      if (req.file && req.file.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
    }
  },
  // Ошибка validate() после multer — файл уже на диске, подчистим.
  (err, req, _res, next) => {
    if (req.file && req.file.path) {
      fs.promises.unlink(req.file.path).catch(() => {});
    }
    return next(err);
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

    // Удалили 1-ю часть — превью (нарезка из неё) больше не актуально: чистим.
    if (partNumber === 1 && book.previewAudioFilename) {
      const pf = path.join(config.audio.basePath, book.previewAudioFilename);
      fs.promises.unlink(pf).catch(() => {});
      book.previewAudioFilename = null;
      book.previewDuration = 0;
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

/* ================================================================== *
 *                          ПАКЕТЫ (CRUD)                            *
 * ================================================================== *
 * Пакет = набор разборов из каталога, продаётся как отдельный Non-Consumable
 * IAP (package.<slug>, продукт заводится в App Store Connect вручную — как у
 * платных разборов). Тип (пакет/факультатив) определяется префиксом slug
 * 'facultativ-' — так же его читает клиент (package_model.isFacultativ).
 * Обложка — как у разборов, отдельным запросом после создания. */

function serializePackage(p) {
  return {
    id: String(p._id),
    title: p.title,
    description: p.description || '',
    priceUsd: p.priceUsd != null ? p.priceUsd : null,
    isPublished: p.isPublished,
    packageSlug: p.packageSlug,
    isFacultativ: (p.packageSlug || '').startsWith('facultativ'),
    coverImageUrl: p.coverImageUrl || '',
    coverGradientColors: p.coverGradientColors || ['#1A0E08', '#3A2018'],
    coverLabel: p.coverLabel || '',
    bookIds: (p.books || []).map((b) => String(b)),
    booksCount: (p.books || []).length,
  };
}

// Уникальный slug пакета. Факультатив — с префиксом 'facultativ-' (по нему
// клиент отличает тип). Занятость проверяем по Package.
async function uniquePackageSlug(base, facultativ) {
  const clean = (facultativ ? 'facultativ-' : '') + slugify(base);
  let candidate = clean || (facultativ ? 'facultativ' : 'package');
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Package.exists({ packageSlug: candidate })) {
    candidate = `${clean}-${n}`;
    n += 1;
  }
  return candidate;
}

// Разрешить выбранные id разборов в валидные ObjectId + их slug'и (для
// денормализованного books[] и bookSlugs[] в Package).
async function resolvePackageBooks(bookIds) {
  const validIds = (bookIds || []).filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (validIds.length === 0) return { ids: [], slugs: [] };
  const books = await Book.find({ _id: { $in: validIds } })
    .select('_id bookSlug')
    .lean();
  return {
    ids: books.map((b) => b._id),
    slugs: books.map((b) => b.bookSlug).filter(Boolean),
  };
}

const packageUpsertSchema = z.object({
  title: z.string().trim().min(1, 'Название обязательно').max(300),
  description: z.string().trim().max(5000).default(''),
  priceUsd: z.number().nonnegative().nullable().default(null),
  isFacultativ: z.boolean().default(false),
  bookIds: z.array(z.string()).max(100).default([]),
  coverGradientColors: z
    .array(z.string().regex(/^#?[0-9a-fA-F]{6}$/))
    .length(2)
    .optional(),
  coverLabel: z.string().trim().max(4).default(''),
});

// GET /api/admin/catalog/packages/:id — один пакет (для редактора).
router.get('/packages/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
    }
    const pkg = await Package.findById(req.params.id).lean();
    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
    }
    return success(res, { package: serializePackage(pkg) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/admin/catalog/packages — создать пакет.
router.post(
  '/packages',
  validate(packageUpsertSchema),
  async (req, res, next) => {
    try {
      const data = req.body;
      const packageSlug = await uniquePackageSlug(data.title, data.isFacultativ);
      const { ids, slugs } = await resolvePackageBooks(data.bookIds);

      const pkg = new Package({
        title: data.title,
        description: data.description,
        priceUsd: data.priceUsd,
        coverGradientColors: data.coverGradientColors || ['#1A0E08', '#3A2018'],
        coverLabel: data.coverLabel,
        packageSlug,
        books: ids,
        bookSlugs: slugs,
        appleProductId: `package.${packageSlug}`,
        isPublished: false,
      });
      await pkg.save();

      return success(res, { package: serializePackage(pkg) }, 201);
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/admin/catalog/packages/:id — метаданные + состав. Slug и тип
// (пакет/факультатив) НЕ меняем — к slug привязаны appleProductId и обложка.
router.patch(
  '/packages/:id',
  validate(packageUpsertSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
      }
      const pkg = await Package.findById(req.params.id);
      if (!pkg) {
        throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
      }

      const data = req.body;
      const { ids, slugs } = await resolvePackageBooks(data.bookIds);

      pkg.title = data.title;
      pkg.description = data.description;
      pkg.priceUsd = data.priceUsd;
      if (data.coverGradientColors) {
        pkg.coverGradientColors = data.coverGradientColors;
      }
      pkg.coverLabel = data.coverLabel;
      pkg.books = ids;
      pkg.bookSlugs = slugs;
      if (!pkg.appleProductId && pkg.packageSlug) {
        pkg.appleProductId = `package.${pkg.packageSlug}`;
      }
      await pkg.save();

      return success(res, { package: serializePackage(pkg) });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/admin/catalog/packages/:id/publish — опубликовать/снять.
router.post(
  '/packages/:id/publish',
  validate(publishSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
      }
      const pkg = await Package.findById(req.params.id);
      if (!pkg) {
        throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
      }
      if (req.body.isPublished && (pkg.books || []).length === 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Нельзя опубликовать пустой пакет — добавьте разборы',
          400
        );
      }
      pkg.isPublished = req.body.isPublished;
      await pkg.save();
      return success(res, { package: serializePackage(pkg) });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /api/admin/catalog/packages/:id/cover — обложка (как у разборов):
// <AUDIO_BASE_PATH>/package-covers/<slug>/<uuid>.<ext>, отдаётся по signed URL.
router.post(
  '/packages/:id/cover',
  uploadCover.single('cover'),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
      }
      const pkg = await Package.findById(req.params.id);
      if (!pkg) {
        throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
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
        'package-covers',
        pkg.packageSlug
      );
      await fs.promises.mkdir(dir, { recursive: true });
      const fileName = imageService.generateImageFileName(ext);
      const fullPath = path.join(dir, fileName);
      await fs.promises.writeFile(fullPath, req.file.buffer);
      const relPath = path.posix.join(
        'package-covers',
        pkg.packageSlug,
        fileName
      );
      pkg.coverImageUrl = imageService.generateImageSignedUrl(relPath);
      await pkg.save();
      return success(res, { package: serializePackage(pkg) });
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

// DELETE /api/admin/catalog/packages/:id — удалить пакет.
router.delete('/packages/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
    }
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
    }
    // Пакет уже кто-то купил — удалять нельзя (юзеры потеряют доступ),
    // только снять с публикации.
    const hasBuyers = await User.exists({ purchasedPackages: pkg._id });
    if (hasBuyers) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Пакет куплен участницами — снимите с публикации вместо удаления',
        400
      );
    }
    await Package.deleteOne({ _id: pkg._id });
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});


module.exports = router;
