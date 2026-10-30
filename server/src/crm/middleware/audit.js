const CrmAudit = require('../models/CrmAudit');
const logger = require('../../config/logger');

/**
 * Журнал действий CRM (CRM-PLAN A3): каждое изменяющее действие команды
 * (POST/PUT/PATCH/DELETE под /api/crm после входа) пишется в CrmAudit —
 * кто, что, до/после.
 *
 * Запись делается после ответа и только при успехе (2xx): отказ или ошибка
 * ничего не изменили. Сбой записи журнала ответ не ломает — только лог.
 *
 * Роут уточняет запись через setAudit(res, {...}):
 *   setAudit(res, { action: 'order.refund', entity: 'CrmOrder',
 *                   entityId: order._id, before, after });
 * Без setAudit пишется action = «МЕТОД путь», after = тело запроса.
 * Пароли, коды и токены вырезаются из before/after.
 */
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECRET_KEYS = new Set([
  'password',
  'passwordHash',
  'totpSecret',
  'refreshTokens',
  'refreshToken',
  'accessToken',
  'tempToken',
  'code',
  'secret',
]);

const scrub = (value, depth = 0) => {
  if (value === null || value === undefined || depth > 6) {
    return value === undefined ? null : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, depth + 1));
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object') {
    const src = typeof value.toObject === 'function' ? value.toObject() : value;
    if (src && src._bsontype) {
      return String(src);
    }
    const out = {};
    for (const [k, v] of Object.entries(src)) {
      if (!SECRET_KEYS.has(k)) {
        out[k] = scrub(v, depth + 1);
      }
    }
    return out;
  }
  return value;
};

const setAudit = (res, info) => {
  res.locals.audit = { ...(res.locals.audit || {}), ...info };
};

const auditMiddleware = (req, res, next) => {
  if (!MUTATING.has(req.method)) {
    return next();
  }
  const path = req.originalUrl.split('?')[0];
  const body = req.body;

  res.on('finish', () => {
    if (!req.crmMember || res.statusCode < 200 || res.statusCode >= 300) {
      return;
    }
    const a = res.locals.audit || {};
    const record = {
      memberId: req.crmMember.id,
      at: new Date(),
      action: a.action || `${req.method} ${path}`,
      entity: a.entity || null,
      entityId: a.entityId ? String(a.entityId) : null,
      diff: {
        before: scrub(a.before === undefined ? null : a.before),
        after: scrub(a.after === undefined ? body : a.after),
      },
    };
    Promise.resolve()
      .then(() => CrmAudit.create(record))
      .catch((err) => {
        logger.error('CRM audit write failed', { message: err.message, action: record.action });
      });
  });

  return next();
};

module.exports = { auditMiddleware, setAudit, scrub };
