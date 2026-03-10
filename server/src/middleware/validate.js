const { AppError } = require('./error');

/**
 * Zod validation middleware
 * @param {import('zod').ZodSchema} schema - Zod-схема
 * @param {'body'|'query'|'params'} source - откуда брать данные
 */
const validate = (schema, source = 'body') => {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join('.');
        details[field] = issue.message;
      }

      return next(new AppError(
        'VALIDATION_ERROR',
        'Невалидные данные',
        400,
        details
      ));
    }

    req[source] = result.data;
    return next();
  };
};

module.exports = { validate };
