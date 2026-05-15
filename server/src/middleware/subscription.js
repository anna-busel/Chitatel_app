const mongoose = require('mongoose');
const { AppError } = require('./error');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');

/**
 * Middleware проверки подписки на клуб.
 *
 * Стек проверок:
 * 1. requireAuth должен быть до этого middleware (req.user.userId есть)
 * 2. Загружаем User из БД (для актуального subscriptionStatus и expiresAt)
 * 3. Проверяем статус:
 *    - 'basic' / 'premium' с актуальным subscriptionExpiresAt → пропускаем
 *    - 'expired' → 403 SUBSCRIPTION_REQUIRED (показать paywall)
 *    - 'free' → 403 SUBSCRIPTION_REQUIRED
 *
 * Архивный доступ обрабатывается отдельно — см. resolveClubAccess.
 *
 * После успешной проверки кладём req.subscriber = { userId, status, tier, expiresAt }
 */
const requireSubscription = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next(new AppError('UNAUTHORIZED', 'Требуется авторизация', 401));
    }

    const user = await User.findById(req.user.userId)
      .select('subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt role')
      .lean();

    if (!user) {
      return next(new AppError('UNAUTHORIZED', 'Пользователь не найден', 401));
    }

    // Админ имеет полный доступ ко всему (для тестирования + Анна как куратор клуба).
    if (user.role === 'admin') {
      req.subscriber = {
        userId: req.user.userId,
        status: 'admin',
        tier: 'admin',
        expiresAt: null,
        isActive: true,
      };
      return next();
    }

    const now = new Date();
    const isExpired =
      !user.subscriptionExpiresAt || user.subscriptionExpiresAt < now;

    // Grace period — Apple даёт 6 дней для retry billing, не отрубаем доступ.
    const isInGrace =
      user.gracePeriodExpiresAt && user.gracePeriodExpiresAt > now;

    const isActive =
      (user.subscriptionStatus === 'basic' ||
        user.subscriptionStatus === 'premium') &&
      (!isExpired || isInGrace);

    if (!isActive) {
      return next(
        new AppError(
          'SUBSCRIPTION_REQUIRED',
          'Для доступа к клубу нужна подписка',
          403
        )
      );
    }

    req.subscriber = {
      userId: req.user.userId,
      status: user.subscriptionStatus,
      tier: user.subscriptionStatus, // 'basic' | 'premium'
      expiresAt: user.subscriptionExpiresAt,
      isActive: true,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Middleware проверки админских прав (роль 'admin' в User).
 * Используется для эндпоинтов админки (закрепы, ответы в Q&A, модерация).
 *
 * Требует requireAuth до себя.
 */
const requireAdmin = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next(new AppError('UNAUTHORIZED', 'Требуется авторизация', 401));
    }

    const user = await User.findById(req.user.userId).select('role').lean();
    if (!user || user.role !== 'admin') {
      return next(new AppError('FORBIDDEN', 'Доступ только для администратора', 403));
    }

    req.isAdmin = true;
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Middleware определения уровня доступа к конкретному клубу.
 *
 * Решает три вопроса:
 * 1. Существует ли клуб с :clubMonthId?
 * 2. Активная подписка → доступ к ЛЮБОМУ клубу (включая архивные).
 * 3. Истёкшая подписка → доступ ТОЛЬКО к клубам с archiveUntilDate >= now
 *    И только если на момент окончания подписки клуб был активен/архивен
 *    (упрощение для MVP: даём доступ если archiveUntilDate >= now).
 *
 * Параметр клуба берётся из:
 * - req.params.clubMonthId (для конкретного клуба)
 * - req.query.clubMonthId
 * - req.body.clubMonthId
 * - Или активный клуб (если параметр не указан) — для удобства /api/club/current.
 *
 * Кладёт в req.club объект ClubMonth (full document, lean).
 *
 * Должен идти ПОСЛЕ requireAuth, но МОЖЕТ идти без requireSubscription —
 * сам разруливает архивный доступ.
 */
const resolveClubAccess = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next(new AppError('UNAUTHORIZED', 'Требуется авторизация', 401));
    }

    // Определяем какой клуб запрашивают.
    const requestedId =
      req.params.clubMonthId ||
      req.query.clubMonthId ||
      (req.body && req.body.clubMonthId);

    let club;
    if (requestedId) {
      if (!mongoose.Types.ObjectId.isValid(requestedId)) {
        return next(new AppError('NOT_FOUND', 'Неверный clubMonthId', 400));
      }
      club = await ClubMonth.findById(requestedId).lean();
    } else {
      // По умолчанию — активный клуб (для /api/club/current).
      const now = new Date();
      club = await ClubMonth.findOne({
        startsAt: { $lte: now },
        endsAt: { $gte: now },
      })
        .sort({ startsAt: -1 })
        .lean();
    }

    if (!club) {
      return next(new AppError('NOT_FOUND', 'Клуб не найден', 404));
    }

    // Загружаем юзера для проверки подписки.
    const user = await User.findById(req.user.userId)
      .select('subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt role')
      .lean();

    if (!user) {
      return next(new AppError('UNAUTHORIZED', 'Пользователь не найден', 401));
    }

    const now = new Date();

    // Админ — везде.
    if (user.role === 'admin') {
      req.club = club;
      req.clubAccess = { kind: 'admin', canPost: true };
      return next();
    }

    // Активная подписка — доступ ко всему.
    const isInGrace =
      user.gracePeriodExpiresAt && user.gracePeriodExpiresAt > now;
    const hasActiveSub =
      (user.subscriptionStatus === 'basic' ||
        user.subscriptionStatus === 'premium') &&
      (user.subscriptionExpiresAt > now || isInGrace);

    if (hasActiveSub) {
      req.club = club;
      req.clubAccess = {
        kind: 'active',
        tier: user.subscriptionStatus,
        canPost: true,
      };
      return next();
    }

    // Истёкшая подписка — проверяем архивный доступ (21 день после endsAt клуба).
    const hasArchiveAccess =
      club.archiveUntilDate && club.archiveUntilDate >= now;

    if (hasArchiveAccess) {
      req.club = club;
      req.clubAccess = {
        kind: 'archive',
        tier: 'expired',
        canPost: false, // read-only в архиве
      };
      return next();
    }

    return next(
      new AppError(
        'SUBSCRIPTION_REQUIRED',
        'Для доступа к клубу нужна подписка',
        403
      )
    );
  } catch (err) {
    return next(err);
  }
};

module.exports = { requireSubscription, requireAdmin, resolveClubAccess };
