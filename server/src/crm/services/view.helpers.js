const { clubMonthKey } = require('../../middleware/subscription');
const { parseMonthKey } = require('../../services/entitlement.service');

/**
 * Общие помощники экранов «Клиенты» и «Заказы» (CRM-PLAN D1, D2, D4).
 *
 * Месяцы — ключи 'YYYY-M' по локальному времени сервера (L1): текущий месяц
 * считается тем же clubMonthKey, что и в middleware/subscription.
 */

/** Ключ текущего клубного месяца (L1). */
function currentMonthKey(now = new Date()) {
  return clubMonthKey({ year: now.getFullYear(), month: now.getMonth() + 1 });
}

/** 'YYYY-M' → порядковый номер месяца (year*12 + month-1) или null. */
function monthIndex(key) {
  const p = parseMonthKey(key);
  return p ? p.year * 12 + p.month - 1 : null;
}

/** Порядковый номер → 'YYYY-M'. */
function monthKeyOf(idx) {
  return `${Math.floor(idx / 12)}-${(idx % 12) + 1}`;
}

/** Ключи месяцев от текущего (включительно, если withCurrent) на n вперёд. */
function monthsAhead(curKey, n, withCurrent = true) {
  const start = monthIndex(curKey) + (withCurrent ? 0 : 1);
  return Array.from({ length: n }, (_, i) => monthKeyOf(start + i));
}

/** Последний месяц из наборов ключей (или null). */
function lastMonthKey(...lists) {
  let best = null;
  lists.flat().forEach((k) => {
    const i = monthIndex(k);
    if (i !== null && (best === null || i > best)) {best = i;}
  });
  return best === null ? null : monthKeyOf(best);
}

/** Ключи по возрастанию, без дублей и мусора, в нормальном виде 'YYYY-M'. */
function sortMonthKeys(keys) {
  const idx = [...new Set((keys || []).map(monthIndex).filter((i) => i !== null))];
  return idx.sort((a, b) => a - b).map(monthKeyOf);
}

/** Экранирование строки для RegExp из поиска. */
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Выражение агрегации: сумма amountExpr в BYN по курсам CrmSettings.rates.
 * Курс не задан → валюта даёт 0 (в «Сумме покупок» не учитывается, пока
 * команда не задаст курс в настройках).
 */
function toBynExpr(amountExpr, curExpr, rates = {}) {
  const branches = ['USD', 'RUB', 'EUR', 'GEL']
    .filter((c) => Number(rates[c]) > 0)
    .map((c) => ({ case: { $eq: [curExpr, c] }, then: Number(rates[c]) }));
  return {
    $multiply: [
      { $ifNull: [amountExpr, 0] },
      {
        $switch: {
          branches: [{ case: { $eq: [{ $ifNull: [curExpr, 'BYN'] }, 'BYN'] }, then: 1 }, ...branches],
          default: 0,
        },
      },
    ],
  };
}

/** То же в JS: сумма → BYN (null, если курс не задан). */
function toByn(amount, cur, rates = {}) {
  const a = Number(amount) || 0;
  if (!cur || cur === 'BYN') {return a;}
  const r = Number(rates[cur]);
  return r > 0 ? a * r : null;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Страница и размер из query: page ≥ 1, limit 1…100 (по умолчанию 15 —
 * как в таблицах прототипа).
 */
function paging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
  return { page, limit, skip: (page - 1) * limit };
}

/** 'name' | '-name' | 'name:desc' → { key, dir: 1 | -1 }. */
function parseSort(raw, allowed, fallback) {
  let s = String(raw || '').trim();
  let dir = 1;
  if (s.startsWith('-')) {
    dir = -1;
    s = s.slice(1);
  } else if (s.includes(':')) {
    const [k, d] = s.split(':');
    s = k;
    dir = d === 'desc' ? -1 : 1;
  }
  if (!allowed.includes(s)) {return fallback;}
  return { key: s, dir };
}

/** Список id из query (?ids=a,b,c) — для выгрузки выбранных строк. */
function idsParam(raw, isValid) {
  if (!raw) {return null;}
  const list = String(raw)
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && isValid(x));
  return list.length ? list.slice(0, 5000) : null;
}

module.exports = {
  currentMonthKey,
  monthIndex,
  monthKeyOf,
  monthsAhead,
  lastMonthKey,
  sortMonthKeys,
  escapeRe,
  toBynExpr,
  toByn,
  round2,
  paging,
  parseSort,
  idsParam,
};
