const mongoose = require('mongoose');
const logger = require('../../config/logger');
const { AppError } = require('../../middleware/error');
const User = require('../../models/User');
const CrmOrder = require('../models/CrmOrder');
const CrmClient = require('../models/CrmClient');
const CrmProduct = require('../models/CrmProduct');
const CrmMember = require('../models/CrmMember');
const CrmPromo = require('../models/CrmPromo');
const CrmCounter = require('../models/CrmCounter');
const CrmEvent = require('../models/CrmEvent');
const CrmBalanceOp = require('../models/CrmBalanceOp');
const access = require('./access.service');
const { can } = require('./permissions');
const { getCrmSettings } = require('./settings.service');
const { round2 } = require('./view.helpers');
const { loadRefs, orderRow, METHOD_LABEL, STORE_SOURCES } = require('./order-view.service');
const { memberNames, commentView } = require('./client-card.service');

/**
 * Карточка заказа (CRM-PLAN D5) и новый заказ (D6), 19.11.2026.
 *
 * Статус заказа считается здесь по платежам (как status() прототипа):
 *   paid — подтверждённых платежей на весь итог; confirm — итог закрыт вместе
 *   с переводами, которые ждут подтверждения; partial — оплачено частично;
 *   new — платежей нет. free / fake / refund ставятся только действиями.
 * Права в приложении — ТОЛЬКО через access.applyOrder после каждой смены
 * статуса или платежей (выдача, рассрочка с accessOnFirstPayment, снятие
 * ровно order.granted). Своей логики выдачи здесь нет.
 *
 * Заказы App Store / Google Play и перенесённые ручные выдачи админки
 * (purchaseId) — только просмотр и комментарии.
 *
 * Ссылка на оплату (E3) и письма (F) ещё не сделаны: заказ «по ссылке»
 * остаётся «Не оплачен» со сроком оплаты, кнопки ссылки и писем в CRM
 * неактивны «скоро».
 */

const { ObjectId } = mongoose.Types;
const EPS = 0.001;

const UNPAID = ['new', 'partial', 'confirm'];
const MANUAL_METHODS = ['transfer', 'bepaid', 'lava'];
const PAY_METHODS = [...MANUAL_METHODS, 'balance'];

const isId = (v) => mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(String(v));
const idOf = (v) => (v && v._id ? v._id : v);
const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const fmtMoney = (n, cur) => `${String(round2(n)).replace('.', ',')} ${cur || 'BYN'}`;
const bad = (message, status = 400) => new AppError('VALIDATION_ERROR', message, status);
const whoOf = (member) => (member && member.name) || 'Менеджер';

/* ------------------------------------------------------------------ *
 *                          СУММЫ И СТАТУС                             *
 * ------------------------------------------------------------------ */

function totalOf(order) {
  if (order.status === 'free') {return 0;}
  return Math.max(0, round2((Number(order.price) || 0) - (Number(order.discount) || 0)));
}

function paidOf(order) {
  return round2(
    (order.payments || []).filter((p) => !p.pending).reduce((t, p) => t + (Number(p.amount) || 0), 0)
  );
}

function pendingOf(order) {
  return round2(
    (order.payments || []).filter((p) => p.pending).reduce((t, p) => t + (Number(p.amount) || 0), 0)
  );
}

/** Сколько ещё можно внести (без переводов, которые ждут подтверждения). */
function leftOf(order) {
  return Math.max(0, round2(totalOf(order) - paidOf(order) - pendingOf(order)));
}

/** Статус по платежам. free / fake / refund не трогаем. */
function computeStatus(order) {
  if (['free', 'fake', 'refund'].includes(order.status)) {return order.status;}
  const t = totalOf(order);
  const pd = paidOf(order);
  const pend = pendingOf(order);
  if (t > 0 && pd >= t - EPS) {return 'paid';}
  if (pend > 0 && pd + pend >= t - EPS) {return 'confirm';}
  if (pd > 0) {return 'partial';}
  return 'new';
}

const isStoreOrder = (order) => Boolean(order.purchaseId) || STORE_SOURCES.includes(order.source);

function assertWritable(order) {
  if (isStoreOrder(order)) {
    throw bad(
      order.purchaseId && !STORE_SOURCES.includes(order.source)
        ? 'Заказ перенесён из админки: доступ ведёт админка, здесь можно только комментировать'
        : 'Заказ из App Store или Google Play: доступ ведёт стор, здесь можно только комментировать'
    );
  }
}

/** Позицию, цену и промокод можно менять только до первого платежа. */
function canEditItem(order) {
  return order.status === 'new' && !(order.payments || []).length;
}

/* ------------------------------------------------------------------ *
 *                              ПОМОЩНИКИ                              *
 * ------------------------------------------------------------------ */

function pushHistory(order, member, text, at = new Date()) {
  if (!Array.isArray(order.history)) {order.history = [];}
  order.history.push({ at, who: whoOf(member), text });
}

async function logEvent(clientId, order, member, text, type = 'order') {
  try {
    await CrmEvent.create({
      clientId: idOf(clientId),
      orderId: order ? order._id : null,
      who: whoOf(member),
      text,
      type,
    });
  } catch (err) {
    logger.warn('CRM event не записан', { message: err.message });
  }
}

async function applyAccess(order, member) {
  return access.applyOrder(order, { who: whoOf(member) });
}

/** Списать с баланса атомарно (BYN). Не хватает — ошибка с остатком. */
async function debitBalance(clientId, amount, { orderId, reason, member }) {
  const updated = await CrmClient.findOneAndUpdate(
    { _id: clientId, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true }
  );
  if (!updated) {
    const c = await CrmClient.findById(clientId).select('balance').lean();
    throw bad(`На балансе только ${fmtMoney(c ? c.balance : 0, 'BYN')}`);
  }
  try {
    await CrmBalanceOp.create({
      clientId,
      amount: -amount,
      reason,
      orderId,
      by: member ? member.id : null,
      at: new Date(),
    });
  } catch (err) {
    await CrmClient.updateOne({ _id: clientId }, { $inc: { balance: amount } });
    throw err;
  }
}

/** Зачислить на баланс (BYN) с операцией. */
async function creditBalance(clientId, amount, { orderId, reason, member }) {
  await CrmClient.updateOne({ _id: clientId }, { $inc: { balance: amount } });
  try {
    await CrmBalanceOp.create({
      clientId,
      amount,
      reason,
      orderId,
      by: member ? member.id : null,
      at: new Date(),
    });
  } catch (err) {
    await CrmClient.updateOne({ _id: clientId }, { $inc: { balance: -amount } });
    throw err;
  }
}

async function checkAccount(method, account) {
  if (method !== 'transfer') {return null;}
  const settings = (await getCrmSettings()) || {};
  const accounts = settings.accounts || [];
  if (!account) {throw bad('Укажите, на какую карту пришёл перевод');}
  if (!accounts.includes(account)) {
    throw bad(
      accounts.length
        ? 'Такой карты нет в настройках CRM'
        : 'Карты для переводов ещё не заданы в настройках CRM'
    );
  }
  return account;
}

/** Перевод ждёт подтверждения владелицы, если так включено в настройках. */
async function transferPending(method, member) {
  if (method !== 'transfer') {return false;}
  const settings = (await getCrmSettings()) || {};
  return Boolean(settings.requireTransferConfirm) && !can(member.role, 'confirm');
}

/** Промокод: проверка как promoCheck() прототипа, скидка как promoDisc(). */
async function checkPromo(code, product, price) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) {throw bad('Введите промокод');}
  const promo = await CrmPromo.findOne({ code: c }).lean();
  if (!promo) {throw bad('Промокод не найден');}
  if (!promo.active) {throw bad('Промокод выключен');}
  if (promo.until && new Date(promo.until) < new Date()) {throw bad('Срок промокода истёк');}
  if (promo.limit && promo.used >= promo.limit) {throw bad('Лимит использований исчерпан');}
  if (promo.scope && promo.scope !== 'all' && (!product || promo.scope !== product.cat)) {
    throw bad('Промокод не действует на этот продукт');
  }
  const p = Number(price) || 0;
  const discount = promo.type === '%' ? round2((p * promo.value) / 100) : Math.min(p, Number(promo.value) || 0);
  return { promo, code: c, discount: round2(discount) };
}

/** Занять одно использование промокода (атомарно, с учётом лимита). */
async function takePromo(promo) {
  const cond = { _id: promo._id };
  if (promo.limit) {cond.used = { $lt: promo.limit };}
  const r = await CrmPromo.findOneAndUpdate(cond, { $inc: { used: 1 } }, { new: true });
  if (!r) {throw bad('Лимит использований исчерпан');}
}

async function releasePromo(code) {
  if (!code) {return;}
  try {
    await CrmPromo.updateOne({ code, used: { $gt: 0 } }, { $inc: { used: -1 } });
  } catch (err) {
    logger.warn('CRM promo: не удалось вернуть использование', { message: err.message });
  }
}

/**
 * Клиентка по почте: найти или создать, и сразу связать с аккаунтом
 * приложения под той же почтой (как B5 при входе), если аккаунт есть и ещё
 * ни с кем не связан.
 */
async function ensureClientByEmail(email, { name = '', phone = null, member } = {}) {
  const e = String(email || '').trim().toLowerCase();
  let client = await CrmClient.findOne({
    mergedInto: null,
    $or: [{ 'emails.email': e }, { primaryEmail: e }],
  });
  let created = false;
  if (!client) {
    client = await CrmClient.create({
      name: name || '',
      emails: [{ email: e, source: 'manual' }],
      primaryEmail: e,
      phone: phone || null,
      phoneNorm: phone ? String(phone).replace(/\D/g, '') || null : null,
    });
    created = true;
    await logEvent(client._id, null, member, 'Клиентка заведена вручную при создании заказа', 'edit');
  }
  if (!client.appUserId) {
    const user = await User.findOne({ email: e, isDeleted: { $ne: true } }).select('_id email');
    if (user) {
      const other = await CrmClient.findOne({ appUserId: user._id, _id: { $ne: client._id } })
        .select('_id')
        .lean();
      if (!other) {
        await access.attachClient(client, user, { who: whoOf(member), how: 'по почте' });
      }
    }
  }
  return { client, created };
}

function grantText(product) {
  if (!product) {return 'Не связан с приложением';}
  const g = product.grant || {};
  switch (g.type) {
    case 'month': return 'Клуб: месяц оплаты';
    case 'months': return `Клуб: ${(g.months || []).join(', ') || 'месяцы сезона'}`;
    case 'year': return 'Клуб: 12 месяцев с месяца оплаты';
    case 'book': return `${(g.bookSlugs || []).length > 1 ? 'Разборы' : 'Разбор'}: ${(g.bookSlugs || []).join(', ')}`;
    case 'pack': return `Пакет: ${g.packageSlug || '—'}`;
    case 'tier2': return 'Тариф 2: зум в месяце оплаты (вне приложения)';
    case 'deposit':
      return g.deposit ? `Пополнение баланса на ${g.deposit} BYN` : 'Пополнение баланса на сумму оплаты';
    default: return 'Не связан с приложением';
  }
}

function productView(p) {
  return {
    id: String(p._id),
    name: p.name,
    price: p.price === null || p.price === undefined ? null : round2(p.price),
    cur: p.cur || 'BYN',
    cat: p.cat,
    grant: grantText(p),
    accessOnFirstPayment: Boolean(p.accessOnFirstPayment),
  };
}

async function loadProduct(id) {
  if (!isId(id)) {throw bad('Выберите позицию');}
  const product = await CrmProduct.findById(id).lean();
  if (!product || product.archivedAt) {throw bad('Позиция не найдена');}
  return product;
}

async function checkManager(id) {
  if (id === null || id === '') {return null;}
  if (!isId(id)) {throw bad('Неверный менеджер');}
  const m = await CrmMember.findById(id).select('name active').lean();
  if (!m || !m.active) {throw bad('Менеджер не найден');}
  return m;
}

function findPayment(order, pid) {
  const pays = order.payments || [];
  const i = pays.findIndex((p) => sameId(p._id, pid));
  if (i < 0) {throw new AppError('NOT_FOUND', 'Платёж не найден', 404);}
  return { pay: pays[i], index: i };
}

function payLine(p, cur) {
  const m = METHOD_LABEL[p.method] || p.method;
  return `${fmtMoney(p.amount, p.method === 'balance' ? 'BYN' : cur)} · ${m}${p.account ? ` → ${p.account}` : ''}${p.note ? ` (${p.note})` : ''}`;
}

/* ------------------------------------------------------------------ *
 *                           КАРТОЧКА (GET)                            *
 * ------------------------------------------------------------------ */

async function loadOrder(id) {
  if (!isId(id)) {throw new AppError('NOT_FOUND', 'Неверный id заказа', 400);}
  const order = await CrmOrder.findById(id);
  if (!order) {throw new AppError('NOT_FOUND', 'Заказ не найден', 404);}
  return order;
}

async function orderCard(order, now = new Date()) {
  const plain = typeof order.toObject === 'function' ? order.toObject() : order;
  const refs = await loadRefs([plain]);
  const row = orderRow(plain, refs, now);
  const productId = plain.productId ? String(idOf(plain.productId)) : null;
  const product = productId ? await CrmProduct.findById(productId).lean() : null;
  const client = await CrmClient.findById(idOf(plain.clientId)).select('name primaryEmail balance appUserId').lean();
  const gift = plain.gift || {};
  const recipient = gift.recipientClientId ? refs.clients.get(String(idOf(gift.recipientClientId))) : null;

  const comments = plain.comments || [];
  const names = await memberNames([
    ...comments.map((c) => c.memberId),
    ...(plain.payments || []).map((p) => p.by),
  ]);
  const store = isStoreOrder(plain);
  const st = plain.status;
  const paid = paidOf(plain);

  return {
    ...row,
    deadline: plain.deadline || null,
    promoCode: plain.promoCode || null,
    total: totalOf(plain),
    pending: pendingOf(plain),
    left: UNPAID.includes(st) ? Math.max(0, round2(totalOf(plain) - paid)) : 0,
    productId,
    productInfo: product ? productView(product) : null,
    client: client
      ? {
        id: String(client._id),
        name: client.name || '',
        email: client.primaryEmail || null,
        balance: round2(client.balance),
        linked: Boolean(client.appUserId),
      }
      : null,
    giftInfo:
      gift.email || gift.recipientClientId
        ? {
          name: gift.name || (recipient && recipient.name) || null,
          email: gift.email || (recipient && recipient.primaryEmail) || null,
          recipientId: gift.recipientClientId ? String(idOf(gift.recipientClientId)) : null,
          linked: Boolean(recipient && recipient.appUserId),
        }
        : null,
    payments: (plain.payments || []).map((p) => ({
      id: String(p._id),
      amount: round2(p.amount),
      cur: p.method === 'balance' ? 'BYN' : p.cur || plain.cur || 'BYN',
      method: p.method,
      methodLabel: METHOD_LABEL[p.method] || p.method,
      at: p.at,
      pending: Boolean(p.pending),
      account: p.account || null,
      note: p.note || null,
      by: (p.by && names.get(String(p.by))) || null,
    })),
    refund: plain.refund && plain.refund.at
      ? {
        amount: round2(plain.refund.amount),
        mode: plain.refund.mode,
        reason: plain.refund.reason,
        at: plain.refund.at,
      }
      : null,
    history: (plain.history || [])
      .slice()
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .map((h) => ({ at: h.at, who: h.who, text: h.text })),
    comments: comments
      .slice()
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .map((c) => commentView(c, names)),
    readOnly: store,
    actions: {
      pay: !store && ['new', 'partial'].includes(st) && leftOf(plain) > 0,
      editItem: !store && canEditItem(plain),
      editFields: !store,
      deletePayments: !store && UNPAID.concat('paid').includes(st),
      fake: !store && st === 'new' && !(plain.payments || []).length,
      restore: !store && st === 'fake',
      refund: !store && ['paid', 'partial'].includes(st) && paid > 0,
    },
  };
}

/** Справочники для форм: продукты, менеджеры, карты, подтверждение переводов. */
async function orderMeta() {
  const [products, managers, settings] = await Promise.all([
    CrmProduct.find({ active: true, archivedAt: null }).sort({ cat: 1, name: 1 }).lean(),
    CrmMember.find({ active: true, role: { $ne: 'marketing' } }).select('name role').lean(),
    getCrmSettings(),
  ]);
  const s = settings || {};
  return {
    products: (products || []).map(productView),
    managers: (managers || []).map((m) => ({ id: String(m._id), name: m.name })),
    accounts: s.accounts || [],
    requireTransferConfirm: Boolean(s.requireTransferConfirm),
  };
}

/* ------------------------------------------------------------------ *
 *                          ДЕЙСТВИЯ (D5)                              *
 * ------------------------------------------------------------------ */

/** Сохранить заказ и применить доступ. Статус уже пересчитан. */
async function saveAndApply(order, member) {
  await order.save();
  return applyAccess(order, member);
}

async function addPayment(order, body, member) {
  assertWritable(order);
  if (!['new', 'partial'].includes(order.status)) {
    throw bad(order.status === 'confirm'
      ? 'Вся сумма уже внесена, перевод ждёт подтверждения'
      : 'По этому заказу платежи больше не принимаются');
  }
  const amount = round2(body.amount);
  if (!(amount > 0)) {throw bad('Укажите сумму платежа');}
  const left = leftOf(order);
  if (amount > left + EPS) {throw bad(`Сумма больше остатка (${fmtMoney(left, order.cur)})`);}
  const cur = order.cur || 'BYN';
  if (body.cur && body.cur !== cur) {throw bad(`Платёж принимается в валюте заказа: ${cur}`);}
  const method = body.method;
  if (!PAY_METHODS.includes(method)) {throw bad('Выберите способ оплаты');}
  if (method === 'balance' && cur !== 'BYN') {throw bad('С баланса можно оплатить только заказ в BYN');}
  const account = await checkAccount(method, body.account || null);
  const pending = await transferPending(method, member);
  const note = body.note ? String(body.note).trim() || null : null;

  if (method === 'balance') {
    await debitBalance(idOf(order.clientId), amount, {
      orderId: order._id,
      reason: `Оплата заказа №${order.num}`,
      member,
    });
  }
  const pay = {
    _id: new ObjectId(),
    amount,
    cur,
    method,
    at: new Date(),
    pending,
    account,
    note,
    extId: null,
    by: member.id,
  };
  const before = { status: order.status };
  order.payments.push(pay);
  pushHistory(
    order,
    member,
    `${pending ? 'Перевод' : 'Платёж'} ${payLine(pay, cur)}${pending ? ': ждёт подтверждения Анны' : ''}`
  );
  order.status = computeStatus(order);
  try {
    await order.save();
  } catch (err) {
    if (method === 'balance') {
      await creditBalance(idOf(order.clientId), amount, {
        orderId: order._id,
        reason: `Отмена оплаты заказа №${order.num}`,
        member,
      });
    }
    throw err;
  }
  const result = await applyAccess(order, member);
  await logEvent(order.clientId, order, member,
    `Заказ №${order.num}: ${pending ? 'перевод' : 'платёж'} ${fmtMoney(amount, cur)}${pending ? ', ждёт подтверждения' : ''}`);
  return { order, payment: pay, before, access: result };
}

async function confirmPayment(order, pid, member) {
  assertWritable(order);
  if (['fake', 'refund'].includes(order.status)) {throw bad('Заказ закрыт');}
  const { pay } = findPayment(order, pid);
  if (!pay.pending) {throw bad('Этот платёж уже подтверждён');}
  const before = { status: order.status };
  pay.pending = false;
  if (typeof order.markModified === 'function') {order.markModified('payments');}
  pushHistory(order, member, `Перевод ${fmtMoney(pay.amount, order.cur)} подтверждён: деньги пришли`);
  order.status = computeStatus(order);
  const result = await saveAndApply(order, member);
  await logEvent(order.clientId, order, member,
    `Заказ №${order.num}: перевод ${fmtMoney(pay.amount, order.cur)} подтверждён`);
  return { order, before, access: result };
}

async function deletePayment(order, pid, reason, member) {
  assertWritable(order);
  if (!UNPAID.concat('paid').includes(order.status)) {
    throw bad('Платёж можно удалить только у заказа в работе');
  }
  const why = String(reason || '').trim();
  if (why.length < 2) {throw bad('Укажите причину удаления платежа');}
  const { pay, index } = findPayment(order, pid);
  const before = { status: order.status, payment: { ...((pay.toObject && pay.toObject()) || pay) } };
  order.payments.splice(index, 1);
  pushHistory(order, member, `Платёж удалён: ${payLine(pay, order.cur)}. Причина: ${why}`);
  order.status = computeStatus(order);
  await order.save();
  if (pay.method === 'balance') {
    await creditBalance(idOf(order.clientId), round2(pay.amount), {
      orderId: order._id,
      reason: `Возврат на баланс: удалён платёж заказа №${order.num}`,
      member,
    });
  }
  const result = await applyAccess(order, member);
  await logEvent(order.clientId, order, member,
    `Заказ №${order.num}: удалён платёж ${fmtMoney(pay.amount, order.cur)} · ${why}`);
  return { order, before, access: result };
}

/** «Изменить заказ»: позиция и цена (до первого платежа), заметка, менеджер, срок. */
async function editOrder(order, body, member) {
  assertWritable(order);
  const before = {};
  const after = {};
  const lines = [];

  const itemChange = body.productId !== undefined || body.price !== undefined;
  if (itemChange && !canEditItem(order)) {
    throw bad('Позицию и цену нельзя менять после первого платежа');
  }
  if (body.productId !== undefined && !sameId(order.productId, body.productId)) {
    const product = await loadProduct(body.productId);
    before.productId = order.productId ? String(idOf(order.productId)) : null;
    order.productId = product._id;
    order.productTitle = null;
    order.cur = product.cur || 'BYN';
    if (body.price === undefined) {order.price = round2(product.price || 0);}
    after.productId = String(product._id);
    lines.push(`Позиция изменена: ${product.name}`);
  }
  if (body.price !== undefined && round2(body.price) !== round2(order.price)) {
    const price = round2(body.price);
    if (!(price >= 0)) {throw bad('Цена должна быть числом');}
    before.price = round2(order.price);
    lines.push(`Цена изменена: ${fmtMoney(order.price, order.cur)} → ${fmtMoney(price, order.cur)}`);
    order.price = price;
    after.price = price;
  }
  if (lines.length && order.promoCode) {
    // Скидка считалась от старой позиции/цены — промокод снимаем.
    await releasePromo(order.promoCode);
    lines.push(`Промокод ${order.promoCode} снят: изменились позиция или цена`);
    before.promoCode = order.promoCode;
    order.promoCode = null;
    order.discount = 0;
    after.promoCode = null;
  }

  if (body.note !== undefined) {
    const note = body.note ? String(body.note).trim() || null : null;
    if ((order.note || null) !== note) {
      before.note = order.note || null;
      order.note = note;
      after.note = note;
      lines.push(note ? `Заметка: ${note}` : 'Заметка удалена');
    }
  }
  if (body.managerId !== undefined && !sameId(order.managerId, body.managerId || null)) {
    const m = await checkManager(body.managerId);
    before.managerId = order.managerId ? String(idOf(order.managerId)) : null;
    order.managerId = m ? m._id : null;
    after.managerId = m ? String(m._id) : null;
    lines.push(`Менеджер: ${m ? m.name : 'не назначен'}`);
  }
  if (body.deadline !== undefined) {
    const d = body.deadline ? new Date(body.deadline) : null;
    if (d && Number.isNaN(d.getTime())) {throw bad('Неверная дата срока оплаты');}
    const prev = order.deadline ? new Date(order.deadline).getTime() : null;
    if ((d ? d.getTime() : null) !== prev) {
      before.deadline = order.deadline || null;
      order.deadline = d;
      after.deadline = d;
      lines.push(d ? `Срок оплаты: ${d.toISOString().slice(0, 10)}` : 'Срок оплаты снят');
    }
  }

  if (lines.length) {
    const at = new Date();
    lines.forEach((t) => pushHistory(order, member, t, at));
    order.status = computeStatus(order);
    await order.save();
    await logEvent(order.clientId, order, member, `Заказ №${order.num} изменён: ${lines.join('; ')}`);
  }
  return { order, before, after };
}

async function applyPromoToOrder(order, code, member) {
  assertWritable(order);
  if (!canEditItem(order)) {throw bad('Промокод можно применить только до первого платежа');}
  const product = order.productId ? await CrmProduct.findById(idOf(order.productId)).lean() : null;
  const res = await checkPromo(code, product, order.price);
  if (order.promoCode === res.code) {throw bad('Этот промокод уже применён');}
  await takePromo(res.promo);
  const prevCode = order.promoCode || null;
  if (prevCode) {await releasePromo(prevCode);}
  const before = { promoCode: prevCode, discount: round2(order.discount) };
  order.promoCode = res.code;
  order.discount = res.discount;
  pushHistory(order, member, `Применён промокод ${res.code} (−${fmtMoney(res.discount, order.cur)})`);
  try {
    await order.save();
  } catch (err) {
    await releasePromo(res.code);
    throw err;
  }
  return { order, before, after: { promoCode: res.code, discount: res.discount } };
}

async function markFake(order, confirm, member) {
  assertWritable(order);
  if (confirm !== true) {throw bad('Подтвердите, что заказ ложный');}
  if (order.status !== 'new' || (order.payments || []).length) {
    throw bad('Ложным можно пометить только неоплаченный заказ без платежей');
  }
  order.status = 'fake';
  pushHistory(order, member, 'Помечен как ложный');
  await order.save();
  const result = await applyAccess(order, member);
  await logEvent(order.clientId, order, member, `Заказ №${order.num} помечен как ложный`);
  return { order, access: result };
}

async function restoreOrder(order, member) {
  assertWritable(order);
  if (order.status !== 'fake') {throw bad('Вернуть в работу можно только ложный заказ');}
  order.status = 'new';
  order.status = computeStatus(order);
  pushHistory(order, member, 'Возвращён в работу');
  const result = await saveAndApply(order, member);
  await logEvent(order.clientId, order, member, `Заказ №${order.num} возвращён в работу`);
  return { order, access: result };
}

/**
 * Возврат деньгами или перезачёт на баланс (только BYN). Доступ снимает
 * access.applyOrder — ровно order.granted; перезачёт кладёт сумму на баланс
 * плательщицы (атомарно, с CrmBalanceOp).
 */
async function refundOrder(order, body, member) {
  assertWritable(order);
  if (!['paid', 'partial'].includes(order.status)) {
    throw bad('Возврат оформляется по оплаченному заказу');
  }
  const paid = paidOf(order);
  const amount = round2(body.amount);
  if (!(amount > 0) || amount > paid + EPS) {
    throw bad(`Сумма возврата: от 0 до ${fmtMoney(paid, order.cur)}`);
  }
  const mode = body.mode;
  if (!['money', 'balance'].includes(mode)) {throw bad('Выберите: вернуть деньги или перезачесть на баланс');}
  if (mode === 'balance' && (order.cur || 'BYN') !== 'BYN') {
    throw bad('Перезачесть на баланс можно только заказ в BYN');
  }
  const reason = String(body.reason || '').trim();
  if (reason.length < 2) {throw bad('Укажите причину возврата');}

  const before = { status: order.status, granted: order.granted ? { ...(order.granted.toObject ? order.granted.toObject() : order.granted) } : null };
  const label = mode === 'balance' ? 'Перезачёт на баланс' : 'Возврат денег';
  order.status = 'refund';
  order.refund = { amount, mode, reason, at: new Date(), by: member.id };
  pushHistory(order, member, `${label} ${fmtMoney(amount, order.cur)}: ${reason}`);
  // applyOrder снимает выданное и сохраняет заказ; если выдано не было — сохраняем сами.
  const result = await applyAccess(order, member);
  await order.save();
  if (mode === 'balance') {
    await creditBalance(idOf(order.clientId), amount, {
      orderId: order._id,
      reason: `Перезачёт заказа №${order.num}: ${reason}`,
      member,
    });
  }
  await logEvent(order.clientId, order, member,
    `Заказ №${order.num}: ${label.toLowerCase()} ${fmtMoney(amount, order.cur)} · ${reason}`,
    mode === 'balance' ? 'balance' : 'order');
  return { order, before, access: result };
}

async function addOrderComment(order, text, member) {
  const comment = { _id: new ObjectId(), memberId: member.id, at: new Date(), text };
  await CrmOrder.updateOne({ _id: order._id }, { $push: { comments: comment } });
  const names = new Map([[String(member.id), member.name]]);
  return commentView(comment, names);
}

/* ------------------------------------------------------------------ *
 *                          НОВЫЙ ЗАКАЗ (D6)                           *
 * ------------------------------------------------------------------ */

/**
 * body: { clientId | client: {name, email, phone}, productId, price, cur,
 *         promoCode, managerId, gift: {name, email},
 *         mode: link | paid_manual | balance | free,
 *         days (link), method/account/note (paid_manual), reason (free) }
 */
async function createOrder(body, member, now = new Date()) {
  const mode = body.mode;
  if (!['link', 'paid_manual', 'balance', 'free'].includes(mode)) {throw bad('Выберите, как оплачивает');}

  // Клиентка
  let client;
  if (body.clientId) {
    if (!isId(body.clientId)) {throw bad('Выберите клиентку');}
    client = await CrmClient.findById(body.clientId);
    if (!client) {throw bad('Клиентка не найдена');}
    if (client.mergedInto) {throw bad('Клиентка объединена с другой карточкой, выберите её');}
  } else if (body.client && body.client.email) {
    ({ client } = await ensureClientByEmail(body.client.email, {
      name: body.client.name,
      phone: body.client.phone,
      member,
    }));
  } else {
    throw bad('Выберите клиентку или укажите почту новой');
  }

  const product = await loadProduct(body.productId);
  if (!product.active) {throw bad('Эта позиция не продаётся');}

  // Цена, валюта, промокод
  const free = mode === 'free';
  let price = 0;
  let cur = body.cur || product.cur || 'BYN';
  let promo = null;
  let discount = 0;
  if (!free) {
    price = round2(body.price !== undefined && body.price !== null && body.price !== '' ? body.price : product.price);
    if (!(price > 0)) {throw bad('Укажите сумму');}
    if (body.promoCode) {
      promo = await checkPromo(body.promoCode, product, price);
      discount = promo.discount;
    }
    if (!(price - discount > 0)) {throw bad('Итог 0: оформите как «Без оплаты» с причиной');}
  } else {
    cur = product.cur || 'BYN';
  }
  const total = round2(price - discount);

  // Способ
  const reason = String(body.reason || '').trim();
  if (free && reason.length < 2) {throw bad('Укажите причину выдачи без оплаты');}
  let method = null;
  let account = null;
  let pending = false;
  if (mode === 'paid_manual') {
    method = body.method;
    if (!MANUAL_METHODS.includes(method)) {throw bad('Выберите способ оплаты');}
    account = await checkAccount(method, body.account || null);
    pending = await transferPending(method, member);
  }
  if (mode === 'balance') {
    if (cur !== 'BYN') {throw bad('С баланса: только в BYN');}
    method = 'balance';
    const bal = round2(client.balance);
    if (total > bal + EPS) {throw bad(`На балансе только ${fmtMoney(bal, 'BYN')}`);}
  }
  let deadline = null;
  if (mode === 'link') {
    const days = Math.max(1, Math.min(30, parseInt(body.days, 10) || 3));
    deadline = new Date(now.getTime() + days * 864e5);
  }

  // Менеджер: по умолчанию тот, кто создаёт заказ
  let managerId = member.id;
  if (body.managerId !== undefined) {
    const m = await checkManager(body.managerId);
    managerId = m ? m._id : null;
  }

  // Подарок: получательница заводится по почте, доступ получит она
  let gift = { name: null, email: null, recipientClientId: null };
  if (body.gift && body.gift.email) {
    const email = String(body.gift.email).trim().toLowerCase();
    const { client: recipient } = await ensureClientByEmail(email, { name: body.gift.name, member });
    if (sameId(recipient._id, client._id)) {throw bad('Почта получательницы совпадает с почтой клиентки');}
    gift = { name: (body.gift.name && String(body.gift.name).trim()) || null, email, recipientClientId: recipient._id };
  }

  const orderId = new ObjectId();
  const who = whoOf(member);
  const history = [{ at: now, who, text: 'Заказ создан вручную' }];
  const payments = [];
  if (promo) {history.push({ at: now, who, text: `Применён промокод ${promo.code} (−${fmtMoney(discount, cur)})` });}
  if (mode === 'link') {
    history.push({ at: now, who, text: `Счёт по ссылке, срок оплаты ${deadline.toISOString().slice(0, 10)}` });
  }
  if (method) {
    const pay = {
      _id: new ObjectId(), amount: total, cur, method, at: now, pending, account,
      note: body.note ? String(body.note).trim() || null : null, extId: null, by: member.id,
    };
    payments.push(pay);
    history.push({
      at: now,
      who,
      text: method === 'balance'
        ? `Оплачено с баланса ${fmtMoney(total, 'BYN')}`
        : `${pending ? 'Перевод' : 'Платёж'} ${payLine(pay, cur)}${pending ? ': ждёт подтверждения Анны' : ''}`,
    });
  }
  if (free) {history.push({ at: now, who, text: `Выдано без оплаты: ${reason}` });}
  if (gift.email) {
    history.push({ at: now, who, text: `Подарок для ${gift.name || gift.email}: доступ получит она` });
  }

  const doc = {
    _id: orderId,
    clientId: client._id,
    productId: product._id,
    price,
    cur,
    discount,
    promoCode: promo ? promo.code : null,
    status: free ? 'free' : 'new',
    source: 'manual',
    managerId,
    deadline,
    gift,
    note: free ? reason : null,
    payments,
    history,
  };
  doc.status = computeStatus(doc);

  // Сначала то, что может не пройти: промокод и баланс (атомарно), потом заказ.
  if (promo) {await takePromo(promo.promo);}
  const num = await CrmCounter.nextOrderNum();
  if (mode === 'balance') {
    try {
      await debitBalance(client._id, total, { orderId, reason: `Оплата заказа №${num}`, member });
    } catch (err) {
      if (promo) {await releasePromo(promo.code);}
      throw err;
    }
  }
  let order;
  try {
    order = await CrmOrder.create({ ...doc, num });
  } catch (err) {
    if (mode === 'balance') {
      await creditBalance(client._id, total, { orderId, reason: `Отмена заказа №${num}`, member });
    }
    if (promo) {await releasePromo(promo.code);}
    throw err;
  }

  const result = await applyAccess(order, member);
  await logEvent(client._id, order, member,
    `Заказ №${num} создан: ${product.name}${free ? `, без оплаты (${reason})` : `, ${fmtMoney(total, cur)}`}`);
  if (gift.recipientClientId) {
    await logEvent(gift.recipientClientId, order, member,
      `Подарок от ${client.name || client.primaryEmail || 'клиентки'}: заказ №${num}, ${product.name}`);
  }
  return { order, access: result };
}

module.exports = {
  UNPAID,
  MANUAL_METHODS,
  totalOf,
  paidOf,
  pendingOf,
  leftOf,
  computeStatus,
  isStoreOrder,
  canEditItem,
  grantText,
  loadOrder,
  orderCard,
  orderMeta,
  addPayment,
  confirmPayment,
  deletePayment,
  editOrder,
  applyPromoToOrder,
  markFake,
  restoreOrder,
  refundOrder,
  addOrderComment,
  createOrder,
  ensureClientByEmail,
};
