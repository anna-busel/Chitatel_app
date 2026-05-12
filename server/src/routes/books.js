const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, paginated } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Book = require('../models/Book');
const User = require('../models/User');
const { generateSignedUrl } = require('../services/audio.service');

const router = Router();

/**
 * GET /api/books
 * MASTER 7.4: список всех книг (с пагинацией, фильтрами)
 * Query: ?category=&isFree=&page=&limit=
 *
 * Примечание: ?category=КРИЗИСЫ матчится против массива Book.categories
 * (одна книга может быть в нескольких категориях — см. AI-CONTEXT РАСХОЖДЕНИЯ).
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const filter = { isPublished: true };
    if (req.query.category) {
      filter.categories = req.query.category;
    }
    if (req.query.isFree !== undefined) {
      filter.isFree = req.query.isFree === 'true';
    }

    const [books, total] = await Promise.all([
      Book.find(filter)
        .select('-parts.audioFilename')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Book.countDocuments(filter),
    ]);

    return paginated(res, { items: books, total, page, limit });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/featured
 * MASTER 7.4: рекомендованные для главной
 */
router.get('/featured', async (_req, res, next) => {
  try {
    const freeBooks = await Book.find({ isPublished: true, isFree: true })
      .select('-parts.audioFilename')
      .sort({ publishedAt: -1 })
      .limit(6)
      .lean();

    const popularBooks = await Book.find({ isPublished: true, isFree: false, isPartOfClub: false })
      .select('-parts.audioFilename')
      .sort({ rating: -1, reviewCount: -1 })
      .limit(6)
      .lean();

    return success(res, { freeBooks, popularBooks });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/search
 * MASTER 7.4: полнотекстовый поиск (MongoDB text index)
 * Query: ?q=
 */
router.get('/search', async (req, res, next) => {
  try {
    const query = req.query.q;
    if (!query || query.trim().length === 0) {
      return success(res, { books: [] });
    }

    const books = await Book.find(
      {
        $text: { $search: query },
        isPublished: true,
      },
      { score: { $meta: 'textScore' } }
    )
      .select('-parts.audioFilename')
      .sort({ score: { $meta: 'textScore' } })
      .limit(20)
      .lean();

    return success(res, { books });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/:id
 * MASTER 7.4: детальная информация о книге
 */
router.get('/:id', async (req, res, next) => {
  try {
    const book = await Book.findOne({
      _id: req.params.id,
      isPublished: true,
    })
      .select('-parts.audioFilename')
      .lean();

    if (!book) {
      throw new AppError('BOOK_NOT_FOUND', 'Разбор не найден', 404);
    }

    return success(res, { book });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/:id/audio/:partNumber
 * Возвращает SIGNED URL для проигрывания аудио (задача 2.3).
 * URL действует AUDIO_URL_TTL_SECONDS (по умолчанию 1 час).
 *
 * Доступ:
 * - Бесплатная книга — без авторизации, любой может слушать
 * - Платная часть с isPreviewAvailable: true — без авторизации (5-минутное превью)
 * - Платная часть без превью — нужна авторизация + покупка/подписка/архив
 */
router.get('/:id/audio/:partNumber', optionalAuth, async (req, res, next) => {
  try {
    const book = await Book.findOne({
      _id: req.params.id,
      isPublished: true,
    }).lean();

    if (!book) {
      throw new AppError('BOOK_NOT_FOUND', 'Разбор не найден', 404);
    }

    const partNumber = parseInt(req.params.partNumber, 10);
    const part = book.parts.find((p) => p.number === partNumber);

    if (!part || !part.audioFilename) {
      throw new AppError('NOT_FOUND', 'Часть не найдена или аудио не загружено', 404);
    }

    // Проверка доступа
    const isAccessible = await checkPartAccess(book, part, req.user);
    if (!isAccessible) {
      throw new AppError('PURCHASE_REQUIRED', 'Контент платный, не куплен', 403);
    }

    // Генерируем signed URL
    const audioUrl = generateSignedUrl(part.audioFilename);

    return success(res, {
      audioUrl,
      duration: part.duration,
      partNumber: part.number,
      title: part.title,
      isPreview: !!part.isPreviewAvailable && !book.isFree,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * Проверка доступа к части аудиоразбора.
 * Возвращает true если можно проигрывать, false если нужна покупка/подписка.
 */
async function checkPartAccess(book, part, userPayload) {
  // Бесплатная книга — всем
  if (book.isFree) return true;

  // Превью платной части (1-я часть платной книги) — всем
  if (part.isPreviewAvailable) return true;

  // Дальше нужна авторизация
  if (!userPayload) return false;

  // Загружаем юзера для проверки подписки/покупок
  const user = await User.findById(userPayload.userId).lean();
  if (!user) return false;

  // Куплена ли книга отдельно
  const hasPurchased = user.purchasedBooks && user.purchasedBooks.some(
    (id) => id.toString() === book._id.toString()
  );
  if (hasPurchased) return true;

  // Активная подписка
  const hasSubscription =
    user.subscriptionStatus === 'basic' || user.subscriptionStatus === 'premium';
  if (hasSubscription) return true;

  // Архивный доступ (21 день после окончания клуба)
  if (user.hasArchiveAccess) return true;

  return false;
}

module.exports = router;
