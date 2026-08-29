const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const Purchase = require('../models/Purchase');

const router = Router();

// Только админ.
router.use(requireAuth, requireAdmin);

const TYPE_LABEL = {
  book: 'Разбор',
  package: 'Пакет',
  subscription: 'Подписка',
  archive: 'Архив',
};

/* ------------------------------------------------------------------ *
 *                   GET /api/admin/payments                         *
 * ------------------------------------------------------------------ *
 * Построчный список ВСЕХ оплат: и реальные списания Apple (platform:'apple'),
 * и доступ, выданный вручную из админки (platform:'web'/др.). В отличие от
 * дашборда (сводка), здесь конкретно кто/что/сколько/когда/каким способом.
 * Фильтр ?platform=apple|manual|all, пагинация ?page=&limit=.
 * revenueApple — сумма реальной выручки Apple по текущему фильтру. */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.platform === 'apple') {
      filter.platform = 'apple';
    } else if (req.query.platform === 'manual') {
      filter.platform = { $ne: 'apple' };
    }

    const [rows, total, appleAgg] = await Promise.all([
      Purchase.find(filter)
        .sort({ purchasedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email')
        .lean(),
      Purchase.countDocuments(filter),
      // Реальная выручка (Apple) по текущему фильтру — для шапки списка.
      Purchase.aggregate([
        {
          $match: {
            ...filter,
            platform: 'apple',
            environment: { $ne: 'sandbox' },
          },
        },
        { $group: { _id: null, sum: { $sum: '$priceUsd' } } },
      ]),
    ]);

    const items = rows.map((p) => ({
      id: String(p._id),
      // id пользователя — для перехода из строки оплаты в карточку «Люди».
      userId: p.userId ? String(p.userId._id) : null,
      userName: p.userId ? p.userId.name || '' : '',
      userEmail: p.userId ? p.userId.email || '' : '',
      // sandbox = тестовая покупка (TestFlight/ревью), в выручке не считается.
      environment: p.environment || 'production',
      itemType: p.itemType,
      itemLabel: TYPE_LABEL[p.itemType] || p.itemType,
      itemId: p.itemId || '',
      platform: p.platform,
      isApple: p.platform === 'apple',
      priceUsd: p.priceUsd || 0,
      purchasedAt: p.purchasedAt,
      expiresAt: p.expiresAt || null,
      status: p.status,
    }));

    return success(res, {
      items,
      total,
      page,
      limit,
      revenueApple: Math.round((appleAgg[0] && appleAgg[0].sum) || 0),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
