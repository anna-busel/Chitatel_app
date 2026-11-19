const mongoose = require('mongoose');
const logger = require('../../config/logger');
const { AppError } = require('../../middleware/error');
const CrmClient = require('../models/CrmClient');
const CrmOrder = require('../models/CrmOrder');
const CrmBalanceOp = require('../models/CrmBalanceOp');
const CrmEvent = require('../models/CrmEvent');
const CrmTask = require('../models/CrmTask');
const CrmSalesCard = require('../models/CrmSalesCard');
const CrmThread = require('../models/CrmThread');
const CrmTgRequest = require('../models/CrmTgRequest');
const CrmSend = require('../models/CrmSend');
const CrmMerge = require('../models/CrmMerge');
const { applyClientOrders, undoGrant } = require('./access.service');
const { round2 } = require('./view.helpers');

/**
 * Дубли клиенток и объединение (CRM-PLAN D3).
 *
 * Дубли — карточки (без mergedInto) с одинаковым phoneNorm (от 7 цифр) или
 * общей почтой (emails.email / primaryEmail). Группа — связная компонента:
 * А и Б с одним телефоном, Б и В с одной почтой — одна группа из трёх.
 *
 * merge(fromId, intoId): карточка fromId вливается в intoId и скрывается
 * (mergedInto = intoId; списки, поиск по почте и привязка B5 её уже не видят).
 *   - заказы (clientId, получательница подарка, снимок выдачи), операции
 *     баланса, история, задачи, план продаж, треды, заявки в каналы,
 *     письма — переносятся на intoId;
 *   - баланс — атомарно: у fromId обнуляется, intoId получает $inc;
 *   - теги — объединяются, комментарии — дописываются, почты fromId — в
 *     emails intoId со своим источником;
 *   - телефон, Telegram, город и прочие контакты — только если у intoId пусто;
 *   - аккаунт приложения: у обеих разные — отказ (связь молча не теряем);
 *     только у fromId — связь переходит на intoId; после объединения
 *     applyClientOrders выдаёт оплаченное, что ещё не выдано (B5/B6).
 * Снимок (CrmMerge) позволяет «Отменить» в течение 30 минут, если
 * перенесённые заказы не менялись и баланс не потрачен.
 */

const UNDO_MS = 30 * 60 * 1000;
const PHONE_MIN = 7;

// Коллекции, где клиентка — поле clientId (кроме заказов).
const LINKED = [
  ['balanceOps', CrmBalanceOp],
  ['events', CrmEvent],
  ['tasks', CrmTask],
  ['salesCards', CrmSalesCard],
  ['threads', CrmThread],
  ['tgRequests', CrmTgRequest],
  ['sends', CrmSend],
];
// Поля заказа, где может стоять клиентка.
const ORDER_FIELDS = [
  ['orders', 'clientId'],
  ['giftOrders', 'gift.recipientClientId'],
  ['grantOrders', 'granted.subscriptionSet.clientId'],
];

const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
const isId = (v) => mongoose.Types.ObjectId.isValid(v) && /^[a-f0-9]{24}$/i.test(String(v));
const normEmail = (e) => (typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null);

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function phoneKey(c) {
  const digits = c.phoneNorm || (c.phone ? String(c.phone).replace(/\D/g, '') : '');
  return digits && digits.length >= PHONE_MIN ? digits : null;
}

function emailsOf(c) {
  const list = (c.emails || []).map((e) => normEmail(e && e.email)).filter(Boolean);
  const primary = normEmail(c.primaryEmail);
  if (primary) {list.push(primary);}
  return [...new Set(list)];
}

const mainEmail = (c) => normEmail(c.primaryEmail) || emailsOf(c)[0] || null;
const label = (c) => `«${c.name || mainEmail(c) || 'без имени'}»${mainEmail(c) && c.name ? ` (${mainEmail(c)})` : ''}`;

function badId(id) {
  if (!isId(id)) {throw new AppError('NOT_FOUND', 'Неверный id клиентки', 400);}
}

async function orderCounts(ids) {
  if (!ids.length) {return new Map();}
  const orders = await CrmOrder.find({ clientId: { $in: ids } }).select('clientId').lean();
  const map = new Map();
  (orders || []).forEach((o) => map.set(String(o.clientId), (map.get(String(o.clientId)) || 0) + 1));
  return map;
}

function summary(c, counts) {
  return {
    id: String(c._id),
    name: c.name || '',
    email: mainEmail(c),
    emails: emailsOf(c),
    phone: c.phone || null,
    telegram: c.telegram && c.telegram.username ? `@${String(c.telegram.username).replace(/^@/, '')}` : null,
    city: c.city || null,
    linked: Boolean(c.appUserId),
    balance: round2(c.balance),
    orders: counts.get(String(c._id)) || 0,
    tags: c.tags || [],
    since: c.since || c.createdAt || null,
  };
}

/* ------------------------------------------------------------------ *
 *                               ПОИСК                                 *
 * ------------------------------------------------------------------ */

/**
 * Все группы дублей. → { items: [{ key, reasons, clients }], total, page, limit }
 * reasons: [{ type: 'phone'|'email', value }].
 */
async function findDuplicates({ page = 1, limit = 20 } = {}) {
  const docs = await CrmClient.find({ mergedInto: null })
    .select('_id phone phoneNorm primaryEmail emails.email')
    .lean();

  // Union-find по id: общий ключ (телефон или почта) склеивает карточки.
  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) {r = parent.get(r);}
    let y = x;
    while (parent.get(y) !== r) {
      const n = parent.get(y);
      parent.set(y, r);
      y = n;
    }
    return r;
  };
  const byKey = new Map();
  (docs || []).forEach((d) => {
    const id = String(d._id);
    parent.set(id, id);
    const keys = [];
    const ph = phoneKey(d);
    if (ph) {keys.push(`phone:${ph}`);}
    emailsOf(d).forEach((e) => keys.push(`email:${e}`));
    keys.forEach((k) => {
      if (!byKey.has(k)) {byKey.set(k, []);}
      byKey.get(k).push(id);
    });
  });
  const shared = [...byKey.entries()].filter(([, ids]) => ids.length > 1);
  shared.forEach(([, ids]) => ids.slice(1).forEach((id) => {
    const a = find(ids[0]);
    const b = find(id);
    if (a !== b) {parent.set(b, a);}
  }));

  const groups = new Map();
  shared.forEach(([key, ids]) => {
    const root = find(ids[0]);
    if (!groups.has(root)) {groups.set(root, { ids: new Set(), reasons: [] });}
    const g = groups.get(root);
    ids.forEach((id) => g.ids.add(id));
    const i = key.indexOf(':');
    g.reasons.push({ type: key.slice(0, i), value: key.slice(i + 1) });
  });

  // Новые дубли сверху (больший ObjectId — позже создана).
  const list = [...groups.values()]
    .map((g) => ({ ids: [...g.ids].sort(), reasons: g.reasons }))
    .sort((a, b) => (a.ids[a.ids.length - 1] < b.ids[b.ids.length - 1] ? 1 : -1));

  const total = list.length;
  const pageItems = list.slice((page - 1) * limit, page * limit);
  const allIds = pageItems.flatMap((g) => g.ids);
  const [clients, counts] = allIds.length
    ? await Promise.all([CrmClient.find({ _id: { $in: allIds } }).lean(), orderCounts(allIds)])
    : [[], new Map()];
  const byId = new Map((clients || []).map((c) => [String(c._id), c]));

  return {
    items: pageItems.map((g) => ({
      key: g.ids.join('-'),
      reasons: g.reasons,
      clients: g.ids.filter((id) => byId.has(id)).map((id) => summary(byId.get(id), counts)),
    })),
    total,
    page,
    limit,
  };
}

/** Возможные дубли одной карточки (прямые совпадения). → { items: [{…, reasons}] } */
async function duplicatesOf(clientId) {
  badId(clientId);
  const client = await CrmClient.findById(clientId).lean();
  if (!client) {throw new AppError('NOT_FOUND', 'Клиентка не найдена', 404);}
  if (client.mergedInto) {return { items: [], mergedInto: String(client.mergedInto) };}

  const ph = phoneKey(client);
  const emails = emailsOf(client);
  const or = [];
  if (ph) {or.push({ phoneNorm: ph });}
  if (emails.length) {
    or.push({ 'emails.email': { $in: emails } }, { primaryEmail: { $in: emails } });
  }
  if (!or.length) {return { items: [], mergedInto: null };}

  const found = await CrmClient.find({ _id: { $ne: client._id }, mergedInto: null, $or: or }).limit(20).lean();
  const counts = await orderCounts((found || []).map((c) => c._id));
  return {
    mergedInto: null,
    items: (found || []).map((c) => {
      const reasons = [];
      if (ph && phoneKey(c) === ph) {reasons.push('phone');}
      if (emailsOf(c).some((e) => emails.includes(e))) {reasons.push('email');}
      return { ...summary(c, counts), reasons };
    }),
  };
}

/* ------------------------------------------------------------------ *
 *                             ОБЪЕДИНЕНИЕ                             *
 * ------------------------------------------------------------------ */

async function logEvent(clientId, who, text) {
  try {
    await CrmEvent.create({ clientId, who, text, type: 'merge' });
  } catch (err) {
    logger.warn('CRM event не записан', { message: err.message });
  }
}

const idsOf = async (Model, filter) =>
  ((await Model.find(filter).select('_id').lean()) || []).map((d) => d._id);

/**
 * Влить карточку fromId в intoId.
 * → { mergeId, fromId, intoId, moved: {orders, balanceOps, …}, balance, linkMoved, applied }
 */
async function merge(fromId, intoId, member = {}) {
  badId(fromId);
  badId(intoId);
  if (String(fromId) === String(intoId)) {
    throw new AppError('VALIDATION_ERROR', 'Нельзя объединить карточку саму с собой', 400);
  }
  const who = member.name || 'Менеджер';
  const [from, into] = await Promise.all([
    CrmClient.findById(fromId).lean(),
    CrmClient.findById(intoId).lean(),
  ]);
  if (!from || !into) {throw new AppError('NOT_FOUND', 'Клиентка не найдена', 404);}
  if (from.mergedInto || into.mergedInto) {
    throw new AppError('VALIDATION_ERROR', 'Эта карточка уже объединена с другой. Обновите страницу.', 409);
  }
  if (from.appUserId && into.appUserId && !sameId(from.appUserId, into.appUserId)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'У обеих карточек свои аккаунты в приложении. Объединить нельзя: сначала отвяжите лишний аккаунт в одной из карточек.',
      409
    );
  }

  // Захват карточки: одна операция ставит mergedInto, снимает связь и
  // обнуляет баланс. Вернувшийся документ — состояние до захвата (баланс
  // ровно тот, что обнулён).
  const src = await CrmClient.findOneAndUpdate(
    { _id: from._id, mergedInto: null },
    { $set: { mergedInto: into._id, appUserId: null, balance: 0 } },
    { new: false }
  ).lean();
  if (!src) {
    throw new AppError('VALIDATION_ERROR', 'Карточка уже изменилась. Обновите страницу.', 409);
  }
  if (src.appUserId && into.appUserId && !sameId(src.appUserId, into.appUserId)) {
    // Связали между проверкой и захватом — возвращаем как было.
    await CrmClient.updateOne(
      { _id: src._id },
      { $set: { mergedInto: null, appUserId: src.appUserId }, $inc: { balance: src.balance || 0 } }
    );
    throw new AppError('VALIDATION_ERROR', 'У обеих карточек свои аккаунты в приложении. Объединить нельзя.', 409);
  }

  // 1. Перенос документов (id запоминаем для отмены).
  const moved = { fromAppUserId: src.appUserId || null };
  const orderStatus = {};
  for (const [key, field] of ORDER_FIELDS) {
    const docs = (await CrmOrder.find({ [field]: src._id }).select('_id status').lean()) || [];
    moved[key] = docs.map((d) => d._id);
    docs.forEach((d) => { orderStatus[String(d._id)] = d.status || null; });
    if (docs.length) {
      await CrmOrder.updateMany({ _id: { $in: moved[key] } }, { $set: { [field]: into._id } });
    }
  }
  for (const [key, Model] of LINKED) {
    moved[key] = await idsOf(Model, { clientId: src._id });
    if (moved[key].length) {
      await Model.updateMany({ _id: { $in: moved[key] } }, { $set: { clientId: into._id } });
    }
  }

  // 2. Карточка intoId: контакты в пустые поля, теги, почты, комментарии, баланс.
  const set = {};
  const filled = {};
  const fill = (path, value) => {
    set[path] = value;
    const prev = getPath(into, path);
    filled[path] = { prev: prev === undefined ? null : prev, value };
  };
  if (!into.name && src.name) {fill('name', src.name);}
  if (!into.phone && src.phone) {
    fill('phone', src.phone);
    fill('phoneNorm', src.phoneNorm || String(src.phone).replace(/\D/g, '') || null);
  }
  if (!into.primaryEmail && src.primaryEmail) {fill('primaryEmail', src.primaryEmail);}
  ['city', 'country', 'legacyNote', 'gkId', 'marketingOptOut'].forEach((k) => {
    if (!into[k] && src[k]) {fill(k, src[k]);}
  });
  if (!into.whatsapp && src.whatsapp) {fill('whatsapp', true);}
  const tg = into.telegram || {};
  const stg = src.telegram || {};
  if (!tg.username && stg.username) {fill('telegram.username', stg.username);}
  if (!tg.chatId && stg.chatId) {
    fill('telegram.chatId', stg.chatId);
    fill('telegram.botSubscribed', Boolean(stg.botSubscribed));
  }
  let linkMovedUserId = null;
  if (src.appUserId && !into.appUserId) {
    set.appUserId = src.appUserId;
    linkMovedUserId = src.appUserId;
  }

  const haveEmails = new Set(emailsOf(into));
  const addEmails = [];
  (src.emails || []).forEach((e) => {
    const email = normEmail(e && e.email);
    if (email && !haveEmails.has(email)) {
      haveEmails.add(email);
      addEmails.push({ email, source: e.source || 'manual' });
    }
  });
  const srcPrimary = normEmail(src.primaryEmail);
  if (srcPrimary && !haveEmails.has(srcPrimary)) {addEmails.push({ email: srcPrimary, source: 'manual' });}

  const intoTags = new Set(into.tags || []);
  const addTags = [...new Set((src.tags || []).filter((t) => !intoTags.has(t)))];
  const intoMonths = new Set(into.legacyMonths || []);
  const addMonths = [...new Set((src.legacyMonths || []).filter((m) => !intoMonths.has(m)))];
  const addComments = (src.comments || []).filter((c) => c && c._id);
  const balance = round2(src.balance);

  const update = {};
  if (Object.keys(set).length) {update.$set = set;}
  const addToSet = {};
  if (addTags.length) {addToSet.tags = { $each: addTags };}
  if (addMonths.length) {addToSet.legacyMonths = { $each: addMonths };}
  if (Object.keys(addToSet).length) {update.$addToSet = addToSet;}
  const push = {};
  if (addEmails.length) {push.emails = { $each: addEmails };}
  if (addComments.length) {push.comments = { $each: addComments };}
  if (Object.keys(push).length) {update.$push = push;}
  if (balance) {update.$inc = { balance };}
  if (Object.keys(update).length) {
    await CrmClient.updateOne({ _id: into._id }, update);
  }

  // 3. Доступ: если карточка intoId связана с приложением — выдать то,
  //    что оплачено и ещё не выдано (перенесённые заказы и, при переносе
  //    связи, её собственные). Логика выдачи — access.service (B5/B6).
  let applied = 0;
  let grantedOrderIds = [];
  if (into.appUserId || linkMovedUserId) {
    const pending = await idsOf(CrmOrder, {
      'granted.at': null,
      $or: [{ clientId: into._id }, { 'gift.recipientClientId': into._id }],
    });
    try {
      applied = await applyClientOrders(into._id, { who });
    } catch (err) {
      logger.error('CRM merge: заказы не применены', { intoId: String(into._id), message: err.message });
    }
    if (pending.length) {
      grantedOrderIds = await idsOf(CrmOrder, { _id: { $in: pending }, 'granted.at': { $ne: null } });
    }
  }

  // 4. Снимок для отмены.
  let mergeId = null;
  try {
    const m = await CrmMerge.create({
      fromId: src._id,
      intoId: into._id,
      by: isId(member.id) ? member.id : null,
      at: new Date(),
      balance,
      moved,
      added: {
        tags: addTags,
        emails: addEmails.map((e) => e.email),
        legacyMonths: addMonths,
        commentIds: addComments.map((c) => c._id),
      },
      filled,
      linkMovedUserId,
      grantedOrderIds,
      orderStatus,
    });
    mergeId = String(m._id);
  } catch (err) {
    logger.error('CRM merge: снимок не сохранён, отмена недоступна', { message: err.message });
  }

  const nOrders = new Set([...moved.orders, ...moved.giftOrders].map(String)).size;
  const parts = [`Перенесено заказов: ${nOrders}`];
  if (balance) {parts.push(`баланс ${balance} BYN`);}
  if (addEmails.length) {parts.push(`почты: ${addEmails.map((e) => e.email).join(', ')}`);}
  if (linkMovedUserId) {parts.push('связь с приложением перенесена');}
  if (applied) {parts.push(`открыто заказов в приложении: ${applied}`);}
  await logEvent(into._id, who, `Объединена с дублем ${label(src)}. ${parts.join(', ')}`);
  await logEvent(src._id, who, `Объединена с карточкой ${label(into)} и скрыта из списков`);

  const counts = {};
  Object.keys(moved).forEach((k) => {
    if (Array.isArray(moved[k])) {counts[k] = moved[k].length;}
  });
  counts.orders = nOrders;
  return {
    mergeId,
    fromId: String(src._id),
    intoId: String(into._id),
    moved: counts,
    balance,
    emails: addEmails.map((e) => e.email),
    linkMoved: Boolean(linkMovedUserId),
    applied,
  };
}

/* ------------------------------------------------------------------ *
 *                               ОТМЕНА                                *
 * ------------------------------------------------------------------ */

const conflict = (msg) => new AppError('VALIDATION_ERROR', msg, 409);

async function undoMerge(mergeId, member = {}, now = new Date()) {
  if (!isId(mergeId)) {throw new AppError('NOT_FOUND', 'Неверный id объединения', 400);}
  const who = member.name || 'Менеджер';
  const m = await CrmMerge.findById(mergeId).lean();
  if (!m) {throw new AppError('NOT_FOUND', 'Объединение не найдено', 404);}
  if (m.undoneAt) {throw conflict('Объединение уже отменено');}
  if (now - new Date(m.at) > UNDO_MS) {
    throw conflict('Отменить можно только в течение 30 минут после объединения');
  }
  const [from, into] = await Promise.all([
    CrmClient.findById(m.fromId).lean(),
    CrmClient.findById(m.intoId).lean(),
  ]);
  if (!from || !sameId(from.mergedInto, m.intoId)) {throw conflict('Карточка уже изменилась. Отмените вручную.');}
  if (!into || into.mergedInto) {throw conflict('Карточку уже объединили с другой. Сначала отмените то объединение.');}
  if (m.linkMovedUserId && !sameId(into.appUserId, m.linkMovedUserId)) {
    throw conflict('После объединения изменилась связь с приложением. Отмените вручную.');
  }
  const statusIds = Object.keys(m.orderStatus || {});
  if (statusIds.length) {
    const now2 = (await CrmOrder.find({ _id: { $in: statusIds } }).select('_id status').lean()) || [];
    const changed =
      now2.length !== statusIds.length ||
      now2.some((o) => (o.status || null) !== m.orderStatus[String(o._id)]);
    if (changed) {throw conflict('После объединения заказы изменились. Отмените вручную.');}
  }
  const balance = round2(m.balance);
  if (balance > 0 && round2(into.balance) < balance) {
    throw conflict('Баланс после объединения уже потрачен. Отмените вручную.');
  }

  const claimed = await CrmMerge.findOneAndUpdate({ _id: m._id, undoneAt: null }, { $set: { undoneAt: now } });
  if (!claimed) {throw conflict('Объединение уже отменено');}

  if (balance > 0) {
    const ok = await CrmClient.findOneAndUpdate(
      { _id: into._id, balance: { $gte: balance } },
      { $inc: { balance: -balance } },
      { new: true }
    );
    if (!ok) {
      await CrmMerge.updateOne({ _id: m._id }, { $set: { undoneAt: null } });
      throw conflict('Баланс после объединения уже потрачен. Отмените вручную.');
    }
  } else if (balance < 0) {
    await CrmClient.updateOne({ _id: into._id }, { $inc: { balance: -balance } });
  }

  // Снять то, что объединение выдало в приложении (заказ снова ждёт привязки).
  const granted = (m.grantedOrderIds || []).length
    ? (await CrmOrder.find({ _id: { $in: m.grantedOrderIds }, 'granted.at': { $ne: null } })) || []
    : [];
  for (const order of granted) {
    try {
      await undoGrant(order, { money: false, reason: 'Отмена объединения', who });
    } catch (err) {
      logger.error('CRM undo merge: доступ не снят', { orderId: String(order._id), message: err.message });
    }
  }

  const moved = m.moved || {};
  for (const [key, field] of ORDER_FIELDS) {
    if ((moved[key] || []).length) {
      await CrmOrder.updateMany({ _id: { $in: moved[key] }, [field]: into._id }, { $set: { [field]: from._id } });
    }
  }
  for (const [key, Model] of LINKED) {
    if ((moved[key] || []).length) {
      await Model.updateMany({ _id: { $in: moved[key] }, clientId: into._id }, { $set: { clientId: from._id } });
    }
  }

  const added = m.added || {};
  const back = {};
  Object.entries(m.filled || {}).forEach(([path, f]) => {
    const cur = getPath(into, path);
    if (String(cur) === String(f.value)) {back[path] = f.prev;}
  });
  if (m.linkMovedUserId) {back.appUserId = null;}
  const update = {};
  if (Object.keys(back).length) {update.$set = back;}
  const pullAll = {};
  if ((added.tags || []).length) {pullAll.tags = added.tags;}
  if ((added.legacyMonths || []).length) {pullAll.legacyMonths = added.legacyMonths;}
  if (Object.keys(pullAll).length) {update.$pullAll = pullAll;}
  const pull = {};
  if ((added.emails || []).length) {pull.emails = { email: { $in: added.emails } };}
  if ((added.commentIds || []).length) {pull.comments = { _id: { $in: added.commentIds } };}
  if (Object.keys(pull).length) {update.$pull = pull;}
  if (Object.keys(update).length) {
    await CrmClient.updateOne({ _id: into._id }, update);
  }

  const fromUpdate = { $set: { mergedInto: null, appUserId: moved.fromAppUserId || null } };
  if (balance) {fromUpdate.$inc = { balance };}
  await CrmClient.updateOne({ _id: from._id }, fromUpdate);

  await logEvent(into._id, who, `Объединение с ${label(from)} отменено`);
  await logEvent(from._id, who, `Объединение с ${label(into)} отменено, карточка снова в списках`);
  return { fromId: String(from._id), intoId: String(into._id), revoked: granted.length };
}

module.exports = { findDuplicates, duplicatesOf, merge, undoMerge, UNDO_MS, PHONE_MIN };
