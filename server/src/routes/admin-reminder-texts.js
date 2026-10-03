const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const ReminderText = require('../models/ReminderText');
const { peekNextText, ensureSeeded } = require('../services/reminder-text.service');

const router = Router();

// Список текстов напоминания «Запишите цитату» — только админ.
router.use(requireAuth, requireAdmin);

function serialize(t) {
  return {
    id: String(t._id),
    text: t.text,
    order: t.order,
    isActive: t.isActive,
  };
}

/* ------------------------------------------------------------------ *
 *                      СПИСОК + СЛЕДУЮЩИЙ                            *
 * ------------------------------------------------------------------ */
// GET /api/admin/reminder-texts — все формулировки по порядку очереди
// + какая уйдёт в следующий раз (курсор не сдвигается).
router.get('/', async (_req, res, next) => {
  try {
    // Первый заход — переносим статический список в БД (идемпотентно).
    await ensureSeeded();

    const items = await ReminderText.find().sort({ order: 1, _id: 1 }).lean();
    const next = await peekNextText();

    return success(res, {
      items: items.map(serialize),
      total: items.length,
      activeTotal: items.filter((t) => t.isActive).length,
      next, // строка или null — что уйдёт следующим напоминанием
    });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                           ДОБАВИТЬ                                 *
 * ------------------------------------------------------------------ */
const createSchema = z.object({
  text: z.string().trim().min(1, 'Текст обязателен').max(1000),
  order: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body;

    let order = data.order;
    if (typeof order !== 'number') {
      // По умолчанию — в конец очереди (максимум order + 1).
      const last = await ReminderText.findOne()
        .sort({ order: -1 })
        .select('order')
        .lean();
      order = last ? last.order + 1 : 0;
    }

    const item = await ReminderText.create({
      text: data.text,
      order,
      isActive: data.isActive,
    });

    return success(res, { item: serialize(item) }, 201);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                          РЕДАКТИРОВАТЬ                             *
 * ------------------------------------------------------------------ */
const updateSchema = z.object({
  text: z.string().trim().min(1).max(1000).optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Текст не найден', 404);
    }
    const item = await ReminderText.findById(req.params.id);
    if (!item) {
      throw new AppError('NOT_FOUND', 'Текст не найден', 404);
    }

    const data = req.body;
    if (typeof data.text === 'string') item.text = data.text;
    if (typeof data.order === 'number') item.order = data.order;
    if (typeof data.isActive === 'boolean') item.isActive = data.isActive;
    await item.save();

    return success(res, { item: serialize(item) });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                            УДАЛИТЬ                                 *
 * ------------------------------------------------------------------ */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Текст не найден', 404);
    }
    const item = await ReminderText.findById(req.params.id);
    if (!item) {
      throw new AppError('NOT_FOUND', 'Текст не найден', 404);
    }
    await item.deleteOne();
    return success(res, { deleted: true, id: String(item._id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
