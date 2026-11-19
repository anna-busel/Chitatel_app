const mongoose = require('mongoose');
const CrmOrder = require('../models/CrmOrder');
const CrmClient = require('../models/CrmClient');
const CrmTask = require('../models/CrmTask');
const CrmThread = require('../models/CrmThread');
const CrmTgRequest = require('../models/CrmTgRequest');
const CrmTgChannel = require('../models/CrmTgChannel');
const CrmAudit = require('../models/CrmAudit');
const CrmMember = require('../models/CrmMember');
const { getCrmSettings } = require('./settings.service');
const { productsWithStoreWarnings } = require('./store-ingest.service');
const { loadRefs, orderRow, METHOD_LABEL, STORE_SOURCES } = require('./order-view.service');
const { can } = require('./permissions');
const { round2 } = require('./view.helpers');

/**
 * «Сегодня» (CRM-PLAN D7): GET /api/crm/today.
 *
 * KPI — как в плане: неоплаченные счета (new + partial, как вкладка «Не
 * оплачены»), оплаты без привязки к приложению (за 14 дней), входящие без
 * ответа, заявки в каналы. Блоки: мои задачи на сегодня (вместе с
 * просроченными), ждут оплаты, переводы ждут подтверждения, оплатили — не
 * связаны с приложением, заявки в Telegram-каналы, последние оплаты, журнал за
 * сутки. Плюс предупреждения C2/L8: продукты без товара в App Store и заказы
 * стора без продукта CRM.
 *
 * Задачи (K), входящие (I) и заявки в каналы (G) пока никто не создаёт —
 * блоки читают свои коллекции и показывают пустое состояние.
 *
 * «Сегодня» — по локальному времени сервера (как ключи месяцев, L1).
 */
const { ObjectId } = mongoose.Types;

const UNLINKED_DAYS = 14;
const UNLINKED_SCAN = 500;
const LIST = 6;
const RECENT = 7;
const RECENT_DAYS = 30;
const JOURNAL = 30;
const DAY = 24 * 60 * 60 * 1000;

const idStr = (v) => (v === null || v === undefined ? null : String(v && v._id ? v._id : v));

function endOfDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}
function startOfDay(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

// --- условия запросов (общие с уведомлениями D8) --------------------------

const UNPAID = { status: { $in: ['new', 'partial'] } };
const OPEN = { status: { $nin: ['fake', 'refund'] } };
const PENDING_TRANSFERS = {
  ...OPEN,
  $or: [{ status: 'confirm' }, { 'payments.pending': true }],
};
const INBOX_WAITING = { answered: false, spam: { $ne: true } };
const TG_PENDING = { status: 'pending' };

/** Мои задачи на сегодня: исполнитель — я, срок до конца дня, не выполнена. */
function myTasksMatch(memberId, now = new Date()) {
  return {
    assigneeId: new ObjectId(String(memberId)),
    done: { $ne: true },
    due: { $ne: null, $lte: endOfDay(now) },
  };
}

const TASK_TYPE = { call: 'Позвонить', msg: 'Написать', offer: 'Предложение', meet: 'Встреча' };
const PRIORITY = { high: 'Высокий', mid: 'Средний', low: 'Низкий' };

function taskRow(t, clients, now = new Date()) {
  const c = clients.get(idStr(t.clientId)) || null;
  return {
    id: String(t._id),
    title: t.title,
    type: t.type,
    typeLabel: TASK_TYPE[t.type] || t.type,
    priority: t.priority || 'mid',
    priorityLabel: PRIORITY[t.priority] || PRIORITY.mid,
    due: t.due || null,
    overdue: Boolean(t.due && new Date(t.due) < now),
    clientId: idStr(t.clientId),
    clientName: c ? c.name || c.primaryEmail || '—' : null,
    orderId: idStr(t.orderId),
    auto: t.autoRule || null,
  };
}

async function clientsById(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  if (!list.length) {return new Map();}
  const docs = await CrmClient.find({ _id: { $in: list } }).select('name primaryEmail appUserId').lean();
  return new Map((docs || []).map((c) => [String(c._id), c]));
}

/** Первый неподтверждённый платёж заказа (для блока и уведомлений). */
function pendingPayment(order) {
  return (order.payments || []).find((p) => p.pending) || null;
}

function paymentView(p, fallbackCur) {
  if (!p) {return null;}
  return {
    id: idStr(p._id),
    amount: round2(p.amount),
    cur: p.cur || fallbackCur || 'BYN',
    method: p.method,
    methodLabel: METHOD_LABEL[p.method] || p.method,
    account: p.account || null,
    note: p.note || null,
    at: p.at || null,
  };
}

/** Дата последнего подтверждённого платежа. */
function lastPaidAt(order) {
  let best = null;
  (order.payments || []).forEach((p) => {
    if (p.pending || !p.at) {return;}
    const d = new Date(p.at);
    if (!best || d > best) {best = d;}
  });
  return best;
}

// --- блоки ------------------------------------------------------------------

async function myTasks(memberId, now) {
  const tasks = await CrmTask.find(myTasksMatch(memberId, now)).sort({ due: 1 }).limit(30).lean();
  const clients = await clientsById((tasks || []).map((t) => idStr(t.clientId)));
  return (tasks || []).map((t) => taskRow(t, clients, now));
}

async function unpaidOrders(now) {
  // Сначала с ближайшим сроком (без срока — в конце).
  const orders = await CrmOrder.aggregate([
    { $match: UNPAID },
    { $addFields: { _noDeadline: { $cond: [{ $ifNull: ['$deadline', false] }, 0, 1] } } },
    { $sort: { _noDeadline: 1, deadline: 1, createdAt: -1 } },
    { $limit: LIST },
  ]);
  const refs = await loadRefs(orders || []);
  return (orders || []).map((o) => {
    const row = orderRow(o, refs, now);
    return {
      ...row,
      deadline: o.deadline || null,
      // Остаток — как total() − paidAmt() прототипа (logic.js).
      left: round2(Math.max(0, (Number(o.price) || 0) - (Number(o.discount) || 0) - row.paid)),
      reminded: Boolean(o.remindersSent && o.remindersSent.length),
    };
  });
}

async function pendingTransfers(now) {
  const orders = await CrmOrder.find(PENDING_TRANSFERS).sort({ updatedAt: -1 }).limit(50).lean();
  const refs = await loadRefs(orders || []);
  return (orders || []).map((o) => ({
    ...orderRow(o, refs, now),
    payment: paymentView(pendingPayment(o), o.cur),
  }));
}

/**
 * Оплатили, но не связаны с приложением: за 14 дней, доступ «Ждёт привязки»
 * (та же колонка «Доступ в приложении», что в «Заказах»); по одной строке на
 * клиентку. Стор, ручные выдачи админки и подарки не попадают: в
 * appState у них свой текст.
 */
async function unlinkedPaid(now) {
  const since = new Date(now.getTime() - UNLINKED_DAYS * DAY);
  const orders = await CrmOrder.find({
    status: { $in: ['paid', 'free'] },
    source: { $nin: [...STORE_SOURCES, 'admin'] },
    $or: [{ 'payments.at': { $gte: since } }, { createdAt: { $gte: since } }],
  })
    .sort({ updatedAt: -1 })
    .limit(UNLINKED_SCAN)
    .lean();
  const refs = await loadRefs(orders || []);
  const seen = new Set();
  const out = [];
  (orders || []).forEach((o) => {
    const row = orderRow(o, refs, now);
    if (row.app.text !== 'Ждёт привязки') {return;}
    const recipient = (o.gift && o.gift.recipientClientId && idStr(o.gift.recipientClientId)) || row.clientId;
    if (seen.has(recipient)) {return;}
    seen.add(recipient);
    const c = refs.clients.get(recipient) || null;
    out.push({
      clientId: recipient,
      clientName: c ? c.name || c.primaryEmail || '—' : row.clientName,
      clientEmail: c ? c.primaryEmail || null : row.clientEmail,
      orderId: row.id,
      num: row.num,
      product: row.product,
      paidAt: lastPaidAt(o) || o.createdAt || null,
    });
  });
  out.sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0));
  return out;
}

async function tgRequests() {
  const reqs = await CrmTgRequest.find(TG_PENDING).sort({ at: -1 }).limit(20).lean();
  if (!reqs || !reqs.length) {return [];}
  const [channels, clients] = await Promise.all([
    CrmTgChannel.find({ chatId: { $in: [...new Set(reqs.map((r) => r.chatId))] } }).select('chatId title').lean(),
    clientsById(reqs.map((r) => idStr(r.clientId))),
  ]);
  const ch = new Map((channels || []).map((c) => [String(c.chatId), c]));
  return reqs.map((r) => {
    const c = clients.get(idStr(r.clientId)) || null;
    const channel = ch.get(String(r.chatId));
    return {
      id: String(r._id),
      username: r.username ? `@${String(r.username).replace(/^@/, '')}` : `id ${r.tgUserId}`,
      channel: channel && channel.title ? channel.title : `Канал ${r.chatId}`,
      reason: r.reason || null,
      at: r.at || null,
      clientId: idStr(r.clientId),
      clientName: c ? c.name || c.primaryEmail || '—' : null,
    };
  });
}

async function recentPayments(now) {
  const since = new Date(now.getTime() - RECENT_DAYS * DAY);
  const confirmedAt = {
    $max: {
      $map: {
        input: {
          $filter: { input: { $ifNull: ['$payments', []] }, as: 'p', cond: { $ne: ['$$p.pending', true] } },
        },
        as: 'p',
        in: '$$p.at',
      },
    },
  };
  const orders = await CrmOrder.aggregate([
    { $match: { ...OPEN, 'payments.at': { $gte: since } } },
    { $addFields: { _paidAt: confirmedAt } },
    { $match: { _paidAt: { $gte: since } } },
    { $sort: { _paidAt: -1, _id: -1 } },
    { $limit: RECENT },
  ]);
  const refs = await loadRefs(orders || []);
  return (orders || []).map((o) => ({ ...orderRow(o, refs, now), paidAt: o._paidAt || null }));
}

/** Предупреждения C2/L8: продукты без товара в App Store и заказы стора без продукта. */
async function storeBlock(now) {
  const match = { storeUnmatched: true, productId: null };
  const [products, count, orders] = await Promise.all([
    productsWithStoreWarnings(),
    CrmOrder.countDocuments(match),
    CrmOrder.find(match).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  const refs = await loadRefs(orders || []);
  return {
    products: (products || []).map((p) => ({ productId: idStr(p.productId), name: p.name, warnings: p.warnings })),
    unmatchedCount: count || 0,
    unmatched: (orders || []).map((o) => ({
      ...orderRow(o, refs, now),
      storeProductId: o.storeProductId || null,
    })),
  };
}

// --- журнал за сутки ---------------------------------------------------------

// Служебные записи, которые в журнале не нужны (отметка прочитанного).
const JOURNAL_SKIP = ['notifications.read'];

const ACTION_LABEL = {
  'client.update': 'изменила карточку клиентки',
  'client.comment': 'оставила комментарий',
  'client.link': 'связала клиентку с приложением',
  'client.unlink': 'отвязала клиентку от приложения',
  'client.balance.topup': 'пополнила баланс',
  'client.balance.spend': 'списала с баланса',
  'clients.tag.add': 'добавила тег клиенткам',
  'clients.tag.remove': 'сняла тег у клиенток',
  'clients.export': 'выгрузила клиенток в Excel',
  'orders.export': 'выгрузила заказы в Excel',
  'order.refund': 'оформила возврат',
};

function actionText(a) {
  if (ACTION_LABEL[a.action]) {return ACTION_LABEL[a.action];}
  // Без setAudit пишется «МЕТОД путь».
  const m = /^(POST|PUT|PATCH|DELETE) \/api\/crm(\/.*)?$/.exec(a.action || '');
  return m ? `${m[1]} ${m[2] || '/'}` : a.action;
}

async function journal(now) {
  const since = new Date(now.getTime() - DAY);
  const rows = await CrmAudit.find({ at: { $gte: since }, action: { $nin: JOURNAL_SKIP } })
    .sort({ at: -1 })
    .limit(JOURNAL)
    .lean();
  if (!rows || !rows.length) {return [];}
  const clientIds = rows.filter((r) => r.entity === 'CrmClient' && r.entityId).map((r) => r.entityId);
  const orderIds = rows
    .filter((r) => r.entity === 'CrmOrder' && r.entityId && mongoose.Types.ObjectId.isValid(r.entityId))
    .map((r) => r.entityId);
  const [members, clients, orders] = await Promise.all([
    CrmMember.find({ _id: { $in: [...new Set(rows.map((r) => idStr(r.memberId)))] } }).select('name').lean(),
    clientsById(clientIds),
    orderIds.length ? CrmOrder.find({ _id: { $in: orderIds } }).select('num').lean() : [],
  ]);
  const mm = new Map((members || []).map((m) => [String(m._id), m.name]));
  const om = new Map((orders || []).map((o) => [String(o._id), o.num]));
  return rows.map((r) => {
    let entityText = null;
    let link = null;
    if (r.entity === 'CrmClient' && r.entityId) {
      const c = clients.get(String(r.entityId));
      entityText = c ? c.name || c.primaryEmail || null : null;
      link = { type: 'client', id: String(r.entityId) };
    } else if (r.entity === 'CrmOrder' && r.entityId) {
      const n = om.get(String(r.entityId));
      entityText = n ? `Заказ #${n}` : null;
      link = { type: 'order', id: String(r.entityId) };
    }
    return {
      id: String(r._id),
      at: r.at,
      who: mm.get(idStr(r.memberId)) || 'Участница команды',
      action: r.action,
      text: actionText(r),
      entity: entityText,
      link,
    };
  });
}

// --- экран целиком -----------------------------------------------------------

/**
 * member — req.crmMember ({ id, role }).
 * Журнал за сутки — тем, у кого есть «Настройки» (владелица и администраторы):
 * в прототипе журнал — вкладка настроек; остальным приходит null.
 */
async function getToday(member, now = new Date()) {
  const settings = await getCrmSettings();
  const showJournal = can(member.role, 'settings');

  const [
    unpaidCount,
    inboxCount,
    tgCount,
    tasks,
    unpaid,
    transfers,
    unlinked,
    tg,
    recent,
    store,
    log,
  ] = await Promise.all([
    CrmOrder.countDocuments(UNPAID),
    CrmThread.countDocuments(INBOX_WAITING),
    CrmTgRequest.countDocuments(TG_PENDING),
    myTasks(member.id, now),
    unpaidOrders(now),
    pendingTransfers(now),
    unlinkedPaid(now),
    tgRequests(),
    recentPayments(now),
    storeBlock(now),
    showJournal ? journal(now) : Promise.resolve(null),
  ]);

  return {
    date: now,
    requireTransferConfirm: Boolean(settings && settings.requireTransferConfirm),
    canConfirm: can(member.role, 'confirm'),
    kpis: {
      unpaid: unpaidCount || 0,
      unlinked: unlinked.length,
      inbox: inboxCount || 0,
      tg: tgCount || 0,
    },
    tasks,
    unpaid,
    transfers,
    unlinked: unlinked.slice(0, LIST),
    tg,
    recent,
    store,
    journal: log,
  };
}

module.exports = {
  getToday,
  startOfDay,
  endOfDay,
  myTasksMatch,
  taskRow,
  pendingPayment,
  paymentView,
  clientsById,
  actionText,
  UNPAID,
  OPEN,
  PENDING_TRANSFERS,
  INBOX_WAITING,
  TG_PENDING,
  JOURNAL_SKIP,
  UNLINKED_DAYS,
};
