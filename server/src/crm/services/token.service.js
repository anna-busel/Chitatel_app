const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../../config');

/**
 * Токены CRM (CRM-PLAN A2). Отдельно от токенов приложения:
 *
 * - в каждом токене scope: 'crm' (или 'crm-2fa' для промежуточного токена
 *   между паролем и кодом 2FA);
 * - подписаны своими секретами (CRM_JWT_SECRET / CRM_JWT_REFRESH_SECRET,
 *   по умолчанию — производные от секретов приложения), так что токен
 *   приложения не проходит проверку подписи в CRM и наоборот;
 * - middleware приложения (middleware/auth.js) дополнительно отбивает любой
 *   токен со scope 'crm*', даже подписанный общим секретом.
 */
const CRM_SCOPE = 'crm';
const CRM_2FA_SCOPE = 'crm-2fa';

const crmJwt = {
  secret: process.env.CRM_JWT_SECRET || `${config.jwt.secret}:crm`,
  refreshSecret: process.env.CRM_JWT_REFRESH_SECRET || `${config.jwt.refreshSecret}:crm`,
  accessExpiresIn: '15m',
  refreshExpiresIn: '7d',
  pendingExpiresIn: '5m',
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccess = (member) =>
  jwt.sign(
    { memberId: String(member._id), role: member.role, scope: CRM_SCOPE },
    crmJwt.secret,
    { expiresIn: crmJwt.accessExpiresIn }
  );

const signRefresh = (member) =>
  jwt.sign(
    { memberId: String(member._id), scope: CRM_SCOPE, jti: crypto.randomUUID() },
    crmJwt.refreshSecret,
    { expiresIn: crmJwt.refreshExpiresIn }
  );

// Промежуточный токен «пароль верный, ждём код». setupSecret — новый секрет
// TOTP, если 2FA у участницы ещё не настроена.
const signPending = (member, setupSecret = null) =>
  jwt.sign(
    { memberId: String(member._id), scope: CRM_2FA_SCOPE, setupSecret },
    crmJwt.secret,
    { expiresIn: crmJwt.pendingExpiresIn }
  );

const verifyWithScope = (token, secret, scope) => {
  const decoded = jwt.verify(token, secret);
  if (!decoded || decoded.scope !== scope || !decoded.memberId) {
    throw new Error('wrong scope');
  }
  return decoded;
};

const verifyAccess = (token) => verifyWithScope(token, crmJwt.secret, CRM_SCOPE);
const verifyRefresh = (token) => verifyWithScope(token, crmJwt.refreshSecret, CRM_SCOPE);
const verifyPending = (token) => verifyWithScope(token, crmJwt.secret, CRM_2FA_SCOPE);

module.exports = {
  CRM_SCOPE,
  CRM_2FA_SCOPE,
  crmJwt,
  hashToken,
  signAccess,
  signRefresh,
  signPending,
  verifyAccess,
  verifyRefresh,
  verifyPending,
};
