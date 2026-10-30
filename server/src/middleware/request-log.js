const logger = require('../config/logger');

/**
 * Лог отказов 4xx по API (UPDATES-PLAN B3).
 *
 * Раньше в pm2 попадали только 500, а 403/429 не было видно (скрин реакции
 * 24.10). Пишем logger.warn на каждый ответ 400–499: метод, путь без query,
 * статус, код ошибки из тела ответа (error.code) и id пользователя, если
 * запрос был авторизован. Тело запроса и остальное тело ответа НЕ пишем.
 *
 * Код ошибки берём, подменяя res.json: ответы об ошибках у нас все идут
 * через res.json ({ success:false, error:{ code } }) — errorHandler,
 * 404-обработчик и rate-limit.
 */
function logClientErrors(req, res, next) {
  let errorCode = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && body.error && typeof body.error.code === 'string') {
      errorCode = body.error.code;
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 400 || res.statusCode >= 500) {
      return;
    }
    logger.warn('API 4xx', {
      method: req.method,
      path: (req.originalUrl || req.url || '').split('?')[0],
      status: res.statusCode,
      code: errorCode,
      userId: req.user && req.user.userId ? String(req.user.userId) : null,
    });
  });

  return next();
}

module.exports = { logClientErrors };
