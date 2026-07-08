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
 * Middleware определения уровня доступа к КОНКРЕТНОМУ клубу.
 *
 * МОДЕЛЬ ДОСТУПА (согласована 15.06, уточнена 08.07.2026):
 * Подписка даёт доступ ТОЛЬКО к клубу текущего месяца + 31 день архивного
 * хвоста этого клуба. Старые клубы (вне 31-дневного окна) закрыты ДАЖЕ
 * активному подписчику — платишь за свой месяц, читаешь свой месяц (+хвост).
 *
 * Правила по запрошенному клубу:
 * 1. Бан → 403 CLUB_BLOCKED
 * 2. Админ → полный доступ к любому клубу (kind='admin')
 * 3. Клуб ТЕКУЩИЙ (startsAt <= now <= endsAt):
 *      - активная подписка → kind='active', canPost=true (если не мьют)
 *      - нет подписки → 403 SUBSCRIPTION_REQUIRED (клиент покажет paywall)
 * 4. Клуб АРХИВНЫЙ, но в окне (endsAt < now <= archiveUntilDate):
 *      - активная подписка ИЛИ истёкшая → kind='archive', read-only (canPost=false)
 *        (дочитать свой недавний клуб; писать нельзя — месяц закончился)
 *      - нет вообще ничего (free, никогда не платил) → 403 SUBSCRIPTION_REQUIRED
 * 5. Клуб БУДУЩИЙ (startsAt > now):
 *      - активная подписка/админ → kind='future', read-only (анонс, canPost=false)
 *      - иначе → 403 SUBSCRIPTION_REQUIRED
 * 6. Клуб СТАРЫЙ (now > archiveUntilDate — прошло больше 31 дня после конца):
 *      - доступа нет НИ У КОГО кроме админа → 403 SUBSCRIPTION_REQUIRED
 *      - (данные в БД остаются — просто закрыт доступ; см. AI-CONTEXT)
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

    // Админ — полный доступ к любому клубу (текущий/архив/будущий/старый).
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

    // Классифицируем запрошенный клуб по времени.
    const isCurrent = club.startsAt <= now && club.endsAt >= now;
    const isFuture = club.startsAt > now;
    const isInArchiveWindow =
      club.endsAt < now && club.archiveUntilDate && club.archiveUntilDate >= now;
    // isTooOld: club.endsAt < now && archiveUntilDate < now — старше 31 дня.

    // — Текущий клуб —
    if (isCurrent) {
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
      // Нет подписки на текущий клуб → paywall.
      return next(
        new AppError(
          'SUBSCRIPTION_REQUIRED',
          'Для доступа к клубу нужна подписка',
          403
        )
      );
    }

    // — Будущий клуб (анонс) — только подписчик, read-only —
    if (isFuture) {
      if (hasActiveSub) {
        req.club = club;
        req.clubAccess = {
          kind: 'future',
          tier: user.subscriptionStatus,
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
    }

    // — Архивный клуб в 31-дневном окне — read-only —
    // Дочитать недавно закончившийся клуб. Доступ и активному, и только что
    // истёкшему (у кого этот клуб был оплачен). Писать нельзя — месяц закрыт.
    if (isInArchiveWindow) {
      // Отсекаем free-юзера, который вообще никогда не платил: доступ к архиву
      // даём только тем, у кого есть/была подписка (active или expired-статус).
      const everSubscribed =
        hasActiveSub ||
        user.subscriptionStatus === 'expired' ||
        user.subscriptionStatus === 'basic' ||
        user.subscriptionStatus === 'premium';

      if (everSubscribed) {
        req.club = club;
        req.clubAccess = {
          kind: 'archive',
          tier: 'expired',
          canPost: false,
          isMuted: false,
        };
        return next();
      }
    }

    // — Старый клуб (вне 31 дней) или free без подписки → нет доступа —
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
