const fs = require('fs');
const appleSignin = require('apple-signin-auth');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../middleware/error');

/**
 * Генерация пары токенов (access + refresh)
 * Дублирует auth.service.js / google-auth.service.js — в будущем вынести в utils/tokens.js
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiresIn }
  );

  const refreshToken = jwt.sign(
    { userId, jti: crypto.randomUUID() },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

/**
 * Убрать чувствительные поля из user объекта
 */
const sanitizeUser = (user) => {
  const obj = user.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.appleRefreshToken;
  delete obj.__v;
  return obj;
};

/**
 * Генерация уникального реферального кода
 */
const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex');
};

/**
 * client_secret для серверных запросов к Apple (обмен кода, отзыв доступа).
 * Подписывается .p8-ключом Sign in with Apple (НЕ ключом покупок!).
 *
 * Возвращает null, если ключ не настроен — тогда обмен кода и revoke просто
 * не выполняются, а вход и удаление аккаунта продолжают работать.
 */
const getClientSecret = () => {
  const { teamId, keyId, privateKeyPath, clientId } = config.apple;
  if (!teamId || !keyId || !privateKeyPath) return null;

  let privateKey;
  try {
    privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  } catch (_err) {
    logger.warn('Apple private key file not readable', { privateKeyPath });
    return null;
  }

  try {
    return appleSignin.getClientSecret({
      clientID: clientId,
      teamID: teamId,
      privateKey,
      keyIdentifier: keyId,
    });
  } catch (err) {
    logger.warn('Failed to build Apple client secret', { message: err.message });
    return null;
  }
};

/**
 * Обменять authorizationCode (одноразовый, приходит от клиента при входе) на
 * refresh-токен Apple. Он нужен РОВНО для одного — отозвать доступ приложения
 * при удалении аккаунта (Apple 5.1.1(v) + требование revoke).
 *
 * Ошибки не пробрасываем: если обмен не удался (нет ключа, Apple недоступен),
 * вход всё равно должен пройти — пользователь не виноват.
 */
const exchangeAuthorizationCode = async (authorizationCode) => {
  if (!authorizationCode) return null;

  const clientSecret = getClientSecret();
  if (!clientSecret) return null;

  try {
    const response = await appleSignin.getAuthorizationToken(authorizationCode, {
      clientID: config.apple.clientId,
      clientSecret,
    });
    return response && response.refresh_token ? response.refresh_token : null;
  } catch (err) {
    logger.warn('Apple authorization code exchange failed', {
      message: err.message,
    });
    return null;
  }
};

/**
 * Отозвать доступ приложения у Apple (вызывается при удалении аккаунта).
 * Возвращает true если отзыв прошёл, false если нечего/нечем отзывать.
 */
const revokeAppleAccess = async (appleRefreshToken) => {
  if (!appleRefreshToken) return false;

  const clientSecret = getClientSecret();
  if (!clientSecret) {
    logger.warn('Apple revoke skipped — Sign in with Apple key not configured');
    return false;
  }

  try {
    await appleSignin.revokeAuthorizationToken(appleRefreshToken, {
      clientID: config.apple.clientId,
      clientSecret,
      tokenTypeHint: 'refresh_token',
    });
    return true;
  } catch (err) {
    logger.warn('Apple token revoke failed', { message: err.message });
    return false;
  }
};

/**
 * POST /api/auth/apple
 * MASTER 7.4: { identityToken, authorizationCode, fullName } → { accessToken, refreshToken, user, isNewUser }
 * MASTER 12.1: верификация identity token через Apple JWKS (public keys)
 *
 * 1. Верифицировать identityToken через публичные ключи Apple, audience = Bundle ID
 * 2. Извлечь sub (Apple user ID) и email (email приходит ТОЛЬКО при первой авторизации,
 *    может быть private relay xxx@privaterelay.appleid.com или вовсе отсутствовать)
 * 3. Имя (fullName) приходит от клиента ТОЛЬКО при первой авторизации — в identityToken его нет
 * 4. Найти/создать User с appleUserId = sub
 * 5. Обменять authorizationCode на refresh-токен Apple и сохранить его —
 *    понадобится, чтобы отозвать доступ при удалении аккаунта (Фаза 6, A2)
 * 6. Выдать JWT tokens
 */
const authenticateWithApple = async ({
  identityToken,
  authorizationCode,
  fullName,
}) => {
  let payload;
  try {
    payload = await appleSignin.verifyIdToken(identityToken, {
      audience: config.apple.clientId,
    });
  } catch (_err) {
    throw new AppError('AUTH_APPLE_FAILED', 'Не удалось верифицировать Apple токен', 401);
  }

  if (!payload || !payload.sub) {
    throw new AppError('AUTH_APPLE_FAILED', 'Apple токен не содержит данных', 401);
  }

  const appleUserId = payload.sub;
  const email = payload.email ? payload.email.toLowerCase() : null;

  // Обмен кода на refresh-токен Apple (для будущего revoke при удалении).
  // Код одноразовый и живёт 5 минут — обмениваем сразу при входе.
  const appleRefreshToken = await exchangeAuthorizationCode(authorizationCode);

  // Ищем существующего пользователя по appleUserId
  let user = await User.findOne({ appleUserId, isDeleted: false });
  let isNewUser = false;

  if (!user) {
    // email приходит только при первой авторизации — пробуем связать с существующим аккаунтом
    if (email) {
      user = await User.findOne({ email, isDeleted: false });
    }

    if (user) {
      // Привязываем Apple к существующему аккаунту (email/google)
      user.appleUserId = appleUserId;
    } else {
      // Создаём нового пользователя.
      // email НЕ пишем если его нет (private relay скрыт) — иначе конфликт sparse unique индекса
      isNewUser = true;
      const userData = {
        name: fullName || 'Пользователь',
        authProvider: 'apple',
        appleUserId,
        referralCode: generateReferralCode(),
      };
      if (email) {
        userData.email = email;
      }
      user = new User(userData);
    }
  }

  // Свежий refresh-токен Apple перезаписывает старый (если обмен удался).
  if (appleRefreshToken) {
    user.appleRefreshToken = appleRefreshToken;
  }

  const tokens = generateTokens(user._id || undefined);

  // Для нового пользователя — сначала сохранить чтобы получить _id
  if (isNewUser) {
    await user.save();
    const newTokens = generateTokens(user._id);
    user.refreshTokens = [newTokens.refreshToken];
    await user.save();

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      user: sanitizeUser(user),
      isNewUser: true,
    };
  }

  // Для существующего пользователя
  user.refreshTokens.push(tokens.refreshToken);
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }
  await user.save();

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: sanitizeUser(user),
    isNewUser: false,
  };
};

module.exports = { authenticateWithApple, revokeAppleAccess };
