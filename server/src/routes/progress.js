const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Progress = require('../models/Progress');
const Book = require('../models/Book');

const router = Router();

// Все endpoints требуют авторизацию — прогресс привязан к юзеру.
router.use(requireAuth);

/**
 * GET /api/progress/:bookId
 * Получить прогресс юзера по конкретной книге.
 * Если прогресса нет — возвращает defaults (часть 1, позиция 0).
 */
router.get('/:bookId', async (req, res, next) => {
  try {
    const { bookId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      throw new AppError('BOOK_NOT_FOUND', 'Неверный bookId', 400);
    }

    const progress = await Progress.findOne({
      userId: req.user.userId,
      bookId,
    }).lean();

    if (!progress) {
      // Прогресса нет — возвращаем дефолт чтобы плеер начал с начала.
      return success(res, {
        progress: {
          bookId,
          currentPartNumber: 1,
          positionSeconds: 0,
          listenedPartNumbers: [],
          totalListenedSeconds: 0,
          lastListenedAt: null,
        },
      });
    }

    return success(res, { progress });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/progress
 * Сохранить/обновить прогресс. Шлётся плеером каждые 30 секунд + при pause/выходе.
 *
 * Body:
 * - bookId (string, required) — ObjectId книги
 * - currentPartNumber (int, required) — номер текущей части (1-based)
 * - positionSeconds (int, required) — позиция в секундах в текущей части
 * - markPartCompleted (bool, optional) — пометить currentPartNumber как прослушанную
 */
const updateSchema = z.object({
  bookId: z.string().refine((s) => mongoose.Types.ObjectId.isValid(s), {
    message: 'bookId должен быть валидным ObjectId',
  }),
  currentPartNumber: z.number().int().min(1),
  positionSeconds: z.number().int().min(0),
  markPartCompleted: z.boolean().optional(),
});

router.post('/', validate(updateSchema), async (req, res, next) => {
  try {
    const {
      bookId,
      currentPartNumber,
      positionSeconds,
      markPartCompleted,
    } = req.body;

    // Проверяем что книга существует и часть валидна.
    const book = await Book.findById(bookId).select('parts').lean();
    if (!book) {
      throw new AppError('BOOK_NOT_FOUND', 'Книга не найдена', 404);
    }
    const partExists = book.parts.some((p) => p.number === currentPartNumber);
    if (!partExists) {
      throw new AppError('NOT_FOUND', 'Часть не найдена', 404);
    }

    // Получаем существующий прогресс (или null).
    const existing = await Progress.findOne({
      userId: req.user.userId,
      bookId,
    });

    const previousSeconds = existing ? existing.positionSeconds : 0;
    const previousPart = existing ? existing.currentPartNumber : currentPartNumber;

    // Сколько секунд добавилось с прошлого сохранения.
    // Если юзер перемотал назад или сменил часть — не учитываем дельту.
    let secondsDelta = 0;
    if (currentPartNumber === previousPart && positionSeconds > previousSeconds) {
      secondsDelta = positionSeconds - previousSeconds;
    }

    // Готовим обновление
    const listenedSet = new Set(existing ? existing.listenedPartNumbers : []);
    if (markPartCompleted === true) {
      listenedSet.add(currentPartNumber);
    }

    const updated = await Progress.findOneAndUpdate(
      { userId: req.user.userId, bookId },
      {
        $set: {
          currentPartNumber,
          positionSeconds,
          listenedPartNumbers: Array.from(listenedSet).sort((a, b) => a - b),
          lastListenedAt: new Date(),
        },
        $inc: { totalListenedSeconds: secondsDelta },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return success(res, { progress: updated });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
