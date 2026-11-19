const CrmClient = require('../models/CrmClient');
const CrmOrder = require('../models/CrmOrder');
const { searchMatch } = require('./client-list.service');
const { loadRefs, orderRow } = require('./order-view.service');

/**
 * Глобальный поиск в шапке (CRM-PLAN D8): GET /api/crm/search?q
 * → { q, items: [{ kind: 'client'|'order', id, title, sub }] }
 *
 * Как в прототипе (component.js, «глобальный поиск»): от 2 символов;
 * клиентки — по имени, почте (ГК/сайт и приложения), телефону, @нику
 * (тот же searchMatch, что в «Клиентах»), до 6; заказы — по номеру
 * (начало номера, от 1 цифры, можно с «#» или «№»), до 3.
 */
const MIN_LEN = 2;
const CLIENTS = 6;
const ORDERS = 3;
const MAX_NUM_LEN = 9;

/**
 * Номера, начинающиеся с digits: [d·10^k, (d+1)·10^k) для k = 0…(9 − длина).
 * Диапазоны идут по индексу { num: 1 }, без перебора всей коллекции.
 */
function numPrefixMatch(digits) {
  const s = String(digits || '');
  if (!/^\d+$/.test(s) || s.length > MAX_NUM_LEN) {return null;}
  const d = Number(s);
  const or = [];
  for (let k = 0; k + s.length <= MAX_NUM_LEN; k += 1) {
    const p = 10 ** k;
    if (k > 0 && d === 0) {break;}
    or.push({ num: { $gte: d * p, $lt: (d + 1) * p } });
  }
  return or.length === 1 ? or[0] : { $or: or };
}

/** Строка поиска → номер заказа (цифры без «#», «№»), иначе null. */
function orderNumQuery(q) {
  const s = String(q || '').trim().replace(/^(#|№|заказ)\s*/i, '');
  return /^\d+$/.test(s) ? s : null;
}

async function searchAll(qRaw) {
  const q = String(qRaw || '').trim().slice(0, 100);
  if (q.length < MIN_LEN && !orderNumQuery(q)) {return { q, items: [] };}

  const numQ = orderNumQuery(q);
  const orderMatch = numQ ? numPrefixMatch(numQ) : null;

  const [clients, orders] = await Promise.all([
    q.length >= MIN_LEN && !/^[#№]/.test(q)
      ? searchMatch(q).then((m) =>
        CrmClient.find({ $and: [{ mergedInto: null }, m] })
          .select('name primaryEmail emails telegram phone appUserId')
          .sort({ name: 1, _id: 1 })
          .limit(CLIENTS)
          .lean())
      : [],
    orderMatch ? CrmOrder.find(orderMatch).sort({ num: 1 }).limit(ORDERS * 4).lean() : [],
  ]);

  // Точное совпадение номера — первым, дальше по возрастанию номера.
  const exact = numQ ? Number(numQ) : null;
  const orderList = (orders || [])
    .slice()
    .sort((a, b) => (a.num === exact ? -1 : b.num === exact ? 1 : a.num - b.num))
    .slice(0, ORDERS);
  const refs = await loadRefs(orderList);

  const items = [];
  (clients || []).forEach((c) => {
    const email = c.primaryEmail || (c.emails && c.emails[0] ? c.emails[0].email : null);
    const tg = c.telegram && c.telegram.username ? `@${String(c.telegram.username).replace(/^@/, '')}` : null;
    items.push({
      kind: 'client',
      id: String(c._id),
      title: c.name || email || '—',
      sub: [email || c.phone, tg].filter(Boolean).join(' · ') || null,
    });
  });
  orderList.forEach((o) => {
    const row = orderRow(o, refs);
    items.push({
      kind: 'order',
      id: row.id,
      num: row.num,
      clientId: row.clientId,
      title: `Заказ #${row.num}`,
      sub: `${row.clientName} · ${row.product}`,
    });
  });
  return { q, items };
}

module.exports = { searchAll, numPrefixMatch, orderNumQuery };
