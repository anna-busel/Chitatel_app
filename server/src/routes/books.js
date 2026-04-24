const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, paginated } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Book = require('../models/Book');
const User = require('../models/User');

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
 * MASTER 7.4: signed URL для аудио
 * Для платных книг — требует авторизацию + проверку покупки/подписки
 * Для бесплатных — без авторизации (но через signed URL)
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

    if (!part) {
      throw new AppError('NOT_FOUND', 'Часть не найдена', 404);
    }

    // Бесплатная книга — доступ всем
    if (book.isFree) {
      return success(res, {
        audioFilename: part.audioFilename,
        duration: part.duration,
        // TODO (задача 2.3): signed URL вместо filename
      });
    }

    // Платная книга — проверяем превью
    if (part.isPreviewAvailable) {
      return success(res, {
        audioFilename: part.audioFilename,
        duration: part.duration,
        isPreview: true,
      });
    }

    // Платная часть — нужна авторизация
    if (!req.user) {
      throw new AppError('UNAUTHORIZED', 'Требуется авторизация', 401);
    }

    // Проверяем покупку или подписку
    const user = await User.findById(req.user.userId).lean();
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Пользователь не найден', 401);
    }

    const hasPurchased = user.purchasedBooks && user.purchasedBooks.some(
      (id) => id.toString() === book._id.toString()
    );
    const hasSubscription = user.subscriptionStatus === 'basic' || user.subscriptionStatus === 'premium';
    const hasArchive = user.hasArchiveAccess;

    if (!hasPurchased && !hasSubscription && !hasArchive) {
      throw new AppError('PURCHASE_REQUIRED', 'Контент платный, не куплен', 403);
    }

    return success(res, {
      audioFilename: part.audioFilename,
      duration: part.duration,
      // TODO (задача 2.3): signed URL
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
