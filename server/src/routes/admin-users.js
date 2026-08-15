const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  requireAdmin,
  planDurationMonths,
  clubMonthKeysForPurchase,
} = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const logger = require('../config/logger');
const User = require('../models/User');
const Book = require('../models/Book');
const Package = require('../models/Package');
const Purchase = require('../models/Purchase');

/**
 * Админ: управление пользователями (задача 6.6).
 *
 * Монтируется на /api/admin/users. Все эндпоинты под requireAuth + requireAdmin.
 *
 * Ключевое — РУЧНАЯ выдача доступа: подписка, отдельные разборы и пакеты.
 * Нужна для РФ/РБ (оплата вне Apple), компенсаций и подарков. Права пишем в те
 * же денормализованные поля User, по которым реально проверяется доступ
 * (purchasedBooks / purchasedPackages / clubMonthsEntitled / subscription*),
 * поэтому ручная выдача работает идентично оплате. Запись Purchase создаём
 * best-effort (история) — она не критична для доступа.
 */

const router = Router();
router.use(requireAuth, requireAdmin);

// Экранирование пользовательского ввода для RegExp-поиска.
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Синтетический transactionId для ручной операции (Purchase.transactionId
// уникален и sparse — коллизий не будет).
function manualTxId(prefix, userId, tail) {
  return `manual-${prefix}-${userId}-${tail}-${Date.now()}`;
}

/* ------------------------------------------------------------------ *
 *                       СПИСОК / ПОИСК                               *
 * ------------------------------------------------------------------ */

const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/admin/users?q=&limit=&offset=
 * Список/поиск участниц (по имени, email, почте рассылки). Свежие сверху.
 */
router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { q, limit, offset } = req.query;
    const filter = { isDeleted: { $ne: true } };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { marketingEmail: rx }];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(
          'name email role subscriptionStatus subscriptionExpiresAt isBanned avatarUrl createdAt'
        )
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return success(res, { users, total, limit, offset });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                          КАРТОЧКА                                  *
 * ------------------------------------------------------------------ */

/**
 * GET /api/admin/users/:id
 * Полная карточка участницы для админки.
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const user = await User.findById(req.params.id)
      .select(
        'name email marketingEmail role authProvider subscriptionStatus ' +
          'subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt ' +
          'clubMonthsEntitled hasArchiveAccess purchasedBooks purchasedPackages ' +
          'isBanned mutedUntil onboardingCompleted country city avatarUrl createdAt'
      )
      .populate('purchasedBooks', 'title bookSlug')
      .populate('purchasedPackages', 'title packageSlug')
      .lean();
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }
    return success(res, { user });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                     ВЫДАЧА / СНЯТИЕ ПОДПИСКИ                       *
 * ------------------------------------------------------------------ */

/**
 * Ключи клубных месяцев 'YYYY-MM' от from до to включительно (UTC). Нужны при
 * выдаче подписки с ПРОИЗВОЛЬНОЙ датой окончания (перенос уже оплаченных
 * абонементов): по этим месяцам открывается книга клуба.
 */
function clubMonthKeysBetween(from, to) {
  const keys = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const ey = to.getUTCFullYear();
  const em = to.getUTCMonth();
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

const subSchema = z.object({
  status: z.enum(['basic', 'premium', 'free']),
  plan: z
    .enum(['monthly', 'season', 'semiannual', 'annual'])
    .optional()
    .default('monthly'),
  // Произвольная дата окончания (перенос уже оплаченных абонементов). Если
  // задана — срок и клубные месяцы считаются по ней, а не по длительности плана.
  expiresAt: z.coerce.date().optional(),
});

/**
 * POST /api/admin/users/:id/subscription
 * Ручная выдача/продление или снятие подписки.
 *
 * status=basic|premium — активирует подписку: срок = длительность плана от
 * текущего момента, и в clubMonthsEntitled добавляются клубные месяцы этого
 * периода (иначе книга клуба не откроется). status=free — снимает подписку.
 */
router.post(
  '/:id/subscription',
  validate(subSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
      }
      const user = await User.findById(req.params.id);
      if (!user) {
        throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
      }

      const data = req.body;
      const { status, plan } = data;

      if (status === 'free') {
        user.subscriptionStatus = 'free';
        user.subscriptionPlan = null;
        user.subscriptionExpiresAt = null;
        await user.save();
        return success(res, { ok: true, subscriptionStatus: 'free' });
      }

      const now = new Date();

      // Срок: либо ПРОИЗВОЛЬНАЯ дата (перенос уже оплаченных абонементов),
      // либо длительность плана от текущего момента.
      let expiresAt;
      if (data.expiresAt) {
        expiresAt = data.expiresAt;
        if (expiresAt.getTime() <= now.getTime()) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Дата окончания должна быть в будущем',
            400
          );
        }
      } else {
        const months = planDurationMonths(plan);
        expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + months);
      }

      user.subscriptionStatus = status;
      user.subscriptionPlan = plan;
      user.subscriptionExpiresAt = expiresAt;

      // Клубные месяцы, по которым открывается книга клуба. Для произвольной
      // даты — все месяцы от сейчас до даты включительно; иначе — по плану.
      const keys = data.expiresAt
        ? clubMonthKeysBetween(now, expiresAt)
        : clubMonthKeysForPurchase(now, plan);
      const set = new Set([...(user.clubMonthsEntitled || []), ...keys]);
      user.clubMonthsEntitled = [...set];

      await user.save();

      // История (best-effort).
      Purchase.create({
        userId: user._id,
        itemType: 'subscription',
        itemId: plan,
        platform: 'web',
        appleProductId: null,
        transactionId: manualTxId('sub', user._id, plan),
        purchasedAt: now,
        expiresAt,
        status: 'active',
      }).catch((e) =>
        logger.warn('manual subscription Purchase не записан', {
          message: e.message,
        })
      );

      return success(res, {
        ok: true,
        subscriptionStatus: status,
        subscriptionPlan: plan,
        subscriptionExpiresAt: expiresAt,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                   ВЫДАЧА / СНЯТИЕ ДОСТУПА К РАЗБОРУ                *
 * ------------------------------------------------------------------ */

const bookSchema = z.object({ bookSlug: z.string().trim().min(1).max(120) });

/**
 * POST /api/admin/users/:id/grant-book
 * Открыть участнице доступ к отдельному разбору без оплаты.
 */
router.post('/:id/grant-book', validate(bookSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const book = await Book.findOne({ bookSlug: req.body.bookSlug })
      .select('_id title bookSlug priceUsd')
      .lean();
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор с таким slug не найден', 404);
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { purchasedBooks: book._id } },
      { new: true }
    ).select('_id');
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    Purchase.create({
      userId: user._id,
      itemType: 'book',
      itemId: book.bookSlug,
      platform: 'web',
      appleProductId: `book.${book.bookSlug}`,
      transactionId: manualTxId('book', user._id, book.bookSlug),
      priceUsd: book.priceUsd || 0,
      purchasedAt: new Date(),
      status: 'active',
    }).catch((e) =>
      logger.warn('manual book Purchase не записан', { message: e.message })
    );

    return success(res, { ok: true, book: { title: book.title, bookSlug: book.bookSlug } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/users/:id/revoke-book
 * Убрать доступ к отдельному разбору.
 */
router.post('/:id/revoke-book', validate(bookSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const book = await Book.findOne({ bookSlug: req.body.bookSlug })
      .select('_id')
      .lean();
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор с таким slug не найден', 404);
    }
    await User.findByIdAndUpdate(req.params.id, {
      $pull: { purchasedBooks: book._id },
    });
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                   ВЫДАЧА / СНЯТИЕ ДОСТУПА К ПАКЕТУ                 *
 * ------------------------------------------------------------------ */

const pkgSchema = z.object({ packageSlug: z.string().trim().min(1).max(120) });

/**
 * POST /api/admin/users/:id/grant-package
 * Открыть доступ к пакету разборов без оплаты.
 */
router.post('/:id/grant-package', validate(pkgSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const pkg = await Package.findOne({ packageSlug: req.body.packageSlug })
      .select('_id title packageSlug priceUsd')
      .lean();
    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Пакет с таким slug не найден', 404);
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { purchasedPackages: pkg._id } },
      { new: true }
    ).select('_id');
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    Purchase.create({
      userId: user._id,
      itemType: 'package',
      itemId: pkg.packageSlug,
      platform: 'web',
      appleProductId: `package.${pkg.packageSlug}`,
      transactionId: manualTxId('pkg', user._id, pkg.packageSlug),
      priceUsd: pkg.priceUsd || 0,
      purchasedAt: new Date(),
      status: 'active',
    }).catch((e) =>
      logger.warn('manual package Purchase не записан', { message: e.message })
    );

    return success(res, { ok: true, package: { title: pkg.title, packageSlug: pkg.packageSlug } });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/admin/users/:id/revoke-package
 */
router.post('/:id/revoke-package', validate(pkgSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const pkg = await Package.findOne({ packageSlug: req.body.packageSlug })
      .select('_id')
      .lean();
    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Пакет с таким slug не найден', 404);
    }
    await User.findByIdAndUpdate(req.params.id, {
      $pull: { purchasedPackages: pkg._id },
    });
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                          РОЛЬ / БАН                                *
 * ------------------------------------------------------------------ */

const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

/**
 * POST /api/admin/users/:id/role
 * Назначить/снять роль (участница ↔ админ/модератор).
 */
router.post('/:id/role', validate(roleSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    // Себе роль не снимаем — чтобы не потерять единственного админа случайно.
    if (
      String(req.params.id) === String(req.user.userId) &&
      req.body.role !== 'admin'
    ) {
      throw new AppError(
        'FORBIDDEN',
        'Нельзя снять админ-роль с самого себя',
        403
      );
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role: req.body.role } },
      { new: true }
    ).select('role');
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }
    return success(res, { ok: true, role: user.role });
  } catch (err) {
    return next(err);
  }
});

const banSchema = z.object({ banned: z.boolean() });

/**
 * POST /api/admin/users/:id/ban
 * Заблокировать/разблокировать участницу. Админа заблокировать нельзя.
 */
router.post('/:id/ban', validate(banSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const target = await User.findById(req.params.id).select('role').lean();
    if (!target) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }
    if (req.body.banned && target.role === 'admin') {
      throw new AppError('FORBIDDEN', 'Админа заблокировать нельзя', 403);
    }
    await User.findByIdAndUpdate(req.params.id, {
      $set: { isBanned: req.body.banned },
    });
    return success(res, { ok: true, isBanned: req.body.banned });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
