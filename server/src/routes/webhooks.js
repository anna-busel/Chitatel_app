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
  // Всегда отвечаем 200, даже при внутренней ошибке обработки, чтобы Apple не
  // уходил в бесконечные ретраи. Ошибки логируем для ручного разбора.
  try {
    await webhookService.handleNotification(req.body.signedPayload);
  } catch (err) {
    logger.error('Apple webhook handling failed', { message: err.message });
  }
  return success(res, { received: true });
});

module.exports = router;
