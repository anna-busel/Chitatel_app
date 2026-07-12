const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success, paginated } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Quote = require('../models/Quote');
const User = require('../models/User');
const { analyzeQuoteInBackground } = require('../services/ai.service');

const router = Router();

// Дневник — всегда личный, все эндпоинты под авторизацией.
router.use(requireAuth);

// Anti-spam: не больше 50 цитат в сутки (MASTER 7.5 → QUOTE_LIMIT_REACHED).
const DAILY_QUOTE_LIMIT = 50;

/**
 * POST /api/quotes
 * Сохранить цитату (шторка 4.17). Если у юзера включён ИИ-анализ (aiConsent),
 * анализ запускается в фоне: цитата сразу возвращается со статусом 'pending',
 * клиент увидит готовый анализ при следующем чтении.
 */
const createSchema = z.object({
  text: z.string().min(1).max(2000),
  author: z.string().max(200).optional(),
  bookTitle: z.string().max(300).optional(),
  bookId: z
    .string()
    .refine((s) => mongoose.Types.ObjectId.isValid(s), {
      message: 'bookId должен быть валидным ObjectId',
    })
    .optional(),
  audioTimestamp: z.number().int().min(0).optional(),
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const { text, author, bookTitle, bookId, audioTimestamp } = req.body;

    // Лимит цитат за последние сутки.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayCount = await Quote.countDocuments({
      userId: req.user.userId,
      createdAt: { $gte: since },
    });
    if (todayCount >= DAILY_QUOTE_LIMIT) {
      throw new AppError(
        'QUOTE_LIMIT_REACHED',
        'Достигнут дневной лимит цитат',
        429
      );
    }

    const user = await User.findById(req.user.userId).select('aiConsent').lean();
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    const quote = await Quote.create({
      userId: req.user.userId,
      text,
      author: author || null,
      bookTitle: bookTitle || null,
      bookId: bookId || null,
      audioTimestamp: audioTimestamp ?? null,
      // Без согласия — 'skipped': в OpenAI не уходит ничего (Apple 5.1.2(i)).
      aiStatus: user.aiConsent === true ? 'pending' : 'skipped',
    });

    if (user.aiConsent === true) {
      analyzeQuoteInBackground(quote.toObject(), user);
    }

    return success(res, { quote: quote.toObject() }, 201);
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/quotes?page=&limit=&bookId=
 * Лента дневника (4.24): новые сверху, с пагинацией.
 */
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  bookId: z
    .string()
    .refine((s) => mongoose.Types.ObjectId.isValid(s), {
      message: 'bookId должен быть валидным ObjectId',
    })
    .optional(),
});

router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit, bookId } = req.query;

    const filter = { userId: req.user.userId };
    if (bookId) {
      filter.bookId = bookId;
    }

    const [items, total] = await Promise.all([
      Quote.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Quote.countDocuments(filter),
    ]);

    return paginated(res, { items, total, page, limit });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/quotes/:id
 * Одна цитата с анализом (экран 4.25).
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('NOT_FOUND', 'Цитата не найдена', 404);
    }

    const quote = await Quote.findOne({
      _id: id,
      userId: req.user.userId,
    }).lean();

    if (!quote) {
      throw new AppError('NOT_FOUND', 'Цитата не найдена', 404);
    }

    return success(res, { quote });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/quotes/:id
 * Удалить свою цитату.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('NOT_FOUND', 'Цитата не найдена', 404);
    }

    const deleted = await Quote.findOneAndDelete({
      _id: id,
      userId: req.user.userId,
    }).lean();

    if (!deleted) {
      throw new AppError('NOT_FOUND', 'Цитата не найдена', 404);
    }

    return success(res, { message: 'Цитата удалена' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
