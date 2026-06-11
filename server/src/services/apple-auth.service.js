const appleSignin = require('apple-signin-auth');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
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
 * POST /api/auth/apple
 * MASTER 7.4: { identityToken, authorizationCode, fullName } → { accessToken, refreshToken, user, isNewUser }
 * MASTER 12.1: верификация identity token через Apple JWKS (public keys)
 *
 * 1. Верифицировать identityToken через публичные ключи Apple, audience = Bundle ID
 * 2. Извлечь sub (Apple user ID) и email (email приходит ТОЛЬКО при первой авторизации,
 *    может быть private relay xxx@privaterelay.appleid.com или вовсе отсутствовать)
 * 3. Имя (fullName) приходит от клиента ТОЛЬКО при первой авторизации — в identityToken его нет
 * 4. Найти/создать User с appleUserId = sub
 * 5. Выдать JWT tokens
 */
const authenticateWithApple = async ({ identityToken, fullName }) => {
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

module.exports = { authenticateWithApple };
