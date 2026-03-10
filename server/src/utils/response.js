/**
 * Стандартный успешный ответ
 * @param {object} res - Express response
 * @param {object} data - Данные ответа
 * @param {number} statusCode - HTTP статус (default 200)
 */
const success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
  });
};

/**
 * Стандартный ответ с пагинацией
 * @param {object} res - Express response
 * @param {object} options - { items, total, page, limit }
 */
const paginated = (res, { items, total, page, limit }) => {
  return res.status(200).json({
    success: true,
    data: {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    },
  });
};

/**
 * Стандартный ответ с ошибкой
 * @param {object} res - Express response
 * @param {string} code - Код ошибки (MASTER 7.5)
 * @param {string} message - Человеко-читаемое сообщение
 * @param {number} statusCode - HTTP статус
 * @param {object} details - Дополнительные детали
 */
const error = (res, code, message, statusCode = 400, details = {}) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
};

module.exports = { success, paginated, error };
