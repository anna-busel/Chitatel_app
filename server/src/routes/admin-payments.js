const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const Purchase = require('../models/Purchase');
const User = require('../models/User');

const router = Router();

// Только админ.
router.use(requireAuth, requireAdmin);

const TYPE_LABEL = {
  book: 'Разбор',
  package: 'Пакет',
  subscription: 'Подписка',
  archive: 'Архив',
};

const PLATFORM_LABEL = {
  apple: 'Apple',
  google: 'Google',
  web: 'вручную',
};

/* ------------------------------------------------------------------ *
 *                   GET /api/admin/payments                         *
 * ------------------------------------------------------------------ *
 * Построчный список ВСЕХ оплат: реальные списания Apple и Google и доступ,
 * выданный вручную из админки. В отличие от дашборда (сводка), здесь
 * конкретно кто/что/сколько/когда/каким способом.
 *
 * 02.10.2026 — переработано под Android:
 *   1. Фильтр платформы стал на четыре положения. Раньше «вручную» означало
 *      `platform != 'apple'`, то есть покупки Google попадали в корзину
 *      ручных выдач и показывались без суммы — настоящие деньги выглядели
 *      как бесплатный доступ. Это надо было закрыть ДО первых оплат на
 *      Android.
 *   2. Выручка считается отдельно по Apple и Google плюс итог. Песочница
 *      (environment: 'sandbox') в выручку не входит никогда: у Google так
 *      помечаются покупки лицензионных тестировщиц, у Apple — TestFlight и
 *      проверка ревьюером.
 *   3. Пользователь больше не теряется. Раньше использовался populate, и
 *      если аккаунт был удалён физически, строка оставалась совсем без
 *      опознавательных знаков. Теперь идентификатор участницы сохраняется
 *      всегда, а имя и почта подтягиваются отдельным запросом.
 *
 * Параметры: ?platform=all|apple|google|manual, ?type=all|book|package|
 * subscription|archive, ?sandbox=show|hide, ?page=&limit=.
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;

    const filter = {};

    const platform = req.query.platform || 'all';
    if (platform === 'apple') {
      filter.platform = 'apple';
    } else if (platform === 'google') {
      filter.platform = 'google';
    } else if (platform === 'manual') {
      // Всё, что не магазин: web и записи без платформы (старые ручные выдачи).
      filter.platform = { $nin: ['apple', 'google'] };
    }

    const type = req.query.type || 'all';
    if (TYPE_LABEL[type]) {
      filter.itemType = type;
    }

    // По умолчанию песочницу прячем: после запуска продаж тестовые покупки
    // лицензионных тестировщиц забьют список и будут путать.
    if (req.query.sandbox !== 'show') {
      filter.environment = { $ne: 'sandbox' };
    }

    // Выручка считается по ТЕМ ЖЕ фильтрам, но всегда без песочницы и только
    // по магазинам — ручная выдача денег не приносит.
    const revenueMatch = { ...filter, environment: { $ne: 'sandbox' } };

    const [rows, total, revenueRows, manualCount] = await Promise.all([
      Purchase.find(filter)
        .sort({ purchasedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Purchase.countDocuments(filter),
      Purchase.aggregate([
        { $match: { ...revenueMatch, platform: { $in: ['apple', 'google'] } } },
        { $group: { _id: '$platform', sum: { $sum: '$priceUsd' } } },
      ]),
      Purchase.countDocuments({
        ...filter,
        platform: { $nin: ['apple', 'google'] },
      }),
    ]);

    // Имена и почты — одним запросом по всем участницам текущей страницы.
    const userIds = [...new Set(rows.map((p) => String(p.userId)).filter(Boolean))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } })
          .select('name email')
          .lean()
      : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const items = rows.map((p) => {
      const uid = p.userId ? String(p.userId) : null;
      const user = uid ? byId.get(uid) : null;
      const platformKey = p.platform || 'web';
      const isStore = platformKey === 'apple' || platformKey === 'google';
      return {
        id: String(p._id),
        // id участницы — для перехода из строки оплаты в карточку «Люди».
        // Сохраняется даже если самого аккаунта уже нет в базе.
        userId: uid,
        userName: user ? user.name || '' : '',
        userEmail: user ? user.email || '' : '',
        // true → аккаунт удалён физически, опознать можно только по id.
        userMissing: Boolean(uid) && !user,
        // sandbox = тестовая покупка (TestFlight, ревью, лицензионные
        // тестировщицы Google), в выручке не считается.
        environment: p.environment || 'production',
        itemType: p.itemType,
        itemLabel: TYPE_LABEL[p.itemType] || p.itemType,
        itemId: p.itemId || '',
        platform: platformKey,
        platformLabel: PLATFORM_LABEL[platformKey] || platformKey,
        isStore,
        priceUsd: p.priceUsd || 0,
        purchasedAt: p.purchasedAt,
        expiresAt: p.expiresAt || null,
        status: p.status,
      };
    });

    const revenue = { apple: 0, google: 0, total: 0 };
    revenueRows.forEach((r) => {
      const sum = Math.round(r.sum || 0);
      if (r._id === 'apple') revenue.apple = sum;
      if (r._id === 'google') revenue.google = sum;
      revenue.total += sum;
    });

    return success(res, {
      items,
      total,
      page,
      limit,
      revenue,
      manualCount,
      // Совместимость со старым интерфейсом, пока он не обновлён везде.
      revenueApple: revenue.apple,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
