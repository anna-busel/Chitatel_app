const rateLimit = require('express-rate-limit');

// Единый формат ответа при превышении лимита (формат ошибок проекта).
const RATE_LIMITED_MESSAGE = {
  success: false,
  error: {
    code: 'RATE_LIMITED',
    message: 'Слишком много запросов. Подождите минуту',
    details: {},
  },
};

// Фабрика: все лимитеры — окно 1 мин / IP, стандартные заголовки RateLimit-*.
function makeLimiter(max, extra = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: RATE_LIMITED_MESSAGE,
    ...extra,
  });
}

/**
 * Rate limiter для auth endpoints (login/register/apple/google)
 * MASTER 12.2: 10 запросов / мин с IP
 */
const authLimiter = makeLimiter(10);

// /api/auth/refresh — мягче: приложение обновляет токен часто (несколько
// экранов/сокет), 10/мин ловило легитимных юзеров.
const refreshLimiter = makeLimiter(60);

// Общий лимит на /api (кроме /api/webhooks — Apple шлёт пачками, их не режем).
const apiLimiter = makeLimiter(300, {
  skip: (req) => req.path.startsWith('/webhooks'),
});

// Загрузки (картинка/голосовое в чат, аватар) — тяжёлые, строже.
const uploadLimiter = makeLimiter(20);

// Жалобы (на сообщение / на пользователя) — от спама жалобами.
const reportLimiter = makeLimiter(10);

// Пароль (UPDATES-PLAN P1/P2, 05.11.2026): запрос кода на почту — 5/мин с IP
// (плюс пауза 60 с на одну почту внутри ручки), ввод кода и смена пароля —
// 10/мин с IP, против перебора 6-значного кода.
const forgotPasswordLimiter = makeLimiter(5);
const passwordLimiter = makeLimiter(10);

module.exports = {
  authLimiter,
  refreshLimiter,
  apiLimiter,
  uploadLimiter,
  reportLimiter,
  forgotPasswordLimiter,
  passwordLimiter,
};
