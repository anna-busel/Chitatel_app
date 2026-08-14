const { Router } = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const Progress = require('../models/Progress');
const Book = require('../models/Book');

const router = Router();

// Только админ.
router.use(requireAuth, requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // Москва фикс. +3, без перехода на лето

/**
 * Ключ календарного дня по Москве (YYYY-MM-DD). Совпадает с тем, что даёт
 * $dateToString с timezone 'Europe/Moscow' в агрегациях.
 */
function mskDayKey(date) {
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Массив ключей последних n дней (по МСК), от старого к новому. Нужен чтобы
 * заполнить нулями дни без данных — график без «дыр».
 */
function lastNDayKeys(n) {
  const keys = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i -= 1) {
    keys.push(mskDayKey(new Date(now - i * DAY_MS)));
  }
  return keys;
}

/**
 * Превратить [{_id:'YYYY-MM-DD', amount, count}] в ровный ряд по dayKeys.
 */
function fillSeries(dayKeys, rows) {
  const byDay = new Map(
    rows.map((r) => [r._id, { amount: r.amount || 0, count: r.count || 0 }])
  );
  return dayKeys.map((day) => {
    const v = byDay.get(day) || { amount: 0, count: 0 };
    return { day, amount: Math.round(v.amount || 0), count: v.count || 0 };
  });
}

/* ------------------------------------------------------------------ *
 *                   GET /api/admin/analytics                        *
 * ------------------------------------------------------------------ *
 * Сводка для дашборда: выручка и покупки за 30 дней (с разбивкой по дням и
 * типам), подписчики, участницы, активность клуба, топ разборов. Все суммы —
 * в USD (Purchase.priceUsd); реальные списания идут через Apple, здесь —
 * агрегат по нашим записям о покупках. */
router.get('/', async (_req, res, next) => {
  try {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS);
    const since7 = new Date(now - 7 * DAY_MS);
    const nowDate = new Date(now);

    const days30 = lastNDayKeys(30);
    const days7 = lastNDayKeys(7);

    const [
      purchaseDaily,
      byType,
      msgDaily,
      topBooksRaw,
      totalUsers,
      newUsersWeek,
      activeSubs,
      expiredSubs,
      newSubsWeek,
      messagesWeek,
      listenerIds,
    ] = await Promise.all([
      // Покупки по дням (30д): сумма и количество.
      Purchase.aggregate([
        { $match: { purchasedAt: { $gte: since30 } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$purchasedAt',
                timezone: 'Europe/Moscow',
              },
            },
            amount: { $sum: '$priceUsd' },
            count: { $sum: 1 },
          },
        },
      ]),
      // Выручка/покупки по типам (30д).
      Purchase.aggregate([
        { $match: { purchasedAt: { $gte: since30 } } },
        {
          $group: {
            _id: '$itemType',
            amount: { $sum: '$priceUsd' },
            count: { $sum: 1 },
          },
        },
      ]),
      // Сообщения клуба по дням (7д).
      ChatMessage.aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: since7 } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'Europe/Moscow',
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      // Топ-5 разборов по числу покупок (всё время).
      Purchase.aggregate([
        { $match: { itemType: 'book', itemId: { $ne: null } } },
        {
          $group: {
            _id: '$itemId',
            count: { $sum: 1 },
            revenue: { $sum: '$priceUsd' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({ isDeleted: false, createdAt: { $gte: since7 } }),
      User.countDocuments({
        isDeleted: false,
        subscriptionStatus: { $in: ['basic', 'premium'] },
        subscriptionExpiresAt: { $gt: nowDate },
      }),
      User.countDocuments({
        isDeleted: false,
        $or: [
          { subscriptionStatus: 'expired' },
          {
            subscriptionStatus: { $in: ['basic', 'premium'] },
            subscriptionExpiresAt: { $lte: nowDate },
          },
        ],
      }),
      Purchase.countDocuments({
        itemType: 'subscription',
        purchasedAt: { $gte: since7 },
      }),
      ChatMessage.countDocuments({
        deletedAt: null,
        createdAt: { $gte: since7 },
      }),
      Progress.distinct('userId', { lastListenedAt: { $gte: since7 } }),
    ]);

    // Ряды по дням (заполненные нулями).
    const series30 = fillSeries(days30, purchaseDaily);
    const revenue30 = series30.reduce((s, d) => s + d.amount, 0);
    const purchases30 = series30.reduce((s, d) => s + d.count, 0);
    const messageSeries = fillSeries(days7, msgDaily).map((d) => ({
      day: d.day,
      count: d.count,
    }));

    // Выручка по типам.
    const revenueByType = { book: 0, package: 0, subscription: 0, archive: 0 };
    const countByType = { book: 0, package: 0, subscription: 0, archive: 0 };
    byType.forEach((t) => {
      if (t._id && Object.prototype.hasOwnProperty.call(revenueByType, t._id)) {
        revenueByType[t._id] = Math.round(t.amount || 0);
        countByType[t._id] = t.count || 0;
      }
    });

    // Топ разборов: подтягиваем названия по itemId (строка = Book._id).
    const validIds = topBooksRaw
      .map((b) => b._id)
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id));
    const booksById = new Map();
    if (validIds.length) {
      const found = await Book.find({ _id: { $in: validIds } })
        .select('title')
        .lean();
      found.forEach((b) => booksById.set(String(b._id), b.title));
    }
    const topBooks = topBooksRaw.map((b) => ({
      id: String(b._id),
      title: booksById.get(String(b._id)) || 'Разбор',
      count: b.count,
      revenue: Math.round(b.revenue || 0),
    }));

    return success(res, {
      revenue30,
      purchases30,
      series30, // [{day, amount, count}] за 30 дней
      revenueByType,
      countByType,
      subscribers: {
        active: activeSubs,
        expired: expiredSubs,
        newWeek: newSubsWeek,
      },
      users: { total: totalUsers, newWeek: newUsersWeek },
      messagesWeek,
      messageSeries, // [{day, count}] за 7 дней
      activeListenersWeek: listenerIds.length,
      topBooks,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
