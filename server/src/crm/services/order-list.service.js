const mongoose = require('mongoose');
const CrmOrder = require('../models/CrmOrder');
const CrmClient = require('../models/CrmClient');
const CrmProduct = require('../models/CrmProduct');
const CrmMember = require('../models/CrmMember');
const { getCrmSettings } = require('./settings.service');
const { escapeRe, toBynExpr, round2, paging, parseSort } = require('./view.helpers');
const { loadRefs, orderRow } = require('./order-view.service');

/**
 * Список заказов (CRM-PLAN D4): GET /api/crm/orders и выгрузка.
 *
 * Вкладки статусов — как в плане (не как в прототипе):
 *   all — Все; unpaid — Не оплачены (new + partial); confirm — Ждут
 *   подтверждения; paid — Оплачены; free — Без оплаты; fake — Ложные;
 *   refund — Возвраты.
 * Фильтры: source (способ оплаты или источник заказа), manager (id | 'none'),
 * from/to (дата создания, YYYY-MM-DD), q (номер, клиентка, почта, позиция, тег).
 * Сортировка: date | num | client | amount | status (+ '-' или ':desc').
 *
 * Агрегация не приводит типы сама — id и даты приводятся здесь.
 */
const { ObjectId } = mongoose.Types;
const isId = (v) => mongoose.Types.ObjectId.isValid(v) && String(new ObjectId(v)) === String(v);

const TABS = {
  all: null,
  unpaid: { status: { $in: ['new', 'partial'] } },
  confirm: { status: 'confirm' },
  paid: { status: 'paid' },
  free: { status: 'free' },
  fake: { status: 'fake' },
  refund: { status: 'refund' },
};
const TAB_KEYS = Object.keys(TABS);

const METHODS = ['bepaid', 'lava', 'transfer', 'balance'];
const SOURCES = ['site', 'manual', 'app_store', 'google_play', 'import', 'admin'];

const STATUS_RANK = { new: 1, confirm: 2, partial: 2, paid: 3, free: 4, refund: 5, fake: 6 };
const SORTS = ['date', 'num', 'client', 'amount', 'status'];

const and = (...parts) => {
  const list = parts.filter((p) => p && Object.keys(p).length);
  if (!list.length) {return {};}
  return list.length === 1 ? list[0] : { $and: list };
};

function parseDay(s, endOfDay) {
  if (!s) {return null;}
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), ...(endOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0]))
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Условия всех фильтров, кроме вкладки статуса (вкладки считаются по ним). */
async function buildBaseMatch(query = {}) {
  const parts = [];

  const src = String(query.source || '').trim();
  if (METHODS.includes(src)) {parts.push({ 'payments.method': src });}
  else if (SOURCES.includes(src)) {parts.push({ source: src });}
  else if (src === 'free') {parts.push({ status: 'free' });}

  const mgr = String(query.manager || '').trim();
  if (mgr === 'none') {parts.push({ managerId: null });}
  else if (isId(mgr)) {parts.push({ managerId: new ObjectId(mgr) });}

  const from = parseDay(query.from, false);
  const to = parseDay(query.to, true);
  if (from || to) {
    const c = {};
    if (from) {c.$gte = from;}
    if (to) {c.$lte = to;}
    parts.push({ createdAt: c });
  }

  if (query.clientId && isId(query.clientId)) {
    parts.push({ clientId: new ObjectId(query.clientId) });
  }

  const q = String(query.q || '').trim();
  if (q) {
    const num = q.replace(/^[#№]\s*/, '');
    if (/^\d+$/.test(num)) {
      parts.push({ num: Number(num) });
    } else {
      const rx = new RegExp(escapeRe(q), 'i');
      const [clients, products] = await Promise.all([
        CrmClient.find({ $or: [{ name: rx }, { primaryEmail: rx }, { 'emails.email': rx }] })
          .select('_id')
          .limit(1000)
          .lean(),
        CrmProduct.find({ name: rx }).select('_id').limit(200).lean(),
      ]);
      parts.push({
        $or: [
          { productTitle: rx },
          { tags: rx },
          { note: rx },
          { clientId: { $in: clients.map((c) => c._id) } },
          { productId: { $in: products.map((p) => p._id) } },
        ],
      });
    }
  }

  const ids = query.ids;
  if (Array.isArray(ids) && ids.length) {
    parts.push({ _id: { $in: ids.map((x) => new ObjectId(x)) } });
  }
  return and(...parts);
}

function tabMatch(tab) {
  return TABS[tab] || null;
}

/** Стадии сортировки (с полями для сортировки по клиентке/сумме/статусу). */
function sortStages(sort, rates) {
  const stages = [];
  let field;
  if (sort.key === 'client') {
    stages.push(
      {
        $lookup: {
          from: CrmClient.collection.name,
          localField: 'clientId',
          foreignField: '_id',
          as: '_c',
        },
      },
      { $addFields: { _sort: { $toLower: { $ifNull: [{ $arrayElemAt: ['$_c.name', 0] }, ''] } } } },
      { $project: { _c: 0 } }
    );
    field = '_sort';
  } else if (sort.key === 'amount') {
    stages.push({ $addFields: { _sort: toBynExpr('$price', '$cur', rates) } });
    field = '_sort';
  } else if (sort.key === 'status') {
    stages.push({
      $addFields: {
        _sort: {
          $switch: {
            branches: Object.entries(STATUS_RANK).map(([k, v]) => ({
              case: { $eq: ['$status', k] },
              then: v,
            })),
            default: 9,
          },
        },
      },
    });
    field = '_sort';
  } else if (sort.key === 'num') {
    field = 'num';
  } else {
    field = 'createdAt';
  }
  stages.push({ $sort: { [field]: sort.dir, _id: sort.dir } });
  return stages;
}

async function listOrders(query = {}, now = new Date()) {
  const tab = TAB_KEYS.includes(query.status) ? query.status : 'all';
  const sort = parseSort(query.sort, SORTS, { key: 'date', dir: -1 });
  const { page, limit, skip } = paging(query);
  const settings = await getCrmSettings();
  const rates = (settings && settings.rates) || {};

  const base = await buildBaseMatch(query);
  const match = and(base, tabMatch(tab));

  const [listRes, statRes, managers] = await Promise.all([
    CrmOrder.aggregate([
      { $match: match },
      {
        $facet: {
          items: [...sortStages(sort, rates), { $skip: skip }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]),
    CrmOrder.aggregate([
      { $match: base },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
          received: [
            { $match: tabMatch(tab) || {} },
            { $unwind: '$payments' },
            { $match: { 'payments.pending': { $ne: true }, 'payments.method': { $ne: 'balance' } } },
            {
              $group: {
                _id: null,
                s: { $sum: toBynExpr('$payments.amount', '$payments.cur', rates) },
              },
            },
          ],
        },
      },
    ]),
    CrmMember.find({ active: true }).select('name role').lean(),
  ]);

  const facet = (listRes && listRes[0]) || {};
  const items = facet.items || [];
  const total = facet.total && facet.total[0] ? facet.total[0].n : 0;

  const stat = (statRes && statRes[0]) || {};
  const by = {};
  (stat.byStatus || []).forEach((x) => {
    by[x._id] = x.n;
  });
  const tabs = {
    all: Object.values(by).reduce((t, n) => t + n, 0),
    unpaid: (by.new || 0) + (by.partial || 0),
    confirm: by.confirm || 0,
    paid: by.paid || 0,
    free: by.free || 0,
    fake: by.fake || 0,
    refund: by.refund || 0,
  };
  const receivedByn = round2(stat.received && stat.received[0] ? stat.received[0].s : 0);

  const refs = await loadRefs(items);
  return {
    items: items.map((o) => orderRow(o, refs, now)),
    total,
    page,
    limit,
    tab,
    tabs,
    receivedByn,
    managers: (managers || []).map((m) => ({ id: String(m._id), name: m.name })),
  };
}

const EXPORT_LIMIT = 20000;

/** Все строки по фильтрам (без страниц) — для выгрузки. */
async function exportOrders(query = {}, now = new Date()) {
  const tab = TAB_KEYS.includes(query.status) ? query.status : 'all';
  const sort = parseSort(query.sort, SORTS, { key: 'date', dir: -1 });
  const settings = await getCrmSettings();
  const rates = (settings && settings.rates) || {};
  const match = and(await buildBaseMatch(query), tabMatch(tab));
  const items = await CrmOrder.aggregate([
    { $match: match },
    ...sortStages(sort, rates),
    { $limit: EXPORT_LIMIT },
  ]);
  const refs = await loadRefs(items || []);
  return (items || []).map((o) => orderRow(o, refs, now));
}

module.exports = {
  TABS,
  TAB_KEYS,
  STATUS_RANK,
  buildBaseMatch,
  tabMatch,
  listOrders,
  exportOrders,
  EXPORT_LIMIT,
};
