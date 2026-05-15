const mongoose = require('mongoose');
const { AppError } = require('./error');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');

/**
 * Middleware проверки подписки на клуб.
 *
 * Стек проверок:
 * 1. requireAuth должен быть до этого middleware (req.user.userId есть)
 * 2. Загружаем User из БД
 * 3. Проверяем бан/мьют (модерация 4.4)
 * 4. Проверяем статус подписки + grace period
 *
 * Архивный доступ обрабатывается отдельно — см. resolveClubAccess.
 */
const requireSubscription = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next(new AppError('UNAUTHORIZED', 'Требуется авторизация', 401));
    }

    const user = await User.findById(req.user.userId)
      .select(
        'subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt role isBanned mutedUntil'
      )
      .lean();

    if (!user) {
      return next(new AppError('UNAUTHORIZED', 'Пользователь не найден', 401));
    }

    if (user.isBanned) {
      return next(
        new AppError(
          'CLUB_BLOCKED',
          'Ваш аккаунт заблокирован за нарушение правил',
          403
        )
      );
    }

    // Админ имеет полный доступ ко всему.
    if (user.role === 'admin') {
      req.subscriber = {
        userId: req.user.userId,
        status: 'admin',
        tier: 'admin',
        expiresAt: null,
        isActive: true,
        isMuted: false,
      };
      return next();
    }

    const now = new Date();
    const isExpired =
      !user.subscriptionExpiresAt || user.subscriptionExpiresAt < now;

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

    const isMuted = user.mutedUntil && user.mutedUntil > now;

    req.subscriber = {
      userId: req.user.userId,
      status: user.subscriptionStatus,
      tier: user.subscriptionStatus,
      expiresAt: user.subscriptionExpiresAt,
      isActive: true,
      isMuted,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * Middleware проверки админских прав (роль 'admin' в User).
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
 * 1. Бан → 403 CLUB_BLOCKED
 * 2. Активная подписка → доступ ко всему, canPost=true (если не муьт)
 * 3. Истёкшая + клуб в архиве (archiveUntilDate >= now) → read-only
 * 4. Иначе → 403 SUBSCRIPTION_REQUIRED
 *
 * Mute не блокирует чтение, только запись (canPost=false).
 *
 * Кладёт в req.club и req.clubAccess.
 */
const resolveClubAccess = async (req, _res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return next(new AppError('UNAUTHORIZED', 'Требуется авторизация', 401));
    }

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

    const user = await User.findById(req.user.userId)
      .select(
        'subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt role isBanned mutedUntil'
      )
      .lean();

    if (!user) {
      return next(new AppError('UNAUTHORIZED', 'Пользователь не найден', 401));
    }

    if (user.isBanned) {
      return next(
        new AppError(
          'CLUB_BLOCKED',
          'Ваш аккаунт заблокирован за нарушение правил',
          403
        )
      );
    }

    const now = new Date();
    const isMuted = user.mutedUntil && user.mutedUntil > now;

    // Админ — везде.
    if (user.role === 'admin') {
      req.club = club;
      req.clubAccess = { kind: 'admin', canPost: true, isMuted: false };
      return next();
    }

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
        canPost: !isMuted,
        isMuted,
        mutedUntil: isMuted ? user.mutedUntil : null,
      };
      return next();
    }

    const hasArchiveAccess =
      club.archiveUntilDate && club.archiveUntilDate >= now;

    if (hasArchiveAccess) {
      req.club = club;
      req.clubAccess = {
        kind: 'archive',
        tier: 'expired',
        canPost: false,
        isMuted: false,
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
