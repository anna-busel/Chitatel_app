const User = require('../../models/User');
const Book = require('../../models/Book');
const Package = require('../../models/Package');
const CrmOrder = require('../models/CrmOrder');
const CrmMember = require('../models/CrmMember');
const CrmBalanceOp = require('../models/CrmBalanceOp');
const CrmEvent = require('../models/CrmEvent');
const { currentMonthKey, lastMonthKey, sortMonthKeys, round2 } = require('./view.helpers');
const { loadRefs, orderRow } = require('./order-view.service');

/**
 * Карточка клиентки (CRM-PLAN D2): всё, что показывает шторка.
 *
 * Доступ в приложении — из связанного User: месяцы клуба, Тариф 2, разборы,
 * пакеты, срок подписки; Тариф 3 — есть заказ с materialsForever.
 * «Последний вход»: такого поля у User нет — отдаём null, пока его не
 * заведёт приложение (в шторке «нет данных»).
 */

const isMemberId = (s) => /^[a-f0-9]{24}$/i.test(String(s || ''));

async function memberNames(ids) {
  const list = [...new Set(ids.filter(isMemberId).map(String))];
  if (!list.length) {return new Map();}
  const members = await CrmMember.find({ _id: { $in: list } }).select('name').lean();
  return new Map(members.map((m) => [String(m._id), m.name]));
}

function commentView(c, names) {
  return {
    id: String(c._id),
    at: c.at,
    text: c.text,
    who: (c.memberId && names.get(String(c.memberId))) || 'Команда',
  };
}

async function appAccess(client, orders, now) {
  if (!client.appUserId) {return null;}
  const user = await User.findById(client.appUserId)
    .select(
      'email name isDeleted clubMonthsEntitled tier2MonthsEntitled clubChatForever purchasedBooks ' +
        'purchasedPackages subscriptionStatus subscriptionPlan subscriptionExpiresAt ' +
        'subscriptionPlatform gracePeriodExpiresAt'
    )
    .lean();
  if (!user) {return { missing: true };}

  const [books, packages] = await Promise.all([
    (user.purchasedBooks || []).length
      ? Book.find({ _id: { $in: user.purchasedBooks } }).select('title bookSlug').lean()
      : [],
    (user.purchasedPackages || []).length
      ? Package.find({ _id: { $in: user.purchasedPackages } }).select('title packageSlug').lean()
      : [],
  ]);

  const cur = currentMonthKey(now);
  const months = sortMonthKeys(user.clubMonthsEntitled);
  const tier2 = sortMonthKeys(user.tier2MonthsEntitled);
  const activeSub =
    ['basic', 'premium'].includes(user.subscriptionStatus) &&
    ((user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now) ||
      (user.gracePeriodExpiresAt && new Date(user.gracePeriodExpiresAt) > now));

  return {
    missing: false,
    deleted: Boolean(user.isDeleted),
    email: user.email || null,
    name: user.name || null,
    lastSeenAt: null,
    clubMonths: months,
    tier2Months: tier2,
    chatForever: sortMonthKeys(user.clubChatForever),
    inClubNow: Boolean(activeSub && months.includes(cur)),
    tier2Now: tier2.includes(cur),
    tier3: orders.some(
      (o) =>
        o.granted &&
        o.granted.at &&
        o.granted.subscriptionSet &&
        o.granted.subscriptionSet.materialsForever &&
        !['fake', 'refund'].includes(o.status)
    ),
    storeSubscription: ['apple', 'google'].includes(user.subscriptionPlatform)
      ? user.subscriptionPlatform
      : null,
    subscription: {
      status: user.subscriptionStatus || 'free',
      plan: user.subscriptionPlan || null,
      expiresAt: user.subscriptionExpiresAt || null,
    },
    books: books.map((b) => ({ id: String(b._id), title: b.title, slug: b.bookSlug })),
    packages: packages.map((p) => ({ id: String(p._id), title: p.title, slug: p.packageSlug })),
  };
}

async function clientCard(client, now = new Date()) {
  const orders = await CrmOrder.find({
    $or: [{ clientId: client._id }, { 'gift.recipientClientId': client._id }],
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const [app, ops, refs, names] = await Promise.all([
    appAccess(client, orders, now),
    CrmBalanceOp.find({ clientId: client._id }).sort({ at: -1 }).limit(50).lean(),
    loadRefs(orders, { clients: [client] }),
    memberNames((client.comments || []).map((c) => c.memberId)),
  ]);
  const opNames = await memberNames(ops.map((o) => o.by));

  const legacy = sortMonthKeys(client.legacyMonths);
  const appMonths = app && !app.missing ? app.clubMonths : [];
  const tg = client.telegram || {};

  return {
    id: String(client._id),
    name: client.name || '',
    emails: (client.emails || []).map((e) => ({ email: e.email, source: e.source })),
    primaryEmail: client.primaryEmail || null,
    phone: client.phone || null,
    phoneDigits: client.phoneNorm || (client.phone ? String(client.phone).replace(/\D/g, '') : null),
    city: client.city || null,
    country: client.country || null,
    telegram: {
      username: tg.username ? tg.username.replace(/^@/, '') : null,
      botSubscribed: Boolean(tg.botSubscribed),
    },
    whatsapp: Boolean(client.whatsapp),
    tags: client.tags || [],
    since: client.since || client.createdAt || null,
    marketingOptOut: client.marketingOptOut || null,
    linked: Boolean(client.appUserId),
    appUserId: client.appUserId ? String(client.appUserId) : null,
    app,
    access: {
      currentMonth: currentMonthKey(now),
      lastMonth: lastMonthKey(appMonths, legacy),
      legacyMonths: legacy,
      legacyNote: client.legacyNote || null,
    },
    balance: round2(client.balance),
    balanceOps: ops.map((o) => ({
      id: String(o._id),
      at: o.at,
      amount: round2(o.amount),
      reason: o.reason || '',
      orderId: o.orderId ? String(o.orderId) : null,
      who: (o.by && opNames.get(String(o.by))) || (o.orderId ? 'Заказ' : 'Система'),
    })),
    orders: orders.map((o) => orderRow(o, refs, now)),
    comments: (client.comments || [])
      .slice()
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .map((c) => commentView(c, names)),
  };
}

/** История карточки: события CrmEvent, новые сверху. */
async function clientHistory(clientId, { page = 1, limit = 50 } = {}) {
  const [events, total] = await Promise.all([
    CrmEvent.find({ clientId })
      .sort({ at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CrmEvent.countDocuments({ clientId }),
  ]);
  const names = await memberNames(events.map((e) => e.who));
  return {
    items: events.map((e) => ({
      id: String(e._id),
      at: e.at,
      who: names.get(String(e.who)) || e.who || 'Система',
      text: e.text,
      type: e.type || null,
      orderId: e.orderId ? String(e.orderId) : null,
    })),
    total,
    page,
    limit,
  };
}

module.exports = { clientCard, clientHistory, commentView, memberNames };
