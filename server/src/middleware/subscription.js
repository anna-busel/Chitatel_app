const mongoose = require('mongoose');
const { AppError } = require('./error');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');

/**
 * Конец АРХИВНОГО ОКНА клуба = последняя миллисекунда СЛЕДУЮЩЕГО
 * календарного месяца после месяца, в котором клуб закончился (endsAt).
 *
 * МОДЕЛЬ ДОСТУПА (согласована 08.07.2026, календарная): клуб доступен на
 * ЧТЕНИЕ И ЗАПИСЬ весь свой месяц + весь следующий календарный месяц (архив).
 * Пример: июльский клуб → активен в июле, архив весь август (до 31 авг 23:59).
 * Привязка к КАЛЕНДАРЮ (а не «+31 день») убирает расхождение с датами Apple:
 * дата платежа больше не влияет на то, какой клуб виден — только календарь.
 *
 * Возвращает Date = последний момент следующего месяца.
 * Для endsAt в июле (мес. 6, 0-индекс) → 31 августа 23:59:59.999.
 * new Date(year, monthIndex+2, 0, 23,59,59,999): день 0 следующего+1 месяца =
 * последний день следующего месяца.
 */
function archiveWindowEnd(endsAt) {
  const d = new Date(endsAt);
  // monthIndex+2, день 0 → последний день (monthIndex+1)-го месяца = след. месяц.
  return new Date(d.getFullYear(), d.getMonth() + 2, 0, 23, 59, 59, 999);
}

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
 * МОДЕЛЬ ДОСТУПА (согласована 15.06, финализирована 08.07.2026 — КАЛЕНДАРНАЯ):
 * Клуб доступен ПОЛНОЦЕННО (чтение + запись) весь свой календарный месяц +
 * весь следующий календарный месяц (архив). Народ дообсуждает прошлую книгу
 * ещё месяц. Привязка к календарю, а не к датам Apple — устраняет расхождение
 * «дата платежа vs календарь клуба».
 *
 * Пример: июльский клуб → пишешь весь июль (текущий) И весь август (архив
 * июля). С 1 августа параллельно открывается августовский клуб. Июльский
 * закрывается 1 сентября.
 *
 * ⚠️ ВАЖНО (08.07): в архиве МОЖНО ПИСАТЬ (canPost=true) — по требованию Анны
 * обсуждение прошлого клуба продолжается весь следующий месяц. Раньше архив
 * был read-only — исправлено.
 *
 * Правила по запрошенному клубу:
 * 1. Бан → 403 CLUB_BLOCKED
 * 2. Админ → полный доступ к любому клубу (kind='admin')
 * 3. Клуб ТЕКУЩИЙ (startsAt <= now <= endsAt):
 *      - активная подписка → kind='active', canPost=true (если не мьют)
 *      - нет подписки → 403 SUBSCRIPTION_REQUIRED (клиент покажет paywall)
 * 4. Клуб АРХИВНЫЙ в календарном окне (endsAt < now <= конец след. месяца):
 *      - есть/была подписка → kind='archive', canPost=true (если не мьют)
 *        (дописать/дообсудить прошлый клуб весь следующий месяц)
 *      - free (никогда не платил) → 403 SUBSCRIPTION_REQUIRED
 * 5. Клуб БУДУЩИЙ (startsAt > now):
 *      - активная подписка/админ → kind='future', read-only (анонс, canPost=false)
 *      - иначе → 403 SUBSCRIPTION_REQUIRED
 * 6. Клуб СТАРЫЙ (now > конец след. месяца — прошло больше архивного окна):
 *      - доступа нет никому кроме админа → 403 SUBSCRIPTION_REQUIRED
 *      - (данные в БД остаются — просто закрыт доступ)
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

    // Классифицируем запрошенный клуб по времени (КАЛЕНДАРНО).
    const isCurrent = club.startsAt <= now && club.endsAt >= now;
    const isFuture = club.startsAt > now;
    // Архивное окно = до конца СЛЕДУЮЩЕГО календарного месяца после endsAt.
    const archiveEnd = archiveWindowEnd(club.endsAt);
    const isInArchiveWindow = club.endsAt < now && now <= archiveEnd;
    // isTooOld: club.endsAt < now && now > archiveEnd — старше архивного окна.

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

    // — Архивный клуб в календарном окне (следующий месяц) — МОЖНО ПИСАТЬ —
    // Дообсудить прошлый клуб весь следующий месяц (требование Анны 08.07).
    // Доступ и активному, и недавно истёкшему (у кого был этот клуб). Free,
    // кто никогда не платил, — не пускаем.
    if (isInArchiveWindow) {
      const everSubscribed =
        hasActiveSub ||
        user.subscriptionStatus === 'expired' ||
        user.subscriptionStatus === 'basic' ||
        user.subscriptionStatus === 'premium';

      if (everSubscribed) {
        req.club = club;
        req.clubAccess = {
          kind: 'archive',
          tier: user.subscriptionStatus,
          canPost: !isMuted,
          isMuted,
          mutedUntil: isMuted ? user.mutedUntil : null,
        };
        return next();
      }
    }

    // — Старый клуб (вне архивного окна) или free без подписки → нет доступа —
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

module.exports = {
  requireSubscription,
  requireAdmin,
  resolveClubAccess,
  archiveWindowEnd,
};
