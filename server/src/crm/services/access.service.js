const logger = require('../../config/logger');
const { AppError } = require('../../middleware/error');
const { clubMonthKeysForPurchase } = require('../../middleware/subscription');
const entitlement = require('../../services/entitlement.service');
const User = require('../../models/User');
const Book = require('../../models/Book');
const Package = require('../../models/Package');
const ClubMonth = require('../../models/ClubMonth');
const Purchase = require('../../models/Purchase');
const CrmClient = require('../models/CrmClient');
const CrmOrder = require('../models/CrmOrder');
const CrmProduct = require('../models/CrmProduct');
const CrmEvent = require('../models/CrmEvent');
const CrmBalanceOp = require('../models/CrmBalanceOp');

/**
 * Доступ по заказам CRM (CRM-PLAN B2, B3, B5; 05.11.2026).
 *
 * applyOrder(order) — единственная точка, где заказ превращается в права:
 *   - статус «Оплачен»/«Бесплатно» (или «Частично» при рассрочке с
 *     accessOnFirstPayment) → выдать по product.grant через entitlement.service;
 *   - «Возврат»/«Ложный» → снять РОВНО order.granted (что держат другие заказы,
 *     App Store и ручная выдача — остаётся);
 *   - повторный вызов ничего не дублирует (granted.at уже стоит).
 * Подарок: права получает клиентка-получательница (gift.recipientClientId;
 * нет — создаётся по gift.email).
 *
 * Права в приложении пишутся в User клиентки (CrmClient.appUserId). Не связана
 * — заказ ждёт: linkUser при входе/регистрации под этой почтой (B5) или ручная
 * привязка менеджером (B6) применят все оплаченные заказы.
 *
 * Что лежит в CrmOrder.granted (снимок для возврата):
 *   at, months, bookIds, packageIds — выданное;
 *   subscriptionSet (Mixed) — { type, userId, clientId, chatMonths,
 *     materialsForever, termUntil, termExpiredAt, deposit,
 *     preexisting: {months, chatMonths, bookIds, packageIds} — было у неё до
 *       заказа, при возврате не снимаем,
 *     subscription: {prev, set} — срок подписки до и после выдачи }.
 *
 * Письма получательнице и ссылки на Telegram-каналы — блоки F и G, здесь их нет.
 */

const GRANTING = ['paid', 'free'];
const REVOKING = ['fake', 'refund'];
const PENDING_GRANT = ['paid', 'free', 'partial'];

const PLAN_BY_COUNT = { 1: 'monthly', 3: 'season', 6: 'semiannual', 12: 'annual' };

const sameId = (a, b) =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const idOf = (v) => (v && v._id ? v._id : v);
const normEmail = (e) => (typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null);

function confirmedPayments(order) {
  return (order.payments || [])
    .filter((p) => !p.pending)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

/** Выдавать ли доступ по заказу сейчас. */
function shouldGrant(order, product) {
  if (GRANTING.includes(order.status)) {return true;}
  return (
    order.status === 'partial' &&
    Boolean(product && product.accessOnFirstPayment) &&
    confirmedPayments(order).length > 0
  );
}

/**
 * Дата, от которой считаются «месяц оплаты», «год с оплаты», «N мес. с оплаты»:
 * рассрочка с доступом после первого платежа — первый платёж; полная оплата —
 * последний (дата, когда заказ стал оплачен); бесплатно — создание заказа.
 * Именно дата платежа, а не «сейчас»: заказ может примениться позже, при
 * первом входе в приложение.
 */
function paidAt(order, product) {
  const pays = confirmedPayments(order);
  if (pays.length) {
    const first = product && product.accessOnFirstPayment;
    return new Date((first ? pays[0] : pays[pays.length - 1]).at);
  }
  return order.createdAt ? new Date(order.createdAt) : new Date();
}

/** Конец срока для разборов/пакетов/«только письма» (product.term). */
function termUntil(product, from) {
  const term = product.term || {};
  if (term.mode === 'date' && term.date) {return new Date(term.date);}
  if (term.mode === 'months' && term.n > 0) {
    const d = new Date(from);
    d.setUTCMonth(d.getUTCMonth() + Number(term.n));
    return d;
  }
  return null;
}

/** Клубные месяцы по типу grant (L1: те же функции ключей, что у покупок). */
function monthsFor(product, at) {
  const g = product.grant || {};
  if (g.type === 'month') {
    return { keys: clubMonthKeysForPurchase(at, 'monthly'), plan: 'monthly' };
  }
  if (g.type === 'year') {
    return { keys: clubMonthKeysForPurchase(at, 'annual'), plan: 'annual' };
  }
  if (g.type === 'months') {
    const keys = [...new Set((g.months || []).map(entitlement.normalizeMonthKey).filter(Boolean))];
    return { keys, plan: PLAN_BY_COUNT[keys.length] || 'monthly' };
  }
  return { keys: [], plan: null };
}

async function findClientByEmail(email) {
  return CrmClient.findOne({
    mergedInto: null,
    $or: [{ 'emails.email': email }, { primaryEmail: email }],
  });
}

async function findOrCreateClientByEmail(email, { name = '', source = 'site' } = {}) {
  const found = await findClientByEmail(email);
  if (found) {return found;}
  return CrmClient.create({
    name: name || '',
    emails: [{ email, source }],
    primaryEmail: email,
  });
}

/** Кто получает права по заказу: получательница подарка или сама клиентка. */
async function resolveRecipient(order) {
  const gift = order.gift || {};
  if (gift.recipientClientId) {return idOf(gift.recipientClientId);}
  const giftEmail = normEmail(gift.email);
  if (giftEmail) {
    const client = await findOrCreateClientByEmail(giftEmail, { name: gift.name });
    order.gift.recipientClientId = client._id;
    return client._id;
  }
  return idOf(order.clientId);
}

function markGranted(order) {
  if (typeof order.markModified === 'function') {order.markModified('granted');}
}

async function logEvent(clientId, order, who, text, type) {
  try {
    await CrmEvent.create({ clientId, orderId: order ? order._id : null, who, text, type });
  } catch (err) {
    logger.warn('CRM event не записан', { message: err.message });
  }
}

/* ------------------------------------------------------------------ *
 *                              ВЫДАЧА                                 *
 * ------------------------------------------------------------------ */

async function grantOrder(order, product, who) {
  const recipientId = await resolveRecipient(order);
  const at = paidAt(order, product);
  const type = (product.grant && product.grant.type) || 'none';
  const now = new Date();
  const ss = {
    type,
    userId: null,
    clientId: recipientId,
    chatMonths: [],
    materialsForever: false,
    termUntil: null,
    termExpiredAt: null,
    deposit: null,
    preexisting: { months: [], chatMonths: [], bookIds: [], packageIds: [] },
    subscription: null,
  };
  const granted = { at: now, months: [], bookIds: [], packageIds: [], subscriptionSet: ss };
  let text;

  if (type === 'deposit') {
    // Баланс — у клиентки CRM, аккаунт приложения не нужен (в приложении
    // баланс не показываем, решение 24.10).
    const amount = Number(
      product.grant.deposit !== null && product.grant.deposit !== undefined
        ? product.grant.deposit
        : order.price || 0
    );
    if (amount > 0) {
      await CrmClient.updateOne({ _id: recipientId }, { $inc: { balance: amount } });
      await CrmBalanceOp.create({
        clientId: recipientId,
        amount,
        reason: `Заказ №${order.num}: ${product.name}`,
        orderId: order._id,
      });
    }
    ss.deposit = amount;
    text = `Баланс пополнен на ${amount} BYN`;
  } else if (type === 'tier2' || type === 'none') {
    // В приложении ничего не открывается (Тариф 2 — зум вне приложения;
    // «только письмо/канал»). Срок term пригодится Telegram-каналам (G).
    ss.termUntil = type === 'none' ? termUntil(product, at) : null;
    text = type === 'tier2' ? 'Тариф 2: доступ вне приложения' : 'Доступ вне приложения';
  } else {
    const client = await CrmClient.findById(recipientId).select('appUserId').lean();
    const user = client && client.appUserId ? await User.findById(client.appUserId) : null;
    if (!user || user.isDeleted) {
      return { action: 'not_linked' };
    }
    ss.userId = user._id;
    const base = { source: 'crm', orderId: order._id, purchasedAt: at };

    if (type === 'month' || type === 'months' || type === 'year') {
      const { keys, plan } = monthsFor(product, at);
      const snap = await entitlement.grantClubMonths(user, keys, {
        ...base,
        plan,
        chatForever: Boolean(product.chatForever),
      });
      granted.months = snap.months;
      ss.chatMonths = snap.chatMonths;
      ss.preexisting.months = snap.preexisting.months;
      ss.preexisting.chatMonths = snap.preexisting.chatMonths;
      ss.subscription = snap.subscription;
      text = `Клуб: ${snap.months.join(', ')}`;

      // Тариф 3 (B3): разбор месяца — навсегда, штатным purchasedBooks (+ запись
      // Purchase, чтобы он был в «Профиль → Мои покупки»). Месяцы без ClubMonth
      // доложит materialsForClubMonth при создании клуба в админке.
      if (product.materialsForever) {
        ss.materialsForever = true;
        const books = await clubBooksFor(snap.months);
        if (books.length) {
          const b = await entitlement.grantBooks(user, books, base);
          granted.bookIds = b.bookIds;
          ss.preexisting.bookIds = b.preexisting.bookIds;
          text += `; разборы навсегда: ${books.map((x) => x.bookSlug).join(', ')}`;
        }
      }
    } else if (type === 'book' || type === 'pack') {
      ss.termUntil = termUntil(product, at);
      if (ss.termUntil && ss.termUntil <= now) {
        // Привязали уже после окончания срока — открывать нечего.
        ss.termExpiredAt = now;
        text = 'Срок доступа уже закончился — не выдано';
      } else if (type === 'book') {
        const books = await Book.find({ bookSlug: { $in: product.grant.bookSlugs || [] } })
          .select('_id bookSlug priceUsd')
          .lean();
        const b = await entitlement.grantBooks(user, books, base);
        granted.bookIds = b.bookIds;
        ss.preexisting.bookIds = b.preexisting.bookIds;
        text = `Разборы: ${books.map((x) => x.bookSlug).join(', ')}`;
      } else {
        const pkg = await Package.findOne({ packageSlug: product.grant.packageSlug })
          .select('_id packageSlug priceUsd')
          .lean();
        if (pkg) {
          const p = await entitlement.grantPackage(user, pkg, base);
          granted.packageIds = p.packageIds;
          ss.preexisting.packageIds = p.preexisting.packageIds;
          text = `Пакет: ${pkg.packageSlug}`;
        } else {
          text = `Пакет «${product.grant.packageSlug}» не найден — не выдано`;
        }
      }
      if (ss.termUntil && !ss.termExpiredAt) {
        text += ` (до ${ss.termUntil.toISOString().slice(0, 10)})`;
      }
    } else {
      text = `Неизвестный тип выдачи «${type}»`;
    }
  }

  order.granted = granted;
  markGranted(order);
  if (Array.isArray(order.history)) {order.history.push({ at: now, who, text: `Доступ выдан. ${text}` });}
  await order.save();
  await logEvent(recipientId, order, who, `Заказ №${order.num}: доступ выдан. ${text}`, 'access');
  return { action: 'granted', granted };
}

/** Книги клубов этих месяцев (только для заведённых ClubMonth). */
async function clubBooksFor(keys) {
  const pairs = keys.map(entitlement.parseMonthKey).filter(Boolean);
  if (!pairs.length) {return [];}
  const clubs = await ClubMonth.find({ $or: pairs }).select('bookId year month').lean();
  const ids = clubs.map((c) => c.bookId).filter(Boolean);
  if (!ids.length) {return [];}
  return Book.find({ _id: { $in: ids } }).select('_id bookSlug priceUsd').lean();
}

/* ------------------------------------------------------------------ *
 *                              СНЯТИЕ                                 *
 * ------------------------------------------------------------------ */

/**
 * Что у участницы держат ДРУГИЕ источники — это при снятии остаётся:
 * другие действующие заказы CRM на этот же аккаунт, покупки App Store /
 * Google Play и ручные выдачи админки (активные Purchase не от этого заказа).
 */
async function keepFor(order, userId) {
  const others = await CrmOrder.find({
    _id: { $ne: order._id },
    'granted.at': { $ne: null },
    status: { $nin: REVOKING },
    'granted.subscriptionSet.userId': userId,
  })
    .select('granted')
    .lean();
  const keep = { months: [], chatMonths: [], bookIds: [], packageIds: [] };
  others.forEach((o) => {
    const g = o.granted || {};
    const s = g.subscriptionSet || {};
    keep.months.push(...(g.months || []));
    keep.chatMonths.push(...(s.chatMonths || []));
    if (!s.termExpiredAt) {
      keep.bookIds.push(...(g.bookIds || []));
      keep.packageIds.push(...(g.packageIds || []));
    }
  });
  keep.expiresAt = entitlement.lastMonthEnd(keep.months);

  const ownPrefix = `crm-${order._id}-`;
  const purchases = await Purchase.find({
    userId,
    status: 'active',
    itemType: { $in: ['book', 'package'] },
  })
    .select('itemType itemId transactionId')
    .lean();
  const foreign = purchases.filter((p) => !String(p.transactionId || '').startsWith(ownPrefix));
  const bookSlugs = foreign.filter((p) => p.itemType === 'book').map((p) => p.itemId);
  const pkgSlugs = foreign.filter((p) => p.itemType === 'package').map((p) => p.itemId);
  if (bookSlugs.length) {
    const books = await Book.find({ bookSlug: { $in: bookSlugs } }).select('_id').lean();
    keep.bookIds.push(...books.map((b) => b._id));
  }
  if (pkgSlugs.length) {
    const pkgs = await Package.find({ packageSlug: { $in: pkgSlugs } }).select('_id').lean();
    keep.packageIds.push(...pkgs.map((p) => p._id));
  }
  return keep;
}

/**
 * Снять выданное заказом.
 * opts.money — вернуть и пополнение баланса (возврат/ложный; при отвязке — нет);
 * opts.only === 'content' — только разборы и пакеты (кончился срок term),
 *   granted остаётся с отметкой termExpiredAt, чтобы заказ не выдался снова.
 */
async function undoGrant(order, { money = true, only = null, reason, who = 'Система' } = {}) {
  const g = order.granted || {};
  const ss = g.subscriptionSet || {};
  const parts = [];

  if (money && ss.deposit > 0 && !only) {
    const clientId = ss.clientId || idOf(order.clientId);
    const res = await CrmClient.findOneAndUpdate(
      { _id: clientId, balance: { $gte: ss.deposit } },
      { $inc: { balance: -ss.deposit } },
      { new: true }
    );
    if (!res) {
      throw new AppError(
        'VALIDATION_ERROR',
        `На балансе меньше ${ss.deposit} BYN — пополнение уже потрачено, снимите вручную`,
        409
      );
    }
    await CrmBalanceOp.create({
      clientId,
      amount: -ss.deposit,
      reason: `${reason}: заказ №${order.num}`,
      orderId: order._id,
    });
    parts.push(`баланс −${ss.deposit} BYN`);
  }

  const contentGone = Boolean(ss.termExpiredAt);
  if (ss.userId && !(only === 'content' && contentGone)) {
    const user = await User.findById(ss.userId);
    if (user) {
      const keep = await keepFor(order, ss.userId);
      const removed = await entitlement.revokeGranted(
        user,
        {
          months: g.months || [],
          bookIds: contentGone ? [] : g.bookIds || [],
          packageIds: contentGone ? [] : g.packageIds || [],
          subscriptionSet: ss,
        },
        { keep, only, orderId: order._id }
      );
      if (removed.months.length) {parts.push(`клуб ${removed.months.join(', ')}`);}
      if (removed.bookIds.length) {parts.push(`разборов: ${removed.bookIds.length}`);}
      if (removed.packageIds.length) {parts.push(`пакетов: ${removed.packageIds.length}`);}
    }
  }

  const now = new Date();
  if (only === 'content') {
    order.granted.subscriptionSet = { ...ss, termExpiredAt: now };
  } else {
    order.granted = { at: null, months: [], bookIds: [], packageIds: [], subscriptionSet: null };
  }
  markGranted(order);
  const text = `${reason}: доступ снят${parts.length ? ` (${parts.join('; ')})` : ''}`;
  if (Array.isArray(order.history)) {order.history.push({ at: now, who, text });}
  await order.save();
  await logEvent(ss.clientId || idOf(order.clientId), order, who, `Заказ №${order.num}. ${text}`, 'access');
  return { action: 'revoked', parts };
}

/* ------------------------------------------------------------------ *
 *                          ГЛАВНАЯ ТОЧКА                              *
 * ------------------------------------------------------------------ */

/**
 * Применить заказ (B2). Вызывать после любой смены статуса/платежей заказа.
 * Возвращает { action: 'granted'|'revoked'|'not_linked'|'noop', ... }.
 */
async function applyOrder(order, { who = 'Система' } = {}) {
  // Заказы из App Store / Google Play и перенесённые ручные выдачи админки
  // (C1, C3) — запись о правах, выданных вне CRM: доступ у них ведёт
  // applyTransaction / админка, CRM его не выдаёт и не снимает (L6).
  if (order.purchaseId) {
    return { action: 'noop', reason: 'external_purchase' };
  }
  const productId = idOf(order.productId);
  const product = productId ? await CrmProduct.findById(productId).lean() : null;
  if (!product) {
    return { action: 'noop', reason: 'no_product' };
  }
  const granted = order.granted || {};

  if (REVOKING.includes(order.status)) {
    if (!granted.at) {return { action: 'noop', reason: 'nothing_granted' };}
    return undoGrant(order, {
      money: true,
      reason: order.status === 'refund' ? 'Возврат' : 'Ложный заказ',
      who,
    });
  }
  if (!shouldGrant(order, product)) {return { action: 'noop', reason: 'not_paid' };}
  if (granted.at) {return { action: 'noop', reason: 'already_granted' };}
  return grantOrder(order, product, who);
}

/* ------------------------------------------------------------------ *
 *                  СВЯЗЬ С АККАУНТОМ ПРИЛОЖЕНИЯ (B5, B6)              *
 * ------------------------------------------------------------------ */

/** Применить все оплаченные, ещё не выданные заказы клиентки. */
async function applyClientOrders(clientId, { who = 'Система' } = {}) {
  const orders = await CrmOrder.find({
    'granted.at': null,
    status: { $in: PENDING_GRANT },
    $or: [
      { 'gift.recipientClientId': clientId },
      { clientId, 'gift.recipientClientId': null, 'gift.email': null },
    ],
  }).sort({ createdAt: 1 });
  let applied = 0;
  for (const order of orders) {
    const r = await applyOrder(order, { who });
    if (r.action === 'granted') {applied += 1;}
  }
  return applied;
}

/** Связать клиентку с аккаунтом (без применения заказов). */
async function attachClient(client, user, { who = 'Система', how = 'по почте' } = {}) {
  client.appUserId = user._id;
  const email = normEmail(user.email);
  if (email && !(client.emails || []).some((e) => e.email === email)) {
    client.emails.push({ email, source: 'app' });
  }
  await client.save();
  await logEvent(
    client._id,
    null,
    who,
    `Связана с аккаунтом приложения${email ? ` ${email}` : ''} (${how})`,
    'link'
  );
}

/**
 * B5: после регистрации/входа/смены почты — найти клиенток CRM с этой почтой,
 * связать и выдать всё оплаченное. Оплатила на сайте раньше, чем завела
 * аккаунт, — доступ появляется при первом входе.
 */
async function linkUser(user) {
  const email = normEmail(user && user.email);
  if (!email || !user._id) {return { linked: 0, applied: 0 };}

  // Подарки на эту почту, по которым ещё не заведена получательница.
  const gifts = await CrmOrder.find({
    'gift.email': email,
    'gift.recipientClientId': null,
    'granted.at': null,
    status: { $in: PENDING_GRANT },
  });
  for (const order of gifts) {
    await resolveRecipient(order);
    await order.save();
  }

  const clients = await CrmClient.find({
    mergedInto: null,
    $or: [{ 'emails.email': email }, { primaryEmail: email }],
  });
  let linked = 0;
  let applied = 0;
  for (const client of clients) {
    if (client.appUserId && !sameId(client.appUserId, user._id)) {
      logger.warn('CRM linkUser: клиентка уже связана с другим аккаунтом', {
        clientId: String(client._id),
        userId: String(user._id),
      });
      continue;
    }
    if (!client.appUserId) {
      await attachClient(client, user, { how: 'по почте при входе' });
      linked += 1;
    }
    applied += await applyClientOrders(client._id);
  }
  return { linked, applied };
}

/** Вызов из входа/регистрации/админки: ошибка CRM вход не ломает. */
async function linkUserSafe(user, context = 'auth') {
  try {
    return await linkUser(user);
  } catch (err) {
    logger.error('CRM linkUser error', {
      context,
      userId: user && user._id ? String(user._id) : null,
      message: err.message,
    });
    return null;
  }
}

/**
 * Для входа/регистрации: связать и вернуть документ User для ответа. Если
 * заказы что-то выдали — перечитываем, чтобы приложение сразу получило
 * подписку/разборы в ответе входа. Любая ошибка — исходный user.
 */
async function linkUserForAuth(user, context) {
  const res = await linkUserSafe(user, context);
  if (!res || !res.applied) {return user;}
  try {
    return (await User.findById(user._id)) || user;
  } catch (err) {
    logger.error('CRM linkUser: не удалось перечитать пользователя', { message: err.message });
    return user;
  }
}

/**
 * B6: отвязка. Права, выданные заказами этой клиентки на этот аккаунт,
 * снимаются (связь была ошибочной — доступ уходит с чужого аккаунта); заказы
 * снова «не выданы» и применятся при следующей привязке. Баланс не трогаем —
 * он у клиентки CRM, а не в приложении.
 */
async function unlinkClient(client, { who = 'Система' } = {}) {
  const userId = client.appUserId;
  if (!userId) {return { revoked: 0 };}
  const orders = await CrmOrder.find({
    'granted.at': { $ne: null },
    'granted.subscriptionSet.userId': userId,
    $or: [
      { 'gift.recipientClientId': client._id },
      { clientId: client._id, 'gift.recipientClientId': null },
    ],
  });
  let revoked = 0;
  for (const order of orders) {
    await undoGrant(order, { money: false, reason: 'Отвязка от аккаунта', who });
    revoked += 1;
  }
  client.appUserId = null;
  await client.save();
  await logEvent(client._id, null, who, 'Отвязана от аккаунта приложения', 'link');
  return { revoked };
}

/* ------------------------------------------------------------------ *
 *                   ТАРИФ 3 И СРОКИ (B3, term из B2)                  *
 * ------------------------------------------------------------------ */

/**
 * B3: клуб месяца заведён в админке — доложить его разбор тем, у кого есть
 * заказ CRM с materialsForever на этот месяц (выданный, не возвращённый).
 * Вызывается из admin-club.js после создания ClubMonth; ошибки — в лог.
 */
async function materialsForClubMonth(club) {
  const key = `${club.year}-${club.month}`;
  const book = await Book.findById(club.bookId).select('_id bookSlug priceUsd').lean();
  if (!book) {return 0;}
  const orders = await CrmOrder.find({
    'granted.at': { $ne: null },
    'granted.months': key,
    status: { $nin: REVOKING },
    'granted.subscriptionSet.materialsForever': true,
  });
  let done = 0;
  for (const order of orders) {
    try {
      const ss = order.granted.subscriptionSet || {};
      if ((order.granted.bookIds || []).some((id) => sameId(id, book._id))) {continue;}
      const user = ss.userId ? await User.findById(ss.userId) : null;
      if (!user) {continue;}
      const b = await entitlement.grantBooks(user, [book], {
        source: 'crm',
        orderId: order._id,
        purchasedAt: new Date(),
      });
      order.granted.bookIds = [...(order.granted.bookIds || []), book._id];
      const pre = ss.preexisting || {};
      order.granted.subscriptionSet = {
        ...ss,
        preexisting: {
          ...pre,
          bookIds: [...(pre.bookIds || []), ...b.preexisting.bookIds],
        },
      };
      markGranted(order);
      const text = `Тариф 3: разбор клуба ${key} (${book.bookSlug}) добавлен навсегда`;
      if (Array.isArray(order.history)) {order.history.push({ at: new Date(), who: 'Система', text });}
      await order.save();
      await logEvent(ss.clientId || order.clientId, order, 'Система', `Заказ №${order.num}. ${text}`, 'access');
      done += 1;
    } catch (err) {
      logger.error('CRM materialsForClubMonth: заказ не обработан', {
        orderId: String(order._id),
        message: err.message,
      });
    }
  }
  return done;
}

/**
 * Срок term («до даты» / «N мес. с оплаты») для разборов и пакетов: снять
 * доступ у заказов, срок которых прошёл. Запускается раз в день
 * (crm/jobs/term-expiry.js).
 */
async function expireTerms(now = new Date()) {
  const orders = await CrmOrder.find({
    'granted.at': { $ne: null },
    status: { $nin: REVOKING },
    'granted.subscriptionSet.termUntil': { $lte: now },
    'granted.subscriptionSet.termExpiredAt': null,
  });
  let done = 0;
  for (const order of orders) {
    try {
      await undoGrant(order, { money: false, only: 'content', reason: 'Срок доступа закончился' });
      done += 1;
    } catch (err) {
      logger.error('CRM expireTerms: заказ не обработан', {
        orderId: String(order._id),
        message: err.message,
      });
    }
  }
  return done;
}

module.exports = {
  applyOrder,
  applyClientOrders,
  attachClient,
  linkUser,
  linkUserSafe,
  linkUserForAuth,
  unlinkClient,
  materialsForClubMonth,
  expireTerms,
  findOrCreateClientByEmail,
  // для тестов и скрипта сверки
  shouldGrant,
  paidAt,
  termUntil,
  monthsFor,
  GRANTING,
  REVOKING,
};
