const CrmClient = require('../models/CrmClient');
const CrmProduct = require('../models/CrmProduct');
const CrmMember = require('../models/CrmMember');
const { round2 } = require('./view.helpers');

/**
 * Строка заказа для таблиц CRM (CRM-PLAN D4, вкладка «Заказы» карточки D2).
 *
 * Колонка «Доступ в приложении» вычисляется из статуса, granted, источника и
 * связи клиентки с приложением — как appState() в прототипе
 * (docs/crm-prototype/component.js), без «кода активации» (L5).
 * «Инструкция отправлена» появится с письмами (блок F), каналы Telegram — G.
 */

const STORE_SOURCES = ['app_store', 'google_play'];
const SOURCE_LABEL = {
  site: 'Сайт',
  manual: 'Вручную',
  app_store: 'App Store',
  google_play: 'Google Play',
  import: 'Импорт',
  admin: 'Админка',
};
const METHOD_LABEL = {
  bepaid: 'bePaid',
  lava: 'lava.top',
  transfer: 'Перевод на карту',
  balance: 'Баланс',
  app_store: 'App Store',
  google_play: 'Google Play',
  import: 'Импорт',
};

const idStr = (v) => (v === null || v === undefined ? null : String(v && v._id ? v._id : v));

function confirmedPaid(order) {
  return round2(
    (order.payments || []).filter((p) => !p.pending).reduce((t, p) => t + (Number(p.amount) || 0), 0)
  );
}

/** Просрочен: не оплачен и срок оплаты прошёл (в базе не хранится, A1). */
function isOverdue(order, now = new Date()) {
  return order.status === 'new' && Boolean(order.deadline) && new Date(order.deadline) < now;
}

/** «Источник/способ»: стор — его имя; без оплаты; способы платежей; иначе источник. */
function sourceLabel(order) {
  if (STORE_SOURCES.includes(order.source)) {return SOURCE_LABEL[order.source];}
  if (order.status === 'free') {return 'Без оплаты';}
  const methods = [];
  (order.payments || []).forEach((p) => {
    const m = METHOD_LABEL[p.method] || p.method;
    if (m && !methods.includes(m)) {methods.push(m);}
  });
  return methods.length ? methods.join(' + ') : SOURCE_LABEL[order.source] || order.source || '—';
}

/**
 * «Доступ в приложении» → { text, tone } (tone — цвет «таблетки»: ok, wait,
 * warn, mute, ask — как TONES прототипа).
 * product — lean CrmProduct или null; recipient — клиентка, которой
 * открывается доступ (получательница подарка или сама клиентка).
 */
function appState(order, product, recipient) {
  const st = order.status;
  const g = order.granted || {};
  const ss = g.subscriptionSet || {};
  const type = product && product.grant ? product.grant.type : null;

  if (st === 'fake') {return { text: '—', tone: 'mute' };}
  if (st === 'refund') {return { text: 'Доступ закрыт', tone: 'mute' };}
  if (STORE_SOURCES.includes(order.source)) {
    return st === 'paid' || st === 'free'
      ? { text: 'Выдано автоматически', tone: 'ok' }
      : { text: 'После оплаты', tone: 'mute' };
  }
  if (type === 'none' || type === 'tier2') {return { text: 'Вне приложения', tone: 'mute' };}
  if (type === 'deposit') {
    return g.at ? { text: 'Зачислено на баланс', tone: 'ok' } : { text: 'После оплаты', tone: 'mute' };
  }
  if (g.at) {
    if (ss.termExpiredAt) {return { text: 'Срок доступа закончился', tone: 'mute' };}
    return st === 'partial'
      ? { text: 'Открыто · рассрочка', tone: 'ok' }
      : { text: 'Открыто', tone: 'ok' };
  }
  // Ручные выдачи админки (C3): доступ уже открыт в админке, заказ — запись.
  if (order.source === 'admin' && (st === 'free' || st === 'paid')) {
    return { text: 'Открыто', tone: 'ok' };
  }
  if (st === 'confirm') {return { text: 'После подтверждения', tone: 'mute' };}
  if (st !== 'paid' && st !== 'free') {return { text: 'После оплаты', tone: 'mute' };}
  if (!product) {return { text: 'Нужно уточнить', tone: 'ask' };}
  if (!recipient || !recipient.appUserId) {return { text: 'Ждёт привязки', tone: 'warn' };}
  return { text: 'Ждёт выдачи', tone: 'wait' };
}

/** Справочники для страницы заказов: продукты, клиентки (вкл. получательниц), менеджеры. */
async function loadRefs(orders, { clients: knownClients = [] } = {}) {
  const productIds = [...new Set(orders.map((o) => idStr(o.productId)).filter(Boolean))];
  const clientIds = new Set();
  orders.forEach((o) => {
    clientIds.add(idStr(o.clientId));
    if (o.gift && o.gift.recipientClientId) {clientIds.add(idStr(o.gift.recipientClientId));}
  });
  knownClients.forEach((c) => clientIds.delete(String(c._id)));
  clientIds.delete(null);
  const managerIds = [...new Set(orders.map((o) => idStr(o.managerId)).filter(Boolean))];

  const [products, clients, managers] = await Promise.all([
    productIds.length
      ? CrmProduct.find({ _id: { $in: productIds } })
        .select('name grant accessOnFirstPayment tgLink')
        .lean()
      : [],
    clientIds.size
      ? CrmClient.find({ _id: { $in: [...clientIds] } })
        .select('name primaryEmail appUserId')
        .lean()
      : [],
    managerIds.length ? CrmMember.find({ _id: { $in: managerIds } }).select('name').lean() : [],
  ]);
  const map = (list) => new Map(list.map((x) => [String(x._id), x]));
  return {
    products: map(products),
    clients: map([...knownClients, ...clients]),
    managers: map(managers),
  };
}

function orderRow(order, refs, now = new Date()) {
  const product = refs.products.get(idStr(order.productId)) || null;
  const client = refs.clients.get(idStr(order.clientId)) || null;
  const recipientId = order.gift && order.gift.recipientClientId ? idStr(order.gift.recipientClientId) : null;
  const recipient = recipientId ? refs.clients.get(recipientId) || null : client;
  const manager = refs.managers.get(idStr(order.managerId)) || null;
  const unmatched = !order.productId && (Boolean(order.storeUnmatched) || STORE_SOURCES.includes(order.source));
  return {
    id: String(order._id),
    num: order.num,
    createdAt: order.createdAt || null,
    clientId: idStr(order.clientId),
    clientName: client ? client.name || client.primaryEmail || '—' : '—',
    clientEmail: client ? client.primaryEmail || null : null,
    product: product ? product.name : order.productTitle || '—',
    productUnmatched: unmatched,
    note: order.note || null,
    price: round2(order.price),
    discount: round2(order.discount),
    cur: order.cur || 'BYN',
    paid: confirmedPaid(order),
    status: order.status,
    overdue: isOverdue(order, now),
    source: order.source,
    sourceLabel: sourceLabel(order),
    store: STORE_SOURCES.includes(order.source),
    managerId: idStr(order.managerId),
    managerName: manager ? manager.name : null,
    app: appState(order, product, recipient),
    gift: Boolean(order.gift && (order.gift.email || order.gift.recipientClientId)),
    tags: order.tags || [],
  };
}

module.exports = {
  STORE_SOURCES,
  SOURCE_LABEL,
  METHOD_LABEL,
  appState,
  sourceLabel,
  isOverdue,
  confirmedPaid,
  loadRefs,
  orderRow,
};
