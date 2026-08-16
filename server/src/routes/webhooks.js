const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { success } = require('../utils/response');
const logger = require('../config/logger');
const webhookService = require('../services/webhook.service');

const router = Router();

/**
 * POST /api/webhooks/apple
 * App Store Server Notifications V2. Apple вызывает напрямую — БЕЗ нашей
 * авторизации; подлинность проверяется подписью (verifyAndDecodeNotification).
 * URL регистрируется в App Store Connect → App → App Information.
 * Body: { signedPayload: string }
 */
const notificationSchema = z.object({
  signedPayload: z.string().min(1),
});

router.post('/apple', validate(notificationSchema), async (req, res) => {
  // M17: «не наша транзакция» / невалидная подпись — 200 (иначе Apple ретраит
  // бесконечно; такие случаи handleNotification логирует и просто выходит).
  // ВНУТРЕННЯЯ ошибка (исключение в обработчике, БД недоступна) — 500, чтобы
  // Apple повторила уведомление и мы не потеряли продление/refund.
  try {
    await webhookService.handleNotification(req.body.signedPayload);
  } catch (err) {
    // VerificationException из @apple/app-store-server-library: name не
    // переопределён, признак — числовое поле status (0..5) и это не AppError.
    if (err && typeof err.status === 'number' && !err.isAppError) {
      // Подпись/окружение не прошли проверку — не наш чек, ретрай не нужен.
      logger.warn('Apple webhook: невалидная подпись', {
        message: err.message,
        status: err.status,
      });
      return success(res, { received: true });
    }
    logger.error('Apple webhook handling failed', { message: err.message });
    return res.status(500).json({ success: false, error: 'WEBHOOK_INTERNAL_ERROR' });
  }
  return success(res, { received: true });
});

module.exports = router;
