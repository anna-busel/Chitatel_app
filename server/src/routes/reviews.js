const { Router } = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Book = require('../models/Book');
const User = require('../models/User');
const Review = require('../models/Review');
const { userHasBookAccess } = require('../services/book-access.service');
const { recomputeBookRating } = require('../services/review.service');

/**
 * Отзывы на разбор (UPDATES-PLAN C2). Монтируется в routes/books.js:
 *   GET    /api/books/:id/reviews?page=&limit=  — список (видно всем)
 *   POST   /api/books/:id/reviews               — оставить/исправить свой
 *   DELETE /api/books/:id/reviews/mine          — удалить свой
 * Скрытие Анной — POST /api/admin/reviews/:id/hide (routes/admin.js).
 *
 * Список: без скрытых и без авторов, которых я заблокировала
 * (User.blockedUsers — то же поле, что фильтрует чат клуба).
 * Оставить отзыв может только тот, у кого есть доступ к разбору: бесплатный
 * разбор или userHasBookAccess — та же функция, что решает отдачу платного
 * аудио в GET /api/books/:id/audio/:partNumber.
 */
const router = Router({ mergeParams: true });

const PAGE_SIZE = 20;

async function findPublishedBook(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('BOOK_NOT_FOUND', 'Разбор не найден', 404);
  }
  const book = await Book.findOne({ _id: id, isPublished: true })
    .select('_id isFree rating reviewCount')
    .lean();
  if (!book) {
    throw new AppError('BOOK_NOT_FOUND', 'Разбор не найден', 404);
  }
  return book;
}

/** Отзыв → JSON для клиента. author — populate userId (name, avatarUrl). */
function serializeReview(review, myUserId) {
  const populated = review.userId && review.userId.name !== undefined;
  const author = populated ? review.userId : null;
  const authorId = author ? author._id : review.userId;
  return {
    id: String(review._id),
    rating: review.rating,
    text: review.text || '',
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    isMine: !!myUserId && String(authorId) === String(myUserId),
    author: author
      ? { id: String(author._id), name: author.name, avatarUrl: author.avatarUrl || null }
      : { id: String(authorId), name: null, avatarUrl: null },
  };
}

/**
 * GET /api/books/:id/reviews?page=1&limit=20
 * Без авторизации — все видимые отзывы; с авторизацией — ещё без
 * заблокированных мной авторов, плюс myReview (свой, даже скрытый — чтобы
 * клиент показал «Изменить отзыв»).
 */
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(PAGE_SIZE),
});

router.get('/', optionalAuth, validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const book = await findPublishedBook(req.params.id);
    const { page, limit } = req.query;
    const myUserId = req.user && req.user.userId ? req.user.userId : null;

    const filter = { bookId: book._id, isHidden: false };
    let myReview = null;

    if (myUserId) {
      const me = await User.findById(myUserId).select('blockedUsers').lean();
      const blocked = (me && me.blockedUsers) || [];
      if (blocked.length) {
        filter.userId = { $nin: blocked };
      }
      myReview = await Review.findOne({ bookId: book._id, userId: myUserId })
        .populate('userId', 'name avatarUrl')
        .lean();
    }

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name avatarUrl')
        .lean(),
      Review.countDocuments(filter),
    ]);

    return success(res, {
      items: reviews.map((r) => serializeReview(r, myUserId)),
      total,
      page,
      limit,
      hasMore: page * limit < total,
      rating: book.rating || 0,
      reviewCount: book.reviewCount || 0,
      myReview: myReview
        ? { ...serializeReview(myReview, myUserId), isHidden: !!myReview.isHidden }
        : null,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/books/:id/reviews
 * Body: { rating: 1..5, text?: string ≤1000 }
 * Upsert своего отзыва (один на разбор). Скрытый Анной отзыв правкой
 * не открывается — isHidden не трогаем.
 */
const upsertSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).default(''),
});

router.post('/', requireAuth, validate(upsertSchema), async (req, res, next) => {
  try {
    const book = await findPublishedBook(req.params.id);
    const userId = req.user.userId;

    const user = await User.findById(userId).lean();
    if (!user || user.isDeleted) {
      throw new AppError('UNAUTHORIZED', 'Пользователь не найден', 401);
    }
    if (user.isBanned) {
      throw new AppError('FORBIDDEN', 'Ваш аккаунт заблокирован за нарушение правил', 403);
    }

    const hasAccess = !!book.isFree || (await userHasBookAccess(book, user));
    if (!hasAccess) {
      throw new AppError('PURCHASE_REQUIRED', 'Отзыв могут оставить только слушатели разбора', 403);
    }

    const { rating, text } = req.body;
    const review = await Review.findOneAndUpdate(
      { bookId: book._id, userId },
      { $set: { rating, text } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    )
      .populate('userId', 'name avatarUrl')
      .lean();

    const summary = await recomputeBookRating(book._id);

    return success(res, {
      review: { ...serializeReview(review, userId), isHidden: !!review.isHidden },
      ...summary,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/books/:id/reviews/mine
 * Удалить свой отзыв. Если его нет — тоже успех (deleted: false).
 */
router.delete('/mine', requireAuth, async (req, res, next) => {
  try {
    const book = await findPublishedBook(req.params.id);
    const deleted = await Review.findOneAndDelete({
      bookId: book._id,
      userId: req.user.userId,
    }).lean();

    const summary = deleted
      ? await recomputeBookRating(book._id)
      : { rating: book.rating || 0, reviewCount: book.reviewCount || 0 };

    return success(res, { deleted: !!deleted, ...summary });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
