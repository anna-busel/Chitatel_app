const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const config = require('../config');
const { AppError } = require('../middleware/error');

const BCRYPT_ROUNDS = 12;

/**
 * Генерация пары токенов (access + refresh)
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
 * POST /api/auth/register
 * MASTER 7.4: { email, password, name } → { accessToken, refreshToken, user }
 */
const register = async ({ email, password, name }) => {
  const existingUser = await User.findOne({ email: email.toLowerCase(), isDeleted: false });
  if (existingUser) {
    throw new AppError('AUTH_EMAIL_EXISTS', 'Email уже зарегистрирован', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await User.create({
    email: email.toLowerCase(),
    name,
    passwordHash,
    authProvider: 'email',
    referralCode: generateReferralCode(),
  });

  const tokens = generateTokens(user._id);

  user.refreshTokens = [tokens.refreshToken];
  await user.save();

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: sanitizeUser(user),
  };
};

/**
 * POST /api/auth/login
 * MASTER 7.4: { email, password } → { accessToken, refreshToken, user }
 */
const login = async ({ email, password }) => {
  const user = await User.findOne({ email: email.toLowerCase(), isDeleted: false });

  if (!user || user.authProvider !== 'email' || !user.passwordHash) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Неверный email или пароль', 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Неверный email или пароль', 401);
  }

  const tokens = generateTokens(user._id);

  user.refreshTokens.push(tokens.refreshToken);
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }
  await user.save();

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: sanitizeUser(user),
  };
};

/**
 * POST /api/auth/refresh
 * MASTER 12.1: refresh rotation — каждый refresh выдаёт новую пару, старый инвалидируется
 */
const refresh = async ({ refreshToken }) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch (_err) {
    throw new AppError('AUTH_REFRESH_EXPIRED', 'Refresh token истёк', 401);
  }

  const user = await User.findById(decoded.userId);

  if (!user || user.isDeleted) {
    throw new AppError('AUTH_REFRESH_EXPIRED', 'Пользователь не найден', 401);
  }

  const tokenIndex = user.refreshTokens.indexOf(refreshToken);
  if (tokenIndex === -1) {
    user.refreshTokens = [];
    await user.save();
    throw new AppError('AUTH_REFRESH_EXPIRED', 'Refresh token инвалидирован', 401);
  }

  const tokens = generateTokens(user._id);

  user.refreshTokens.splice(tokenIndex, 1, tokens.refreshToken);
  await user.save();

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
};

/**
 * POST /api/auth/logout
 * Инвалидировать refresh token
 */
const logout = async ({ refreshToken, userId }) => {
  const user = await User.findById(userId);
  if (!user) {
    return;
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
  await user.save();
};

module.exports = { register, login, refresh, logout };
