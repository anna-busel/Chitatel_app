const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const DailyThought = require('../models/DailyThought');
const { thoughtForDate, ensureSeeded } = require('../services/thought.service');

const router = Router();

// Управление «Мыслью дня» — только админ.
router.use(requireAuth, requireAdmin);

function serialize(t) {
  return {
    id: String(t._id),
    text: t.text,
    author: t.author,
    order: t.order,
    isActive: t.isActive,
  };
}

/* ------------------------------------------------------------------ *
 *                        СПИСОК + ТЕКУЩАЯ                            *
 * ------------------------------------------------------------------ */
// GET /api/admin/thoughts — все фразы (по порядку) + какая показывается сегодня.
router.get('/', async (_req, res, next) => {
  try {
    // Первый заход — переносим статический список в БД (идемпотентно).
    await ensureSeeded();

    const thoughts = await DailyThought.find()
      .sort({ order: 1, _id: 1 })
      .lean();

    const today = await thoughtForDate(Date.now());

    return success(res, {
      items: thoughts.map(serialize),
      total: thoughts.length,
      today, // { text, author } — что видят участницы сегодня
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
  author: z.string().trim().max(120).default('Анна Бусел'),
  order: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const data = req.body;

    let order = data.order;
    if (typeof order !== 'number') {
      // По умолчанию — в конец списка (максимум order + 1).
      const last = await DailyThought.findOne().sort({ order: -1 }).select('order').lean();
      order = last ? last.order + 1 : 0;
    }

    const thought = await DailyThought.create({
      text: data.text,
      author: data.author || 'Анна Бусел',
      order,
      isActive: data.isActive,
    });

    return success(res, { thought: serialize(thought) }, 201);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                          РЕДАКТИРОВАТЬ                             *
 * ------------------------------------------------------------------ */
const updateSchema = z.object({
  text: z.string().trim().min(1).max(1000).optional(),
  author: z.string().trim().max(120).optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:id', validate(updateSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Фраза не найдена', 404);
    }
    const thought = await DailyThought.findById(req.params.id);
    if (!thought) {
      throw new AppError('NOT_FOUND', 'Фраза не найдена', 404);
    }

    const data = req.body;
    if (typeof data.text === 'string') thought.text = data.text;
    if (typeof data.author === 'string') thought.author = data.author;
    if (typeof data.order === 'number') thought.order = data.order;
    if (typeof data.isActive === 'boolean') thought.isActive = data.isActive;
    await thought.save();

    return success(res, { thought: serialize(thought) });
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
      throw new AppError('NOT_FOUND', 'Фраза не найдена', 404);
    }
    const thought = await DailyThought.findById(req.params.id);
    if (!thought) {
      throw new AppError('NOT_FOUND', 'Фраза не найдена', 404);
    }
    await thought.deleteOne();
    return success(res, { deleted: true, id: String(thought._id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
