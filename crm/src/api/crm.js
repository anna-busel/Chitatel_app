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
