import { api, download } from './client';

/**
 * Запросы экранов «Клиенты», карточки клиентки и «Заказы» (CRM-PLAN D1, D2, D4).
 * Ответы — data из { success, data } (см. api/client.js).
 */

const qs = (params) => {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === 'all') return;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};
const sortParam = (sort) => (sort ? `${sort.dir === 'desc' ? '-' : ''}${sort.key}` : undefined);

// --- клиентки -------------------------------------------------------------

/** → { items, total, page, limit, seg, counts, currentMonth } */
export const listClients = ({ q, seg, sort, page, limit }) =>
  api(`/api/crm/clients${qs({ q, seg, sort: sortParam(sort), page, limit })}`);

export const exportClients = ({ q, seg, sort, ids }) =>
  download(`/api/crm/clients/export.csv${qs({ q, seg, sort: sortParam(sort), ids })}`, 'clients.csv');

/** Массовый тег: add или remove. → { tag, changed, ids } */
export const bulkTags = (ids, { add, remove }) =>
  api('/api/crm/clients/tags', { method: 'POST', body: add ? { ids, add } : { ids, remove } });

export const getClient = (id) => api(`/api/crm/clients/${id}`);
export const patchClient = (id, body) => api(`/api/crm/clients/${id}`, { method: 'PATCH', body });
export const addComment = (id, text) => api(`/api/crm/clients/${id}/comments`, { method: 'POST', body: { text } });
export const balanceOp = (id, op, amount, reason) =>
  api(`/api/crm/clients/${id}/balance`, { method: 'POST', body: { op, amount, reason } });
export const clientHistory = (id, page = 1) => api(`/api/crm/clients/${id}/history${qs({ page })}`);
export const linkClient = (id, email) => api(`/api/crm/clients/${id}/link`, { method: 'POST', body: { email } });
export const unlinkClient = (id) => api(`/api/crm/clients/${id}/unlink`, { method: 'POST', body: {} });

// --- заказы ---------------------------------------------------------------

/** → { items, total, page, limit, tab, tabs, receivedByn, managers } */
export const listOrders = ({ status, source, manager, from, to, q, sort, page, limit }) =>
  api(`/api/crm/orders${qs({ status, source, manager, from, to, q, sort: sortParam(sort), page, limit })}`);

export const exportOrders = ({ status, source, manager, from, to, q, sort, ids }) =>
  download(`/api/crm/orders/export.csv${qs({ status, source, manager, from, to, q, sort: sortParam(sort), ids })}`, 'orders.csv');

// --- заказ: карточка и новый (D5, D6) ---

/** → { products, managers, accounts, requireTransferConfirm } */
export const orderMeta = () => api('/api/crm/orders/meta');
/** Все действия ниже возвращают свежую карточку заказа. */
export const getOrder = (id) => api(`/api/crm/orders/${id}`);
export const createOrder = (body) => api('/api/crm/orders', { method: 'POST', body });
export const addOrderPayment = (id, body) => api(`/api/crm/orders/${id}/payments`, { method: 'POST', body });
export const confirmOrderPayment = (id, pid) =>
  api(`/api/crm/orders/${id}/payments/${pid}/confirm`, { method: 'POST', body: {} });
export const deleteOrderPayment = (id, pid, reason) =>
  api(`/api/crm/orders/${id}/payments/${pid}`, { method: 'DELETE', body: { reason } });
export const patchOrder = (id, body) => api(`/api/crm/orders/${id}`, { method: 'PATCH', body });
export const applyOrderPromo = (id, code) => api(`/api/crm/orders/${id}/promo`, { method: 'POST', body: { code } });
export const fakeOrder = (id) => api(`/api/crm/orders/${id}/fake`, { method: 'POST', body: { confirm: true } });
export const restoreOrder = (id) => api(`/api/crm/orders/${id}/restore`, { method: 'POST', body: {} });
export const refundOrder = (id, body) => api(`/api/crm/orders/${id}/refund`, { method: 'POST', body });
export const addOrderComment = (id, text) => api(`/api/crm/orders/${id}/comments`, { method: 'POST', body: { text } });

// --- дубли (D3) -------------------------------------------------------------

/** Группы дублей. → { items: [{ key, reasons: [{type, value}], clients }], total, page, limit } */
export const listDuplicates = ({ page, limit } = {}) => api(`/api/crm/clients/duplicates${qs({ page, limit })}`);

/** Возможные дубли карточки. → { items: [{ id, name, email, phone, orders, balance, reasons }] } */
export const clientDuplicates = (id) => api(`/api/crm/clients/${id}/duplicates`);

/** Карточка fromId вливается в intoId. → { mergeId, fromId, intoId, moved, balance, emails, linkMoved, applied } */
export const mergeClient = (fromId, intoId) =>
  api(`/api/crm/clients/${fromId}/merge`, { method: 'POST', body: { intoId } });

/** Отмена объединения (30 минут). → { fromId, intoId, revoked } */
export const undoMerge = (mergeId) => api(`/api/crm/clients/merge/${mergeId}/undo`, { method: 'POST', body: {} });

// --- сегодня, поиск, уведомления (D7, D8) ---

/** «Сегодня» → { date, requireTransferConfirm, canConfirm, kpis, tasks, unpaid, transfers, unlinked, tg, recent, store, journal } */
export const getToday = () => api('/api/crm/today');

/** Поиск в шапке → { q, items: [{ kind: 'client'|'order', id, title, sub, num?, clientId? }] } */
export const searchAll = (q, signal) => api(`/api/crm/search${qs({ q })}`, { signal });

/** Колокольчик → { items: [{ id, kind, text, sub, at, link, read }], unread, seenAt } */
export const getNotifications = () => api('/api/crm/notifications');

/** Отметить прочитанными: ids — список, или all — «Прочитать все». → { unread } */
export const readNotifications = ({ ids, all }) =>
  api('/api/crm/notifications/read', { method: 'POST', body: all ? { all: true } : { ids } });
