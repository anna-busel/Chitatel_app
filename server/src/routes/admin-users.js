const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const logger = require('../config/logger');
const User = require('../models/User');
const Book = require('../models/Book');
const Package = require('../models/Package');
const entitlement = require('../services/entitlement.service');
const { linkUserSafe } = require('../crm/services/access.service');

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

// 05.11.2026 (CRM-PLAN B1): выдача и снятие прав (подписка, месяцы, Тариф 2,
// разборы, пакеты) и записи Purchase — в services/entitlement.service.js,
// общем с CRM. Роуты ниже только проверяют ввод и отвечают как раньше.

/* ------------------------------------------------------------------ *
 *                       СПИСОК / ПОИСК                               *
 * ------------------------------------------------------------------ */

const listSchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
  // 02.10.2026: сортировка и фильтры. До этого список отдавал жёстко свежих
  // и без отбора — при 167 участницах остальных можно было найти только
  // поиском, а с переводом людей из телеграма это стало неудобно совсем.
  sort: z.enum(['new', 'name', 'expires']).optional().default('new'),
  status: z
    .enum(['all', 'active', 'expired', 'free', 'banned'])
    .optional()
    .default('all'),
  platform: z.enum(['all', 'ios', 'android']).optional().default('all'),
});

const SORTS = {
  new: { createdAt: -1 },
  name: { name: 1 },
  // Сначала те, у кого срок ближе к концу — за ними следить важнее всего.
  expires: { subscriptionExpiresAt: 1 },
};

/**
 * GET /api/admin/users?q=&limit=&offset=&sort=&status=&platform=
 * Список/поиск участниц. Ищет по имени, почте, почте рассылки, коду и id.
 */
router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { q, limit, offset, sort, status, platform } = req.query;
    const filter = { isDeleted: { $ne: true } };

    const nowDate = new Date();
    if (status === 'active') {
      filter.subscriptionStatus = { $in: ['basic', 'premium'] };
      filter.subscriptionExpiresAt = { $gt: nowDate };
    } else if (status === 'expired') {
      filter.$and = [
        {
          $or: [
            { subscriptionStatus: 'expired' },
            {
              subscriptionStatus: { $in: ['basic', 'premium'] },
              subscriptionExpiresAt: { $lte: nowDate },
            },
          ],
        },
      ];
    } else if (status === 'free') {
      filter.subscriptionStatus = 'free';
    } else if (status === 'banned') {
      filter.isBanned = true;
    }

    // Платформа — по зарегистрированным устройствам (User.devices).
    // ⚠️ Токены пишутся при регистрации push, а на Android пушей пока нет
    // (блок C ANDROID-PLAN), поэтому фильтр «Android» сейчас почти пуст.
    // Заработает сам, как только появятся токены.
    if (platform === 'ios' || platform === 'android') {
      filter['devices.platform'] = platform;
    }
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { marketingEmail: rx }];
      // 02.10.2026: поиск по идентификатору и реферальному коду. Нужен для
      // участниц, которых не найти по почте — у вошедших через Apple со
      // «Скрыть e-mail» в базе relay-адрес, а у части почты нет вовсе.
      // Идентификатор виден в строке списка, код — в карточке.
      if (mongoose.Types.ObjectId.isValid(q)) {
        filter.$or.push({ _id: new mongoose.Types.ObjectId(q) });
      }
      filter.$or.push({ referralCode: rx });
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(
          'name email role subscriptionStatus subscriptionExpiresAt isBanned avatarUrl createdAt'
        )
        .sort(SORTS[sort] || SORTS.new)
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
          'clubMonthsEntitled tier2MonthsEntitled hasArchiveAccess purchasedBooks purchasedPackages ' +
          'isBanned mutedUntil onboardingCompleted country city avatarUrl createdAt ' +
          // 02.10.2026: subscriptionPlatform — видно, откуда подписка (Apple,
          // Google или выдана вручную); devices — с каких платформ заходили;
          // referralCode — по нему можно найти участницу, у которой почта
          // скрыта провайдером входа.
          'subscriptionPlatform devices referralCode'
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
        await entitlement.clearSubscription(user);
        return success(res, { ok: true, subscriptionStatus: 'free' });
      }

      // Срок: либо ПРОИЗВОЛЬНАЯ дата (перенос уже оплаченных абонементов),
      // либо длительность плана от текущего момента; клубные месяцы, Тариф 2
      // (status=premium) и запись Purchase — в entitlement.service.
      const { expiresAt } = await entitlement.grantManualSubscription(user, {
        status,
        plan,
        expiresAt: data.expiresAt,
      });

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
    const user = await User.findById(req.params.id).select('purchasedBooks');
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }
    await entitlement.grantBooks(user, [book]);

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
      .select('_id bookSlug')
      .lean();
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор с таким slug не найден', 404);
    }
    // Ручная выдача пишет Purchase (platform 'web') — сервис помечает её
    // отменённой, иначе разбор останется в «Мои покупки» и в «Оплатах».
    // Покупки из App Store / Google Play не трогаем (03.11.2026).
    await entitlement.revokeBook(req.params.id, book);
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                     СНЯТИЕ КЛУБНОГО МЕСЯЦА                          *
 * ------------------------------------------------------------------ */

const clubMonthSchema = z.object({
  // Ключ месяца 'YYYY-M' БЕЗ ведущего нуля — как clubMonthKey в
  // middleware/subscription.js и как их пишет entitlement.clubMonthKeysBetween.
  month: z.string().trim().regex(/^\d{4}-(1[0-2]|[1-9])$/, 'Формат месяца: 2026-10'),
});

/**
 * POST /api/admin/users/:id/revoke-club-month
 * Убрать у участницы доступ к одному клубному месяцу.
 *
 * Зачем отдельная ручка: clubMonthsEntitled намеренно живёт отдельно от
 * подписки — оплаченный месяц остаётся доступным и после её окончания
 * (обещано в описании и условиях). Поэтому снятие подписки (status=free)
 * месяцы НЕ трогает, и до этой ручки забрать выданный доступ было нечем:
 * ошибочно выданный «Год» или бесплатный доступ тестировщицам оставались
 * навсегда.
 *
 * Снимаем по одному месяцу, а не списком целиком: у участницы рядом могут
 * лежать реально оплаченные месяцы, их трогать нельзя.
 */
router.post(
  '/:id/revoke-club-month',
  validate(clubMonthSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
      }
      // Тариф 2 и «чат остаётся» без клуба не бывают — снимаются вместе с ним.
      const user = await entitlement.revokeClubMonth(req.params.id, req.body.month);
      if (!user) {
        throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
      }

      logger.info('Club month revoked', {
        userId: req.params.id,
        month: req.body.month,
      });

      return success(res, {
        ok: true,
        clubMonthsEntitled: user.clubMonthsEntitled || [],
      });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *          ТАРИФ 2 «КЛУБ + ВСТРЕЧИ» НА МЕСЯЦ (UPDATES-PLAN M)         *
 * ------------------------------------------------------------------ */

/**
 * POST /api/admin/users/:id/grant-tier2-month  { month: '2026-11' }
 * Добавить Тариф 2 на месяц тому, у кого клуб этого месяца уже есть
 * (купила базовый в приложении, на сайте, выдан вручную). Тариф 2 = клуб +
 * встречи, поэтому без клубного месяца не выдаём: сначала «Выдать подписку».
 */
router.post(
  '/:id/grant-tier2-month',
  validate(clubMonthSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
      }
      const { month } = req.body;
      const user = await entitlement.grantTier2Month(req.params.id, month);

      logger.info('Tier2 month granted', { userId: req.params.id, month });
      return success(res, {
        ok: true,
        tier2MonthsEntitled: user.tier2MonthsEntitled || [],
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/users/:id/revoke-tier2-month  { month: '2026-11' }
 * Убрать Тариф 2 за месяц. Клуб этого месяца остаётся.
 */
router.post(
  '/:id/revoke-tier2-month',
  validate(clubMonthSchema),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
      }
      const user = await entitlement.revokeTier2Month(req.params.id, req.body.month);
      if (!user) {
        throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
      }
      logger.info('Tier2 month revoked', {
        userId: req.params.id,
        month: req.body.month,
      });
      return success(res, {
        ok: true,
        tier2MonthsEntitled: user.tier2MonthsEntitled || [],
      });
    } catch (err) {
      return next(err);
    }
  }
);

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
    const user = await User.findById(req.params.id).select('purchasedPackages');
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }
    await entitlement.grantPackage(user, pkg);

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
      .select('_id packageSlug')
      .lean();
    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Пакет с таким slug не найден', 404);
    }
    // См. revoke-book: ручную выдачу помечаем отменённой (03.11.2026).
    await entitlement.revokePackage(req.params.id, pkg);
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                          РОЛЬ / БАН                                  *
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
    // При бане рвём все сессии (refreshTokens) — refresh больше не пройдёт.
    const update = { $set: { isBanned: req.body.banned } };
    if (req.body.banned) {
      update.$set.refreshTokens = [];
    }
    await User.findByIdAndUpdate(req.params.id, update);
    return success(res, { ok: true, isBanned: req.body.banned });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                      ВХОД: ПОЧТА И ПАРОЛЬ                           *
 * ------------------------------------------------------------------ *
 * 02.10.2026. Обе ручки появились из одной дыры: у аккаунта, созданного
 * через Apple или Google, пароля в базе НЕТ, а восстановления пароля в
 * проекте нет совсем — ни роута, ни экрана, ни отправки писем. Человек,
 * потерявший вход, упирается в стену, и помочь ему было нечем.
 *
 * Отдельная беда — вход через Apple со «Скрыть e-mail»: в базе оказывается
 * relay-адрес вида ...@privaterelay.appleid.com, а у части аккаунтов почты
 * нет вовсе (apple-auth.service намеренно не пишет пустое поле). Такую
 * участницу невозможно ни найти по её настоящему адресу, ни связать с
 * оплатой из списка, ни привязать к Google. На 01.10.2026 таких аккаунтов
 * 53 из 167.
 */

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'Пароль не короче 8 символов')
    .max(72, 'Пароль не длиннее 72 символов'),
});

/**
 * POST /api/admin/users/:id/password
 * Задать участнице пароль — чтобы она могла войти по почте.
 *
 * ⚠️ Вместе с паролем переключаем authProvider на 'email': логин по почте
 * пускает ТОЛЬКО аккаунты с authProvider === 'email' и непустым passwordHash
 * (auth.service.login). Входу через Apple и Google это не мешает — они ищут
 * человека по appleUserId / googleUserId, а не по authProvider.
 *
 * Пароль не возвращаем: его знает тот, кто его назначил.
 */
router.post('/:id/password', validate(passwordSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const user = await User.findById(req.params.id).select('email').lean();
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }
    // Без почты входить будет нечем: логин — это пара «почта + пароль».
    if (!user.email) {
      throw new AppError(
        'VALIDATION_ERROR',
        'У аккаунта нет почты — сначала задайте её, иначе входить будет нечем',
        400
      );
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await User.findByIdAndUpdate(req.params.id, {
      $set: { passwordHash, authProvider: 'email' },
    });

    logger.info('Admin set password', { userId: String(req.params.id) });
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный адрес почты'),
});

/**
 * POST /api/admin/users/:id/email
 * Сменить аккаунтную почту участницы.
 *
 * ⚠️ Поле уникальное (sparse unique index), поэтому перед сохранением
 * проверяем, что адрес не занят другим живым аккаунтом — иначе mongo вернёт
 * невнятную ошибку дубликата.
 *
 * Вход через Apple и Google после смены не ломается: они опознают человека по
 * appleUserId / googleUserId. Наоборот, правильная почта делает возможной
 * привязку Google к существующему аккаунту (google-auth.service ищет по почте).
 */
router.post('/:id/email', validate(emailSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
    }
    const email = req.body.email;

    const taken = await User.findOne({ email, isDeleted: { $ne: true } })
      .select('_id')
      .lean();
    if (taken && String(taken._id) !== String(req.params.id)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Эта почта уже занята другим аккаунтом',
        409
      );
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { email } },
      { new: true }
    ).select('email');
    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    logger.info('Admin changed email', { userId: String(req.params.id) });
    // CRM B5 (05.11.2026): заказы, оплаченные на эту почту, открываются сразу.
    // Ошибка CRM смену почты не ломает (linkUserSafe ловит и пишет в лог).
    await linkUserSafe(user, 'admin-email');
    return success(res, { ok: true, email: user.email });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
