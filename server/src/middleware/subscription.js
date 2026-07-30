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
 * Длительность оплаченного периода подписки в КЛУБНЫХ МЕСЯЦАХ по плану.
 * monthly=1, season=3, semiannual=6, annual=12. Неизвестный/пустой план →
 * трактуем как месячный (минимальный доступ — 1 клуб), чтобы никогда не
 * открыть лишнего.
 */
function planDurationMonths(plan) {
  switch (plan) {
    case 'season':
      return 3;
    case 'semiannual':
      return 6;
    case 'annual':
      return 12;
    case 'monthly':
    default:
      return 1;
  }
}

/**
 * Набор клубных месяцев, которые ОПЛАЧЕНЫ текущим периодом подписки.
 *
 * Период = [expiresAt − длительность_плана; expiresAt]. Первый оплаченный
 * клуб = месяц НАЧАЛА этого периода, далее подряд `duration` месяцев.
 * Пример (monthly, истекает 5 сентября) → период [5 авг; 5 сен], оплачен
 * ТОЛЬКО август. Сентябрьский клуб (даже если стартовал 1 сен и подписка ещё
 * активна до 5 сен) в набор НЕ входит — откроется только после продления,
 * когда expiresAt сдвинется на октябрь и якорь станет сентябрём.
 * Пример (season, истекает 10 декабря) → период [10 сен; 10 дек], оплачены
 * сентябрь+октябрь+ноябрь.
 *
 * Возвращает Set строк-ключей вида `${year}-${month}` (month 1..12), чтобы
 * сравнивать с ClubMonth (у него поля month 1..12 и year).
 */
function coveredClubMonthKeys(expiresAt, plan) {
  const set = new Set();
  if (!expiresAt) return set;
  const exp = new Date(expiresAt);
  const duration = planDurationMonths(plan);
  // Абсолютный индекс месяца конца оплаченного периода (год*12 + мес.0-11).
  const expAbs = exp.getFullYear() * 12 + exp.getMonth();
  // Начало периода = конец − duration месяцев = первый оплаченный клуб.
  const startAbs = expAbs - duration;
  for (let i = 0; i < duration; i += 1) {
    const abs = startAbs + i;
    const year = Math.floor(abs / 12);
    const month = (abs % 12) + 1; // 0-11 → 1-12
    set.add(`${year}-${month}`);
  }
  return set;
}

/**
 * Ключ клубного месяца для сравнения с coveredClubMonthKeys.
 * ClubMonth хранит month (1..12) и year.
 */
function clubMonthKey(club) {
  return `${club.year}-${club.month}`;
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
        'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt role isBanned mutedUntil'
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
      plan: user.subscriptionPlan || null,
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
 * МОДЕЛЬ ДОСТУПА (пересмотрена 30.07.2026 — ПРИВЯЗКА К ОПЛАЧЕННОМУ МЕСЯЦУ):
 * Подписка открывает клуб НЕ «какой сейчас по календарю», а РОВНО те клубные
 * месяцы, что входят в оплаченный период (см. coveredClubMonthKeys). Месячная
 * подписка = 1 клуб (месяц покупки), сезон = 3, полугодие = 6, год = 12.
 *
 * Почему так (баг, который чиним): раньше любой активный подписчик получал
 * ТЕКУЩИЙ по календарю клуб. Из-за расхождения «клуб с 1 числа» vs «оплата
 * Apple с 5 числа» августовский плательщик 1–5 сентября хватал сентябрьский
 * клуб бесплатно. Теперь клуб доступен, только если его (месяц,год) в
 * оплаченном наборе.
 *
 * Архив (обсуждение прошлого клуба) сохраняется отдельным правилом: любой,
 * кто когда-либо был подписчиком, дообсуждает прошлый клуб весь следующий
 * календарный месяц (canPost=true). Это не зависит от оплаченного набора —
 * человек этот клуб когда-то оплатил.
 *
 * 12.07.2026: в clubAccess есть поле plan ('monthly'|'season'|...|null) —
 * клиент скрывает плашку «оформите сезон» у тех, кто уже на сезоне.
 *
 * Правила по запрошенному клубу:
 * 1. Бан → 403 CLUB_BLOCKED
 * 2. Админ → полный доступ к любому клубу (kind='admin')
 * 3. Клуб ТЕКУЩИЙ (startsAt <= now <= endsAt):
 *      - активная подписка И клуб в оплаченном наборе → kind='active', canPost
 *      - иначе → 403 SUBSCRIPTION_REQUIRED (paywall)
 * 4. Клуб БУДУЩИЙ (startsAt > now):
 *      - активная подписка И клуб в оплаченном наборе (напр. сезон оплатил
 *        вперёд) → kind='future', read-only (анонс, canPost=false)
 *      - иначе → 403 SUBSCRIPTION_REQUIRED
 * 5. Клуб АРХИВНЫЙ в календарном окне (endsAt < now <= конец след. месяца):
 *      - был/есть подписчиком (everSubscribed) → kind='archive', canPost
 *      - free (никогда не платил) → 403 SUBSCRIPTION_REQUIRED
 * 6. Клуб СТАРЫЙ (now > конец архивного окна):
 *      - доступа нет никому кроме админа → 403 SUBSCRIPTION_REQUIRED
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
        'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt role isBanned mutedUntil'
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

    const plan = user.subscriptionPlan || null;

    // Оплаченный набор клубных месяцев для текущего периода подписки.
    const coveredKeys = coveredClubMonthKeys(
      user.subscriptionExpiresAt,
      plan
    );
    const isPaidClub = coveredKeys.has(clubMonthKey(club));

    // Классифицируем запрошенный клуб по времени (КАЛЕНДАРНО).
    const isCurrent = club.startsAt <= now && club.endsAt >= now;
    const isFuture = club.startsAt > now;
    // Архивное окно = до конца СЛЕДУЮЩЕГО календарного месяца после endsAt.
    const archiveEnd = archiveWindowEnd(club.endsAt);
    const isInArchiveWindow = club.endsAt < now && now <= archiveEnd;
    // isTooOld: club.endsAt < now && now > archiveEnd — старше архивного окна.

    // — Текущий клуб — доступ только если он в оплаченном наборе —
    if (isCurrent) {
      if (hasActiveSub && isPaidClub) {
        req.club = club;
        req.clubAccess = {
          kind: 'active',
          tier: user.subscriptionStatus,
          plan,
          canPost: !isMuted,
          isMuted,
          mutedUntil: isMuted ? user.mutedUntil : null,
        };
        return next();
      }
      // Нет подписки/не оплачен этот клуб → paywall.
      return next(
        new AppError(
          'SUBSCRIPTION_REQUIRED',
          'Для доступа к клубу нужна подписка',
          403
        )
      );
    }

    // — Будущий клуб (анонс) — только если оплачен вперёд (сезон), read-only —
    if (isFuture) {
      if (hasActiveSub && isPaidClub) {
        req.club = club;
        req.clubAccess = {
          kind: 'future',
          tier: user.subscriptionStatus,
          plan,
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
    // Доступ любому, кто когда-либо был подписчиком (он этот клуб оплачивал).
    // Free, кто никогда не платил, — не пускаем.
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
          plan,
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
  planDurationMonths,
  coveredClubMonthKeys,
  clubMonthKey,
};
