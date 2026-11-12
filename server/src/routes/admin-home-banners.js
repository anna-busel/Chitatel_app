const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const multer = require('multer');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const HomeBanner = require('../models/HomeBanner');
const imageService = require('../services/image.service');

/**
 * Баннеры на главной — админка (UPDATES-PLAN T, 05.11.2026).
 *
 * GET    /api/admin/home-banners        — все баннеры (по order)
 * POST   /api/admin/home-banners        — multipart: image (файл, обязателен)
 *                                         + data (JSON-строка с полями)
 * PATCH  /api/admin/home-banners/:id    — JSON с полями, либо multipart
 *                                         (image — заменить картинку, data)
 * DELETE /api/admin/home-banners/:id    — удалить вместе с файлом
 *
 * Картинка — JPG/PNG, лимит как у обложек (image.service, 8 МБ), лежит в
 * <AUDIO_BASE_PATH>/home-banners/<uuid>.<ext>, отдаётся по signed URL.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

const BANNER_DIR = 'home-banners';
const BANNER_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageService.MAX_FILE_SIZE_BYTES },
});

// multer-ошибки (размер) → понятный текст. Не-multipart запрос multer
// пропускает как есть (body уже разобран express.json).
function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('VALIDATION_ERROR', 'Файл больше 8 МБ', 400));
    }
    return next(new AppError('VALIDATION_ERROR', 'Ошибка загрузки файла', 400));
  });
}

const objectId = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), 'Неверный id разбора');

const actionSchema = z.object({
  kind: z.enum(['none', 'book', 'books']).default('none'),
  bookId: objectId.nullable().optional(),
  bookIds: z.array(objectId).max(50).optional(),
  listTitle: z.string().trim().max(120).optional(),
  packageIds: z.array(objectId).max(50).optional(),
});

const fieldsSchema = z.object({
  title: z.string().trim().max(200).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  platforms: z.array(z.enum(['ios', 'android'])).min(1).optional(),
  action: actionSchema.optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
  showInCatalog: z.boolean().optional(),
});

/** Поля из запроса: multipart → JSON в поле data, иначе обычный body. */
function readFields(req) {
  if (req.body && typeof req.body.data === 'string') {
    try {
      return JSON.parse(req.body.data);
    } catch (_e) {
      throw new AppError('VALIDATION_ERROR', 'Невалидные данные', 400);
    }
  }
  return req.body || {};
}

function parse(schema, raw) {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const details = {};
    r.error.issues.forEach((i) => {
      details[i.path.join('.')] = i.message;
    });
    throw new AppError('VALIDATION_ERROR', 'Невалидные данные', 400, details);
  }
  return r.data;
}

/** Проверка действия: для разбора нужен bookId, для подборки — список. */
function normalizeAction(a) {
  const action = a || { kind: 'none' };
  if (action.kind === 'book') {
    if (!action.bookId) {
      throw new AppError('VALIDATION_ERROR', 'Выберите разбор', 400);
    }
    return { kind: 'book', bookId: action.bookId, bookIds: [], listTitle: '', packageIds: [] };
  }
  if (action.kind === 'books') {
    const ids = [...new Set(action.bookIds || [])];
    const pkgIds = [...new Set(action.packageIds || [])];
    if (!ids.length && !pkgIds.length) {
      throw new AppError('VALIDATION_ERROR', 'Выберите разборы или пакеты для подборки', 400);
    }
    if (!action.listTitle) {
      throw new AppError('VALIDATION_ERROR', 'Введите заголовок подборки', 400);
    }
    return {
      kind: 'books',
      bookId: null,
      bookIds: ids,
      listTitle: action.listTitle,
      packageIds: pkgIds,
    };
  }
  return { kind: 'none', bookId: null, bookIds: [], listTitle: '', packageIds: [] };
}

function checkDates(startsAt, endsAt) {
  if (!(startsAt < endsAt)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Дата окончания должна быть позже даты начала',
      400
    );
  }
}

/** Сохранить файл картинки, вернуть относительный путь. */
async function saveImage(file) {
  const ext = BANNER_MIME.get(file.mimetype);
  if (!ext) {
    throw new AppError('VALIDATION_ERROR', 'Картинка должна быть JPG или PNG', 400);
  }
  const dir = path.join(config.audio.basePath, BANNER_DIR);
  await fs.promises.mkdir(dir, { recursive: true });
  const fileName = imageService.generateImageFileName(ext);
  await fs.promises.writeFile(path.join(dir, fileName), file.buffer);
  return path.posix.join(BANNER_DIR, fileName);
}

async function removeImage(relPath) {
  if (!relPath) return;
  await fs.promises
    .unlink(path.join(config.audio.basePath, relPath))
    .catch(() => null);
}

function serialize(b) {
  const a = b.action || {};
  return {
    id: String(b._id),
    title: b.title || '',
    imageUrl: b.imageStoragePath
      ? imageService.generateImageSignedUrl(b.imageStoragePath)
      : '',
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    platforms: b.platforms && b.platforms.length ? b.platforms : ['ios'],
    action: {
      kind: a.kind || 'none',
      bookId: a.bookId ? String(a.bookId) : null,
      bookIds: (a.bookIds || []).map(String),
      listTitle: a.listTitle || '',
      packageIds: (a.packageIds || []).map(String),
    },
    showInCatalog: b.showInCatalog === true,
    order: b.order || 0,
    isActive: b.isActive !== false,
    createdAt: b.createdAt,
  };
}

function findById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('NOT_FOUND', 'Баннер не найден', 404);
  }
  return HomeBanner.findById(id);
}

/* ------------------------------ СПИСОК ------------------------------ */
router.get('/', async (_req, res, next) => {
  try {
    const items = await HomeBanner.find().sort({ order: 1, createdAt: 1 }).lean();
    return success(res, { items: items.map(serialize) });
  } catch (err) {
    return next(err);
  }
});

/* ----------------------------- ДОБАВИТЬ ----------------------------- */
router.post('/', uploadImage, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'Загрузите картинку', 400);
    }
    const data = parse(fieldsSchema, readFields(req));
    checkDates(data.startsAt, data.endsAt);
    const action = normalizeAction(data.action);

    let order = data.order;
    if (typeof order !== 'number') {
      const last = await HomeBanner.findOne().sort({ order: -1 }).select('order').lean();
      order = last ? (last.order || 0) + 1 : 0;
    }

    const imageStoragePath = await saveImage(req.file);
    const item = await HomeBanner.create({
      title: data.title || '',
      imageStoragePath,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      platforms: data.platforms || ['ios'],
      action,
      order,
      isActive: data.isActive !== false,
      showInCatalog: data.showInCatalog === true,
    });
    return success(res, { item: serialize(item) }, 201);
  } catch (err) {
    return next(err);
  }
});

/* --------------------------- РЕДАКТИРОВАТЬ -------------------------- */
router.patch('/:id', uploadImage, async (req, res, next) => {
  try {
    const item = await findById(req.params.id);
    if (!item) throw new AppError('NOT_FOUND', 'Баннер не найден', 404);

    const data = parse(fieldsSchema.partial(), readFields(req));
    const startsAt = data.startsAt || item.startsAt;
    const endsAt = data.endsAt || item.endsAt;
    checkDates(startsAt, endsAt);

    if (typeof data.title === 'string') item.title = data.title;
    item.startsAt = startsAt;
    item.endsAt = endsAt;
    if (data.platforms) item.platforms = data.platforms;
    if (data.action) item.action = normalizeAction(data.action);
    if (typeof data.order === 'number') item.order = data.order;
    if (typeof data.isActive === 'boolean') item.isActive = data.isActive;
    if (typeof data.showInCatalog === 'boolean') item.showInCatalog = data.showInCatalog;

    let oldImage = null;
    if (req.file) {
      oldImage = item.imageStoragePath;
      item.imageStoragePath = await saveImage(req.file);
    }
    await item.save();
    if (oldImage) await removeImage(oldImage);

    return success(res, { item: serialize(item) });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------ УДАЛИТЬ ----------------------------- */
router.delete('/:id', async (req, res, next) => {
  try {
    const item = await findById(req.params.id);
    if (!item) throw new AppError('NOT_FOUND', 'Баннер не найден', 404);
    const img = item.imageStoragePath;
    await item.deleteOne();
    await removeImage(img);
    return success(res, { deleted: true, id: String(item._id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.serialize = serialize;
