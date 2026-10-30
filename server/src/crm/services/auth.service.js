const bcrypt = require('bcryptjs');
const CrmMember = require('../models/CrmMember');
const { AppError } = require('../../middleware/error');
const tokens = require('./token.service');
const { permsOf } = require('./permissions');

/**
 * Вход команды в CRM (CRM-PLAN A2): пароль → код 2FA (TOTP) → пара токенов.
 *
 * 2FA обязательна для всех. Если у участницы ещё нет totpSecret, после
 * верного пароля сервер отдаёт новый секрет (и otpauth-ссылку для QR);
 * секрет сохраняется только после первого верного кода.
 */
const BCRYPT_ROUNDS = 12;
const MAX_REFRESH_TOKENS = 5;
const TOTP_ISSUER = 'ЧИТАТЕЛЬ CRM';

// window: 1 — принимаем соседний 30-секундный шаг (расхождение часов).
// otplib грузим лениво: если на сервере забыли npm install после деплоя,
// упадёт только вход в CRM, а не весь API приложения.
let cachedAuthenticator = null;
function getAuthenticator() {
  if (!cachedAuthenticator) {
    // eslint-disable-next-line global-require
    const { authenticator: base } = require('otplib');
    cachedAuthenticator = base.clone({ window: 1 });
  }
  return cachedAuthenticator;
}

const invalidCredentials = () =>
  new AppError('CRM_AUTH_INVALID', 'Неверная почта или пароль', 401);

const publicMember = (member) => ({
  id: String(member._id),
  name: member.name,
  email: member.email,
  role: member.role,
  perms: permsOf(member.role),
  lastAt: member.lastAt || null,
});

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

/**
 * POST /api/crm/auth/login { email, password }
 * → { twoFactor: 'required', tempToken }
 * | { twoFactor: 'setup', tempToken, secret, otpauthUrl }
 */
const login = async ({ email, password }) => {
  const member = await CrmMember.findOne({ email: String(email).toLowerCase().trim() })
    .select('+passwordHash +totpSecret');

  if (!member || !member.active) {
    throw invalidCredentials();
  }
  const ok = await bcrypt.compare(password, member.passwordHash);
  if (!ok) {
    throw invalidCredentials();
  }

  if (member.totpSecret) {
    return { twoFactor: 'required', tempToken: tokens.signPending(member) };
  }

  const secret = getAuthenticator().generateSecret();
  return {
    twoFactor: 'setup',
    tempToken: tokens.signPending(member, secret),
    secret,
    otpauthUrl: getAuthenticator().keyuri(member.email, TOTP_ISSUER, secret),
  };
};

const issueTokens = async (member) => {
  const accessToken = tokens.signAccess(member);
  const refreshToken = tokens.signRefresh(member);
  const list = (member.refreshTokens || []).concat(tokens.hashToken(refreshToken));
  member.refreshTokens = list.slice(-MAX_REFRESH_TOKENS);
  member.lastAt = new Date();
  await member.save();
  return { accessToken, refreshToken };
};

/**
 * POST /api/crm/auth/2fa { tempToken, code } → { accessToken, refreshToken, member }
 */
const verify2fa = async ({ tempToken, code }) => {
  let pending;
  try {
    pending = tokens.verifyPending(tempToken);
  } catch (_err) {
    throw new AppError('CRM_2FA_EXPIRED', 'Время на ввод кода истекло, войдите заново', 401);
  }

  const member = await CrmMember.findById(pending.memberId)
    .select('+totpSecret +refreshTokens');
  if (!member || !member.active) {
    throw invalidCredentials();
  }

  // Настройка 2FA возможна, только пока секрета нет (иначе промежуточный
  // токен со старым setupSecret перезаписал бы уже настроенную 2FA).
  let secret = member.totpSecret;
  if (pending.setupSecret) {
    if (member.totpSecret) {
      throw new AppError('CRM_2FA_EXPIRED', '2FA уже настроена, войдите заново', 401);
    }
    secret = pending.setupSecret;
  }
  if (!secret) {
    throw new AppError('CRM_2FA_EXPIRED', 'Войдите заново', 401);
  }

  if (!getAuthenticator().check(String(code).replace(/\s/g, ''), secret)) {
    throw new AppError('CRM_2FA_INVALID', 'Неверный код', 401);
  }

  if (pending.setupSecret) {
    member.totpSecret = secret;
  }
  const pair = await issueTokens(member);
  return { ...pair, member: publicMember(member) };
};

/**
 * POST /api/crm/auth/refresh { refreshToken } → { accessToken, refreshToken }
 * Ротация: старый refresh заменяется новым. Повтор уже использованного
 * токена (возможная кража) — сбрасываем все сессии участницы.
 */
const refresh = async ({ refreshToken }) => {
  let decoded;
  try {
    decoded = tokens.verifyRefresh(refreshToken);
  } catch (_err) {
    throw new AppError('CRM_REFRESH_EXPIRED', 'Сессия истекла, войдите заново', 401);
  }

  const member = await CrmMember.findById(decoded.memberId).select('+refreshTokens');
  if (!member || !member.active) {
    throw new AppError('CRM_REFRESH_EXPIRED', 'Сессия истекла, войдите заново', 401);
  }

  const hash = tokens.hashToken(refreshToken);
  const list = member.refreshTokens || [];
  if (!list.includes(hash)) {
    member.refreshTokens = [];
    await member.save();
    throw new AppError('CRM_REFRESH_EXPIRED', 'Сессия истекла, войдите заново', 401);
  }

  member.refreshTokens = list.filter((h) => h !== hash);
  return issueTokens(member);
};

module.exports = {
  getAuthenticator,
  hashPassword,
  publicMember,
  login,
  verify2fa,
  refresh,
};
