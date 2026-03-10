const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('./error');

/**
 * JWT verify middleware
 * Проверяет Authorization: Bearer <token>
 * Кладёт decoded payload в req.user
 */
const requireAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('UNAUTHORIZED', 'Токен не предоставлен', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('UNAUTHORIZED', 'Токен истёк', 401));
    }
    return next(new AppError('UNAUTHORIZED', 'Невалидный токен', 401));
  }
};

/**
 * Опциональная авторизация — не блокирует, но парсит токен если есть
 */
const optionalAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
  } catch (_err) {
    req.user = null;
  }

  return next();
};

module.exports = { requireAuth, optionalAuth };
