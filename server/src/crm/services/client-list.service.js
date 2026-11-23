const mongoose = require('mongoose');
const User = require('../../models/User');
const CrmClient = require('../models/CrmClient');
const CrmOrder = require('../models/CrmOrder');
const { getCrmSettings } = require('./settings.service');
const {
  currentMonthKey,
  monthsAhead,
  escapeRe,
  toBynExpr,
  round2,
  paging,
  parseSort,
  monthIndex,
} = require('./view.helpers');

/**
 * Список клиенток (CRM-PLAN D1): GET /api/crm/clients и выгрузка.
 *
 * Доступ в приложении берётся из связанного User (appUserId):
 * clubMonthsEntitled, tier2MonthsEntitled, purchasedBooks/Packages и срок
 * подписки. «В клубе сейчас» — как computeClubAccess для текущего клуба:
 * текущий месяц (ключ L1) в оплаченном наборе + активная подписка (или grace).
 *
 * Сегменты (чипы) — те, что вычислимы по текущим данным:
 *   all       Вся база
 *   club      В клубе сейчас
 *   ending    Доступ до конца месяца — в клубе, но следующих месяцев нет и
 *             это не подписка стора (та продлится сама)
 *   noclub    Без доступа к клубу
 *   content   Разборы без клуба — есть разборы/пакеты, клуба сейчас нет
 *   unlinked  Не связаны с приложением
 *   noorders  Без оплат — ни одной оплаты, ни абонементов из Excel, ни доступа
 *   long      Длительные абонементы — оплачено ≥ 6 месяцев вперёд, считая текущий
 *             (в приложении или по абонементам из Excel)
 *   tier2     Тариф 2 — встречи в текущем месяце
 * Сохранённые сегменты (CrmSegment) — с рассылками (J2), здесь их нет.
 *
 * «Сумма покупок» и «Посл. оплата» считаются по подтверждённым платежам
 * заказов (кроме оплаты с баланса и ложных/возвратов): кэш ltvByn/lastPaidAt
 * у клиентки пока никто не ведёт. Валюты — по курсам CrmSettings.rates.
 */
const { ObjectId } = mongoose.Types;

const SEGMENTS = ['all', 'club', 'ending', 'noclub', 'content', 'unlinked', 'noorders', 'long', 'tier2'];
const SORTS = ['name', 'until', 'ltv', 'last', 'since'];
const LONG_MONTHS = 6;
const LONG_WINDOW = 36;

const and = (...parts) => {
  const list = parts.filter((p) => p && Object.keys(p).length);
  if (!list.length) {return {};}
  return list.length === 1 ? list[0] : { $and: list };
};

function activeSub(now) {
  return {
    subscriptionStatus: { $in: ['basic', 'premium'] },
    $or: [{ subscriptionExpiresAt: { $gt: now } }, { gracePeriodExpiresAt: { $gt: now } }],
  };
}

/** Условие на User «в клубе сейчас». */
function inClubUser(now) {
  return { isDeleted: { $ne: true }, clubMonthsEntitled: currentMonthKey(now), ...activeSub(now) };
}

const sizeIn = (field, keys) => ({
  $size: { $setIntersection: [{ $ifNull: [field, []] }, keys] },
});

/**
 * Фильтры сегментов. Списки id пользовательниц считаются лениво и один раз на
 * запрос (чипы с количеством спрашивают все сегменты сразу).
 */
function segmentResolver(now = new Date()) {
  const cur = currentMonthKey(now);
  const cache = {};
  const userIds = (key, cond) => {
    // Кэшируем промис с результатом, а не сам Query: повторный await Query
    // запускает его ещё раз, и Mongoose падает «Query was already executed».
    if (!cache[key]) {cache[key] = Promise.resolve(User.distinct('_id', cond));}
    return cache[key];
  };
  const inClubIds = () => userIds('club', inClubUser(now));

  return async function filterFor(seg) {
    switch (seg) {
      case 'club':
        return { appUserId: { $in: await inClubIds() } };
      case 'noclub':
        return { appUserId: { $nin: await inClubIds() } };
      case 'ending': {
        const ids = await userIds('ending', {
          ...inClubUser(now),
          clubMonthsEntitled: { $all: [cur], $nin: monthsAhead(cur, LONG_WINDOW, false) },
          subscriptionPlatform: { $nin: ['apple', 'google'] },
        });
        return { appUserId: { $in: ids } };
      }
      case 'content': {
        const ids = await userIds('content', {
          isDeleted: { $ne: true },
          $nor: [inClubUser(now)],
          $or: [{ 'purchasedBooks.0': { $exists: true } }, { 'purchasedPackages.0': { $exists: true } }],
        });
        return { appUserId: { $in: ids } };
      }
      case 'unlinked':
        return { appUserId: null };
      case 'noorders': {
        const [paidClients, withAccess] = await Promise.all([
          CrmOrder.distinct('clientId', {
            status: { $nin: ['fake', 'refund'] },
            payments: { $elemMatch: { pending: { $ne: true }, method: { $ne: 'balance' } } },
          }),
          userIds('any', {
            $or: [
              { 'clubMonthsEntitled.0': { $exists: true } },
              { 'purchasedBooks.0': { $exists: true } },
              { 'purchasedPackages.0': { $exists: true } },
            ],
          }),
        ]);
        return {
          _id: { $nin: paidClients },
          'legacyMonths.0': { $exists: false },
          appUserId: { $nin: withAccess },
        };
      }
      case 'long': {
        const keys = monthsAhead(cur, LONG_WINDOW, true);
        const ids = await userIds('long', {
          isDeleted: { $ne: true },
          $expr: { $gte: [sizeIn('$clubMonthsEntitled', keys), LONG_MONTHS] },
        });
        return {
          $or: [
            { appUserId: { $in: ids } },
            { $expr: { $gte: [sizeIn('$legacyMonths', keys), LONG_MONTHS] } },
          ],
        };
      }
      case 'tier2': {
        const ids = await userIds('tier2', { isDeleted: { $ne: true }, tier2MonthsEntitled: cur });
        return { appUserId: { $in: ids } };
      }
      default:
        return {};
    }
  };
}

/**
 * Поиск: имя, почты (ГК/сайт и почта приложения), телефон (цифры, от 3),
 * Telegram (@ник), теги.
 */
async function searchMatch(qRaw) {
  const q = String(qRaw || '').trim();
  if (!q) {return {};}
  const rx = new RegExp(escapeRe(q), 'i');
  const or = [{ name: rx }, { primaryEmail: rx }, { 'emails.email': rx }, { tags: rx }];

  const tg = q.replace(/^@/, '');
  if (tg) {or.push({ 'telegram.username': new RegExp(escapeRe(tg), 'i') });}

  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length >= q.replace(/[\s()+-]/g, '').length) {
    or.push({ phoneNorm: new RegExp(escapeRe(digits)) });
  }

  if (q.length >= 3) {
    const users = await User.find({ email: rx, isDeleted: { $ne: true } })
      .select('_id')
      .limit(500)
      .lean();
    if (users.length) {or.push({ appUserId: { $in: users.map((u) => u._id) } });}
  }
  return { $or: or };
}

/** Стадии: пользовательница приложения, оплаты, «Клуб по». */
function enrichStages(rates) {
  const keyToIdx = {
    $let: {
      vars: { p: { $split: ['$$k', '-'] } },
      in: {
        $add: [
          {
            $multiply: [
              { $convert: { input: { $arrayElemAt: ['$$p', 0] }, to: 'int', onError: null, onNull: null } },
              12,
            ],
          },
          {
            $subtract: [
              { $convert: { input: { $arrayElemAt: ['$$p', 1] }, to: 'int', onError: null, onNull: null } },
              1,
            ],
          },
        ],
      },
    },
  };
  return [
    {
      $lookup: {
        from: User.collection.name,
        let: { uid: '$appUserId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
          { $project: { email: 1, clubMonthsEntitled: 1, tier2MonthsEntitled: 1, isDeleted: 1 } },
        ],
        as: '_u',
      },
    },
    {
      $lookup: {
        from: CrmOrder.collection.name,
        let: { cid: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$clientId', '$$cid'] }, { $not: [{ $in: ['$status', ['fake', 'refund']] }] }],
              },
            },
          },
          { $unwind: '$payments' },
          { $match: { 'payments.pending': { $ne: true }, 'payments.method': { $ne: 'balance' } } },
          {
            $group: {
              _id: null,
              ltv: { $sum: toBynExpr('$payments.amount', '$payments.cur', rates) },
              last: { $max: '$payments.at' },
            },
          },
        ],
        as: '_pay',
      },
    },
    {
      $addFields: {
        _u: { $arrayElemAt: ['$_u', 0] },
        _ltv: { $ifNull: [{ $arrayElemAt: ['$_pay.ltv', 0] }, 0] },
        _last: { $arrayElemAt: ['$_pay.last', 0] },
      },
    },
    {
      $addFields: {
        _untilIdx: {
          $max: {
            $map: {
              input: {
                $concatArrays: [
                  { $ifNull: ['$_u.clubMonthsEntitled', []] },
                  { $ifNull: ['$legacyMonths', []] },
                ],
              },
              as: 'k',
              in: keyToIdx,
            },
          },
        },
      },
    },
    { $project: { _pay: 0 } },
  ];
}

const SORT_FIELD = { name: '_name', until: '_untilIdx', ltv: '_ltv', last: '_last', since: 'since' };

function sortStage(sort) {
  return { $sort: { [SORT_FIELD[sort.key]]: sort.dir, _id: sort.dir } };
}

/** Строка таблицы «Клиенты». */
function clientRow(doc, now = new Date()) {
  const u = doc._u && !doc._u.isDeleted ? doc._u : null;
  const curIdx = monthIndex(currentMonthKey(now));
  const untilIdx = typeof doc._untilIdx === 'number' ? doc._untilIdx : null;
  const until = untilIdx === null ? null : `${Math.floor(untilIdx / 12)}-${(untilIdx % 12) + 1}`;
  const email = doc.primaryEmail || (doc.emails && doc.emails[0] ? doc.emails[0].email : null);
  return {
    id: String(doc._id),
    name: doc.name || '',
    email,
    appEmail: u ? u.email || null : null,
    linked: Boolean(doc.appUserId),
    phone: doc.phone || null,
    telegram: doc.telegram && doc.telegram.username ? `@${doc.telegram.username.replace(/^@/, '')}` : null,
    city: doc.city || null,
    country: doc.country || null,
    until,
    untilActive: untilIdx !== null && untilIdx >= curIdx,
    ltv: round2(doc._ltv),
    lastPaidAt: doc._last || null,
    balance: round2(doc.balance),
    tags: doc.tags || [],
  };
}

async function baseMatch(query, resolve) {
  const seg = SEGMENTS.includes(query.seg) ? query.seg : 'all';
  const [qm, sm] = await Promise.all([searchMatch(query.q), resolve(seg)]);
  const ids = Array.isArray(query.ids) && query.ids.length
    ? { _id: { $in: query.ids.map((x) => new ObjectId(x)) } }
    : null;
  return { seg, qm, match: and({ mergedInto: null }, qm, sm, ids) };
}

function pipelineFor(match, sort, rates, { skip, limit } = {}) {
  const page = [];
  if (skip) {page.push({ $skip: skip });}
  if (limit) {page.push({ $limit: limit });}
  // Сортировка по имени/дате — до тяжёлых $lookup (только для страницы).
  if (sort.key === 'name' || sort.key === 'since') {
    return [
      { $match: match },
      { $addFields: { _name: { $toLower: '$name' } } },
      sortStage(sort),
      ...page,
      ...enrichStages(rates),
    ];
  }
  return [{ $match: match }, ...enrichStages(rates), sortStage(sort), ...page];
}

async function listClients(query = {}, now = new Date()) {
  const sort = parseSort(query.sort, SORTS, { key: 'last', dir: -1 });
  const { page, limit, skip } = paging(query);
  const settings = await getCrmSettings();
  const rates = (settings && settings.rates) || {};
  const resolve = segmentResolver(now);
  const { seg, qm, match } = await baseMatch(query, resolve);

  const [items, total, counts] = await Promise.all([
    CrmClient.aggregate(pipelineFor(match, sort, rates, { skip, limit })),
    CrmClient.countDocuments(match),
    Promise.all(
      SEGMENTS.map(async (s) =>
        s === seg ? null : CrmClient.countDocuments(and({ mergedInto: null }, qm, await resolve(s)))
      )
    ),
  ]);
  const segCounts = {};
  SEGMENTS.forEach((s, i) => {
    segCounts[s] = s === seg ? total : counts[i];
  });

  return {
    items: (items || []).map((d) => clientRow(d, now)),
    total,
    page,
    limit,
    seg,
    counts: segCounts,
    currentMonth: currentMonthKey(now),
  };
}

const EXPORT_LIMIT = 50000;

async function exportClients(query = {}, now = new Date()) {
  const sort = parseSort(query.sort, SORTS, { key: 'last', dir: -1 });
  const settings = await getCrmSettings();
  const rates = (settings && settings.rates) || {};
  const { match } = await baseMatch(query, segmentResolver(now));
  const items = await CrmClient.aggregate(pipelineFor(match, sort, rates, { limit: EXPORT_LIMIT }));
  return (items || []).map((d) => clientRow(d, now));
}

module.exports = {
  SEGMENTS,
  SORTS,
  segmentResolver,
  searchMatch,
  inClubUser,
  clientRow,
  listClients,
  exportClients,
  EXPORT_LIMIT,
};
