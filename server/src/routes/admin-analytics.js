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
const ALLOWED_DAYS = [7, 30, 90, 365];

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
 * Массив ключей последних n месяцев (YYYY-MM, по МСК), от старого к новому.
 * Для длинных диапазонов (год) график по дням нечитаем — бьём по месяцам.
 */
function lastNMonthKeys(n) {
  const keys = [];
  const nowMsk = new Date(Date.now() + MSK_OFFSET_MS);
  let y = nowMsk.getUTCFullYear();
  let m = nowMsk.getUTCMonth(); // 0-11
  for (let i = 0; i < n; i += 1) {
    keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
  }
  return keys.reverse();
}

/**
 * Ровный ряд по bucketKeys с разбивкой Apple / вручную.
 * rows: [{_id, apple, manual, count}].
 */
function fillSplitSeries(bucketKeys, rows) {
  const byKey = new Map(
    rows.map((r) => [
      r._id,
      {
        apple: Math.round(r.apple || 0),
        manual: Math.round(r.manual || 0),
        count: r.count || 0,
      },
    ])
  );
  return bucketKeys.map((key) => {
    const v = byKey.get(key) || { apple: 0, manual: 0, count: 0 };
    return { key, apple: v.apple, manual: v.manual, count: v.count };
  });
}

/**
 * Ровный ряд по dayKeys (только count) — для сообщений клуба.
 */
function fillCountSeries(dayKeys, rows) {
  const byDay = new Map(rows.map((r) => [r._id, r.count || 0]));
  return dayKeys.map((day) => ({ day, count: byDay.get(day) || 0 }));
}

// $cond: Apple-платёж (реальное списание) — platform === 'apple'.
const IS_APPLE = { $eq: ['$platform', 'apple'] };

// Сумма по условию Apple / не-Apple.
function condSum(isApple, field) {
  return {
    $sum: { $cond: [isApple ? IS_APPLE : { $not: IS_APPLE }, field, 0] },
  };
}

/* ------------------------------------------------------------------ *
 *                   GET /api/admin/analytics?days=30                 *
 * ------------------------------------------------------------------ *
 * Сводка для дашборда. Ключевой принцип: РЕАЛЬНАЯ выручка (списания через
 * Apple, platform:'apple') и ручные выдачи из админки (platform:'web' —
 * доступ, выданный без оплаты) считаются и показываются ОТДЕЛЬНО, чтобы
 * ручные выдачи не раздували выручку. Диапазон выбирается (?days=7|30|90|365);
 * ряд по дням для коротких диапазонов и по месяцам для года. Дополнительно —
 * выручка по типам (разборы / пакеты / подписки / архив) и быстрые итоги за
 * 7/30/90/365 дней и за всё время. Все суммы — USD (Purchase.priceUsd). */
router.get('/', async (req, res, next) => {
  try {
    const now = Date.now();
    const days = ALLOWED_DAYS.includes(Number(req.query.days))
      ? Number(req.query.days)
      : 30;
    const granularity = days >= 365 ? 'month' : 'day';
    const bucketKeys =
      granularity === 'month' ? lastNMonthKeys(12) : lastNDayKeys(days);
    const bucketFormat = granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';

    const sinceRange = new Date(now - days * DAY_MS);
    const since7 = new Date(now - 7 * DAY_MS);
    const since30 = new Date(now - 30 * DAY_MS);
    const since90 = new Date(now - 90 * DAY_MS);
    const since365 = new Date(now - 365 * DAY_MS);
    const nowDate = new Date(now);

    const days7 = lastNDayKeys(7);

    const bucketExpr = {
      $dateToString: {
        format: bucketFormat,
        date: '$purchasedAt',
        timezone: 'Europe/Moscow',
      },
    };

    const [
      seriesRaw,
      rangeTotals,
      byTypeRaw,
      windowTotals,
      topBooksRaw,
      msgDaily,
      totalUsers,
      newUsersWeek,
      activeSubs,
      expiredSubs,
      newSubsAppleWeek,
      newSubsManualWeek,
      messagesWeek,
      listenerIds,
    ] = await Promise.all([
      // Ряд по дням/месяцам за выбранный диапазон (Apple / вручную).
      Purchase.aggregate([
        { $match: { purchasedAt: { $gte: sinceRange }, environment: { $ne: 'sandbox' } } },
        {
          $group: {
            _id: bucketExpr,
            apple: condSum(true, '$priceUsd'),
            manual: condSum(false, '$priceUsd'),
            count: { $sum: 1 },
          },
        },
      ]),
      // Итоги за выбранный диапазон (Apple / вручную).
      Purchase.aggregate([
        { $match: { purchasedAt: { $gte: sinceRange }, environment: { $ne: 'sandbox' } } },
        {
          $group: {
            _id: null,
            revApple: condSum(true, '$priceUsd'),
            revManual: condSum(false, '$priceUsd'),
            cntApple: condSum(true, 1),
            cntManual: condSum(false, 1),
          },
        },
      ]),
      // По типам за выбранный диапазон (Apple / вручную, суммы и количества).
      Purchase.aggregate([
        { $match: { purchasedAt: { $gte: sinceRange }, environment: { $ne: 'sandbox' } } },
        {
          $group: {
            _id: '$itemType',
            revApple: condSum(true, '$priceUsd'),
            revManual: condSum(false, '$priceUsd'),
            cntApple: condSum(true, 1),
            cntManual: condSum(false, 1),
          },
        },
      ]),
      // Быстрые итоги выручки (только Apple) за 7/30/90/365 дней и за всё время.
      Purchase.aggregate([
        { $match: { platform: 'apple', environment: { $ne: 'sandbox' } } },
        {
          $group: {
            _id: null,
            d7: {
              $sum: {
                $cond: [{ $gte: ['$purchasedAt', since7] }, '$priceUsd', 0],
              },
            },
            d30: {
              $sum: {
                $cond: [{ $gte: ['$purchasedAt', since30] }, '$priceUsd', 0],
              },
            },
            d90: {
              $sum: {
                $cond: [{ $gte: ['$purchasedAt', since90] }, '$priceUsd', 0],
              },
            },
            d365: {
              $sum: {
                $cond: [{ $gte: ['$purchasedAt', since365] }, '$priceUsd', 0],
              },
            },
            all: { $sum: '$priceUsd' },
          },
        },
      ]),
      // Топ-5 разборов по РЕАЛЬНЫМ продажам (только Apple). Ручные выдачи из
      // админки — это не покупки, поэтому в топ не попадают. Группируем по
      // itemId: это bookSlug (см. purchase.service и grant-book), одинаковый
      // для всех покупок одного разбора, — поэтому дублей одной книги не будет.
      Purchase.aggregate([
        { $match: { itemType: 'book', platform: 'apple', itemId: { $ne: null }, environment: { $ne: 'sandbox' } } },
        {
          $group: {
            _id: '$itemId',
            cntApple: { $sum: 1 },
            revApple: { $sum: '$priceUsd' },
          },
        },
        { $sort: { cntApple: -1 } },
        { $limit: 5 },
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
        platform: 'apple',
        environment: { $ne: 'sandbox' },
        purchasedAt: { $gte: since7 },
      }),
      Purchase.countDocuments({
        itemType: 'subscription',
        platform: { $ne: 'apple' },
        purchasedAt: { $gte: since7 },
      }),
      ChatMessage.countDocuments({
        deletedAt: null,
        createdAt: { $gte: since7 },
      }),
      Progress.distinct('userId', { lastListenedAt: { $gte: since7 } }),
    ]);

    // Ряд по дням/месяцам (заполнен нулями).
    const series = fillSplitSeries(bucketKeys, seriesRaw);
    const rt = rangeTotals[0] || {};
    const revenue = {
      apple: Math.round(rt.revApple || 0),
      manual: Math.round(rt.revManual || 0),
    };
    const purchases = {
      apple: rt.cntApple || 0,
      manual: rt.cntManual || 0,
    };

    // По типам.
    const TYPES = ['book', 'package', 'subscription', 'archive'];
    const byType = {};
    TYPES.forEach((t) => {
      byType[t] = {
        revApple: 0,
        revManual: 0,
        cntApple: 0,
        cntManual: 0,
      };
    });
    byTypeRaw.forEach((t) => {
      if (t._id && byType[t._id]) {
        byType[t._id] = {
          revApple: Math.round(t.revApple || 0),
          revManual: Math.round(t.revManual || 0),
          cntApple: t.cntApple || 0,
          cntManual: t.cntManual || 0,
        };
      }
    });

    // Быстрые итоги (Apple).
    const wt = windowTotals[0] || {};
    const windows = {
      d7: Math.round(wt.d7 || 0),
      d30: Math.round(wt.d30 || 0),
      d90: Math.round(wt.d90 || 0),
      d365: Math.round(wt.d365 || 0),
      all: Math.round(wt.all || 0),
    };

    // Топ разборов: itemId — это bookSlug (см. purchase.service и grant-book),
    // поэтому названия тянем ПО slug, а не по _id (это была причина, почему в
    // топе показывалось «Разбор» и появлялись дубли). Не нашли книгу — покажем
    // сам slug.
    const topSlugs = topBooksRaw.map((b) => b._id).filter(Boolean);
    const titleBySlug = new Map();
    if (topSlugs.length) {
      const found = await Book.find({ bookSlug: { $in: topSlugs } })
        .select('title bookSlug')
        .lean();
      found.forEach((b) => titleBySlug.set(b.bookSlug, b.title));
    }
    const topBooks = topBooksRaw.map((b) => ({
      id: String(b._id),
      title: titleBySlug.get(b._id) || b._id,
      cntApple: b.cntApple || 0,
      cntManual: 0,
      revApple: Math.round(b.revApple || 0),
    }));

    const messageSeries = fillCountSeries(days7, msgDaily);

    return success(res, {
      range: days,
      granularity, // 'day' | 'month'
      series, // [{key, apple, manual, count}]
      revenue, // {apple, manual} за диапазон
      purchases, // {apple, manual} за диапазон
      byType, // {book|package|subscription|archive: {revApple,revManual,cntApple,cntManual}}
      windows, // {d7,d30,d90,d365,all} — выручка Apple
      subscribers: {
        active: activeSubs,
        expired: expiredSubs,
        newAppleWeek: newSubsAppleWeek,
        newManualWeek: newSubsManualWeek,
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
