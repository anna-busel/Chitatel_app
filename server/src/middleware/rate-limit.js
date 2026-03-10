const rateLimit = require('express-rate-limit');

/**
 * Rate limiter для auth endpoints
 * MASTER 12.2: 10 запросов / мин с IP
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Слишком много запросов. Подождите минуту',
      details: {},
    },
  },
});

module.exports = { authLimiter };
