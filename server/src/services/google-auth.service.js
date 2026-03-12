const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const { AppError } = require('../middleware/error');

const client = new OAuth2Client(config.google.clientId);

/**
 * Генерация пары токенов (access + refresh)
 * Дублирует auth.service.js — в будущем вынести в utils/tokens.js
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
 * POST /api/auth/google
 * MASTER 7.4: { idToken } → { accessToken, refreshToken, user, isNewUser }
 *
 * 1. Верифицировать idToken через Google OAuth2Client
 * 2. Извлечь email, name, picture
 * 3. Найти/создать User с googleUserId
 * 4. Выдать JWT tokens
 */
const authenticateWithGoogle = async ({ idToken }) => {
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });
  } catch (_err) {
    throw new AppError('AUTH_GOOGLE_FAILED', 'Не удалось верифицировать Google токен', 401);
  }

  const payload = ticket.getPayload();
  if (!payload) {
    throw new AppError('AUTH_GOOGLE_FAILED', 'Google токен не содержит данных', 401);
  }

  const { sub: googleUserId, email, name, picture } = payload;

  if (!email) {
    throw new AppError('AUTH_GOOGLE_FAILED', 'Google аккаунт не содержит email', 401);
  }

  // Ищем существующего пользователя по googleUserId
  let user = await User.findOne({ googleUserId, isDeleted: false });
  let isNewUser = false;

  if (!user) {
    // Ищем по email — возможно уже зарегистрирован через email/apple
    user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });

    if (user) {
      // Привязываем Google к существующему аккаунту
      user.googleUserId = googleUserId;
      if (!user.avatarUrl && picture) {
        user.avatarUrl = picture;
      }
    } else {
      // Создаём нового пользователя
      isNewUser = true;
      user = new User({
        email: email.toLowerCase(),
        name: name || 'Пользователь',
        avatarUrl: picture || null,
        authProvider: 'google',
        googleUserId,
        referralCode: generateReferralCode(),
      });
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

module.exports = { authenticateWithGoogle };
