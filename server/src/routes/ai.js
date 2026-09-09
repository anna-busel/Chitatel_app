const { Router } = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const logger = require('../config/logger');
const Quote = require('../models/Quote');
const Report = require('../models/Report');

const router = Router();

router.use(requireAuth);

/**
 * POST /api/ai/report — жалоба на ИИ-разбор цитаты (задача F1 ANDROID-PLAN,
 * требование Google R7: у приложений с генеративным ИИ должна быть кнопка
 * жалобы на сгенерированный контент ВНУТРИ приложения).
 *
 * Жалобы складываются в ту же коллекцию Report, что и жалобы на сообщения
 * чата (targetType='message'), — Анна разбирает их в одном списке админки.
 * targetType='ai_analysis', targetId — id цитаты: разбор живёт внутри неё
 * (Quote.aiAnalysis), отдельного документа у него нет.
 *
 * Жаловаться можно только на СВОЮ цитату: чужие разборы никому не видны.
 * Повторная жалоба на ту же цитату не создаёт дубль — уникальный индекс
 * (reporterUserId + targetType + targetId), отвечаем как на успешную.
 *
 * Body: { quoteId: string, reason?: string, comment?: string }
 */
const reportSchema = z.object({
  quoteId: z.string().refine((s) => mongoose.Types.ObjectId.isValid(s), {
    message: 'quoteId должен быть валидным id',
  }),
  reason: z
    .enum(['spam', 'inappropriate', 'offensive', 'copyright', 'other'])
    .default('inappropriate'),
  comment: z.string().max(500).trim().default(''),
});

router.post('/report', validate(reportSchema), async (req, res, next) => {
  try {
    const { quoteId, reason, comment } = req.body;
    const userId = req.user.userId;

    const quote = await Quote.findById(quoteId).select('userId aiAnalysis').lean();
    if (!quote || String(quote.userId) !== String(userId)) {
      throw new AppError('NOT_FOUND', 'Цитата не найдена', 404);
    }

    try {
      await Report.create({
        reporterUserId: userId,
        targetType: 'ai_analysis',
        targetId: quoteId,
        reason,
        comment,
      });
      logger.info('Жалоба на ИИ-разбор', { quoteId, reason });
    } catch (err) {
      // 11000 — уникальный индекс: на эту цитату этот человек уже жаловался.
      // Для пользователя это не ошибка: жалоба принята и лежит в очереди.
      if (err && err.code === 11000) {
        logger.info('Повторная жалоба на ИИ-разбор, дубль не создан', { quoteId });
      } else {
        throw err;
      }
    }

    return success(res, { message: 'Жалоба отправлена' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
