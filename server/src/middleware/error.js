const logger = require('../config/logger');

/**
 * Global error handler (Express)
 * Должен быть последним middleware в цепочке
 */
const errorHandler = (err, _req, res, _next) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = {};
    for (const field of Object.keys(err.errors)) {
      details[field] = err.errors[field].message;
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Невалидные данные',
        details,
      },
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_KEY',
        message: `${field} уже существует`,
        details: { field },
      },
    });
  }

  // AppError (наши кастомные ошибки)
  if (err.isAppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || {},
      },
    });
  }

  // Всё остальное — 500
  return res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: 'Внутренняя ошибка сервера',
      details: {},
    },
  });
};

/**
 * Кастомная ошибка приложения
 */
class AppError extends Error {
  constructor(code, message, statusCode = 400, details = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isAppError = true;
  }
}

module.exports = { errorHandler, AppError };
