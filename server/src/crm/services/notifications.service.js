const mongoose = require('mongoose');
const CrmOrder = require('../models/CrmOrder');
const CrmTask = require('../models/CrmTask');
const CrmThread = require('../models/CrmThread');
const CrmTgRequest = require('../models/CrmTgRequest');
const CrmTgChannel = require('../models/CrmTgChannel');
const CrmMember = require('../models/CrmMember');
const { loadRefs, METHOD_LABEL } = require('./order-view.service');
const { can } = require('./permissions');
const { round2 } = require('./view.helpers');
const { PENDING_TRANSFERS, OPEN, INBOX_WAITING, TG_PENDING, clientsById } = require('./today.service');

/**
 * Колокольчик в шапке (CRM-PLAN D8):
 *   GET  /api/crm/notifications → { items, unread, seenAt }
 *   POST /api/crm/notifications/read { ids } | { all: true } → { unread }
 *
 * Уведомления не хранятся — вычисляются из данных, как в прототипе
 * (component.js, «уведомления»):
 *   c… перевод ждёт подтверждения (платёж pending или заказ «confirm»);
 *   p… оплата за последние сутки (подтверждённая, не с баланса);
 *   o… просроченный счёт (не оплачен, срок прошёл, за 30 дней);
 *   t… сообщение без ответа (только тем, у кого есть «Входящие»);
 *   k… моя просроченная задача;
 *   r… заявка в канал без оплаты.
 * id уведомления меняется, если событие повторилось (новое сообщение в
 * диалоге, перенос срока задачи) — тогда оно снова непрочитано.
 *
 * Прочитанное — по участнице: CrmMember.notificationsRead (id, только ещё
 * актуальные, не больше 500) и notificationsSeenAt (последнее «Прочитать все»).
 */
const DAY = 24 * 60 * 60 * 1000;
const PER_SOURCE = 30;
const SHOW = 30;
const READ_CAP = 500;

const idStr = (v) => (v === null || v === undefined ? null : String(v && v._id ? v._id : v));
const ms = (d) => (d ? new Date(d).getTime() : 0);

const num = (n) => String(round2(n)).replace('.', ',');
const money = (n, cur) => `${num(n)} ${cur || 'BYN'}`;
const date = (d) => {
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
};

const CHANNEL_LABEL = { bot: 'Telegram-бот', email: 'Почта', site_form: 'Форма на сайте', whatsapp: 'WhatsApp' };

const clientName = (c) => (c ? c.name || c.primaryEmail || 'Клиентка' : 'Клиентка');
const productName = (o, refs) => {
  const p = refs.products.get(idStr(o.productId));
  return p ? p.name : o.productTitle || 'Позиция';
};

/** Все уведомления участницы (новые сверху, без отметки прочитанного). */
async function buildNotifications(member, now = new Date()) {
  const since = new Date(now.getTime() - DAY);
  const memberId = new mongoose.Types.ObjectId(String(member.id));
  const withInbox = can(member.role, 'inbox');
  const canConfirm = can(member.role, 'confirm');

  const [pendingOrders, paidOrders, overdueOrders, tasks, threads, tgReqs] = await Promise.all([
    CrmOrder.find(PENDING_TRANSFERS).sort({ updatedAt: -1 }).limit(PER_SOURCE).lean(),
    CrmOrder.find({
      ...OPEN,
      payments: { $elemMatch: { at: { $gte: since }, pending: { $ne: true }, method: { $ne: 'balance' } } },
    })
      .sort({ updatedAt: -1 })
      .limit(PER_SOURCE)
      .lean(),
    CrmOrder.find({ status: 'new', deadline: { $lt: now, $gte: new Date(now.getTime() - 30 * DAY) } })
      .sort({ deadline: -1 })
      .limit(PER_SOURCE)
      .lean(),
    CrmTask.find({ assigneeId: memberId, done: { $ne: true }, due: { $ne: null, $lt: now } })
      .sort({ due: -1 })
      .limit(PER_SOURCE)
      .lean(),
    withInbox ? CrmThread.find(INBOX_WAITING).sort({ lastAt: -1 }).limit(PER_SOURCE).lean() : [],
    CrmTgRequest.find(TG_PENDING).sort({ at: -1 }).limit(PER_SOURCE).lean(),
  ]);

  const refs = await loadRefs([...(pendingOrders || []), ...(paidOrders || []), ...(overdueOrders || [])]);
  const otherClients = await clientsById([
    ...(tasks || []).map((t) => idStr(t.clientId)),
    ...(threads || []).map((t) => idStr(t.clientId)),
    ...(tgReqs || []).map((r) => idStr(r.clientId)),
  ]);
  const channels = (tgReqs || []).length
    ? await CrmTgChannel.find({ chatId: { $in: [...new Set(tgReqs.map((r) => r.chatId))] } })
      .select('chatId title')
      .lean()
    : [];
  const chTitle = new Map((channels || []).map((c) => [String(c.chatId), c.title]));

  const items = [];
  const orderLink = (o) => ({ type: 'order', id: String(o._id) });

  (pendingOrders || []).forEach((o) => {
    const c = refs.clients.get(idStr(o.clientId));
    const tail = canConfirm ? 'подтвердите, что деньги пришли' : 'подтвердит Анна';
    const pend = (o.payments || []).filter((p) => p.pending);
    const push = (id, amount, cur, at) =>
      items.push({
        id,
        kind: 'transfer',
        text: `Перевод ждёт подтверждения · ${clientName(c)}`,
        sub: `${money(amount, cur)} · заказ #${o.num} · ${tail}`,
        at,
        link: orderLink(o),
      });
    if (pend.length) {
      pend.forEach((p) => push(`c${o._id}_${idStr(p._id)}`, p.amount, p.cur || o.cur, p.at || o.updatedAt));
    } else {
      push(`c${o._id}`, o.price, o.cur, o.updatedAt || o.createdAt);
    }
  });

  (paidOrders || []).forEach((o) => {
    const c = refs.clients.get(idStr(o.clientId));
    (o.payments || []).forEach((p) => {
      if (p.pending || p.method === 'balance' || !p.at || new Date(p.at) < since) {return;}
      items.push({
        id: `p${o._id}_${idStr(p._id)}`,
        kind: 'payment',
        text: `Оплата ${money(p.amount, p.cur || o.cur)} · ${clientName(c)}`,
        sub: `${productName(o, refs)} · ${METHOD_LABEL[p.method] || p.method}`,
        at: p.at,
        link: orderLink(o),
      });
    });
  });

  (overdueOrders || []).forEach((o) => {
    const c = refs.clients.get(idStr(o.clientId));
    items.push({
      id: `o${o._id}`,
      kind: 'overdue',
      text: `Просрочен счёт #${o.num}`,
      sub: `${clientName(c)} · срок был ${date(o.deadline)}`,
      at: o.deadline,
      link: orderLink(o),
    });
  });

  (threads || []).forEach((t) => {
    const c = otherClients.get(idStr(t.clientId));
    const last = (t.messages || []).filter((m) => m.dir === 'in').pop() || (t.messages || []).slice(-1)[0];
    items.push({
      id: `t${t._id}_${ms(t.lastAt)}`,
      kind: 'message',
      text: `Сообщение · ${c ? clientName(c) : t.hintEmail || 'Новая клиентка'}`,
      sub: [CHANNEL_LABEL[t.channel] || t.channel, last && last.text ? String(last.text).slice(0, 60) : null]
        .filter(Boolean)
        .join(' · '),
      at: t.lastAt,
      link: { type: 'inbox', id: String(t._id) },
    });
  });

  (tasks || []).forEach((t) => {
    const c = otherClients.get(idStr(t.clientId));
    items.push({
      id: `k${t._id}_${ms(t.due)}`,
      kind: 'task',
      text: `Просрочена задача${c ? ` · ${clientName(c)}` : ''}`,
      sub: t.title,
      at: t.due,
      link: { type: 'tasks', id: String(t._id) },
    });
  });

  (tgReqs || []).forEach((r) => {
    const nick = r.username ? `@${String(r.username).replace(/^@/, '')}` : `id ${r.tgUserId}`;
    items.push({
      id: `r${r._id}`,
      kind: 'tg',
      text: `Заявка в канал без оплаты · ${nick}`,
      sub: chTitle.get(String(r.chatId)) || `Канал ${r.chatId}`,
      at: r.at,
      link: { type: 'today' },
    });
  });

  items.sort((a, b) => ms(b.at) - ms(a.at));
  return items;
}

async function readState(memberId) {
  const m = await CrmMember.findById(memberId).select('+notificationsRead notificationsSeenAt').lean();
  return {
    read: new Set((m && m.notificationsRead) || []),
    seenAt: (m && m.notificationsSeenAt) || null,
  };
}

/** GET /notifications: первые 30 с отметкой прочитанного + число непрочитанных из всех. */
async function getNotifications(member, now = new Date()) {
  const [all, state] = await Promise.all([buildNotifications(member, now), readState(member.id)]);
  const marked = all.map((n) => ({ ...n, read: state.read.has(n.id) }));
  return {
    items: marked.slice(0, SHOW),
    unread: marked.filter((n) => !n.read).length,
    seenAt: state.seenAt,
  };
}

/**
 * POST /notifications/read: { all: true } — «Прочитать все»; { ids } — одно
 * или несколько. Хранятся только id ещё актуальных уведомлений (список сам
 * чистится), не больше 500.
 */
async function markRead(member, { ids, all } = {}, now = new Date()) {
  const [items, state] = await Promise.all([buildNotifications(member, now), readState(member.id)]);
  const current = new Set(items.map((n) => n.id));
  let next;
  if (all) {
    next = items.map((n) => n.id);
  } else {
    const add = (Array.isArray(ids) ? ids : []).map(String).filter((id) => current.has(id));
    next = [...new Set([...[...state.read].filter((id) => current.has(id)), ...add])];
  }
  next = next.slice(0, READ_CAP);
  const set = { notificationsRead: next };
  if (all) {set.notificationsSeenAt = now;}
  await CrmMember.updateOne({ _id: member.id }, { $set: set });
  const read = new Set(next);
  return { unread: items.filter((n) => !read.has(n.id)).length };
}

module.exports = { buildNotifications, getNotifications, markRead, READ_CAP, SHOW };
