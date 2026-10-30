/**
 * Матрица прав CRM (CRM-PLAN A2) — один в один с CAN прототипа
 * (docs/crm-prototype/logic.js). Просмотр клиенток и заказов — всем ролям,
 * поэтому отдельного права на него нет: requireCrm() без аргумента.
 */
const CAN = Object.freeze({
  orders: ['owner', 'admin', 'manager'],
  refund: ['owner', 'admin'],
  products: ['owner', 'admin', 'marketing'],
  promo: ['owner', 'admin', 'marketing'],
  confirm: ['owner'],
  mail: ['owner', 'admin', 'marketing'],
  stats: ['owner', 'admin', 'marketing'],
  import: ['owner', 'admin'],
  settings: ['owner', 'admin'],
  team: ['owner'],
  sales: ['owner', 'admin', 'manager'],
  inbox: ['owner', 'admin', 'manager'],
});

const PERMS = Object.keys(CAN);

const can = (role, perm) => Boolean(CAN[perm] && CAN[perm].includes(role));

// Список прав роли — для GET /api/crm/me (меню фронта по роли).
const permsOf = (role) => PERMS.filter((p) => can(role, p));

module.exports = { CAN, PERMS, can, permsOf };
