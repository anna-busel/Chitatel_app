const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { success } = require('../utils/response');
const logger = require('../config/logger');
const config = require('../config');
const webhookService = require('../services/webhook.service');
const googleWebhookService = require('../services/google-webhook.service');

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

/**
 * POST /api/webhooks/google?token=SECRET
 * Real-time Developer Notifications через Pub/Sub (задача E5 ANDROID-PLAN).
 *
 * Подлинность: у Google нет подписи тела, как у Apple, поэтому URL закрыт
 * общим секретом — он задаётся в GOOGLE_RTDN_SECRET и указывается в адресе
 * подписки Pub/Sub. Пока секрет не задан, роут отвечает 404: открытый
 * эндпоинт, дёргающий выдачу прав, держать нельзя.
 *
 * Коды ответа: 2xx — Pub/Sub считает сообщение доставленным; всё остальное —
 * повторит. Поэтому «покупка не наша» → 200 (иначе будет ретраить вечно), а
 * внутренняя ошибка → 500, чтобы уведомление о продлении не потерялось.
 */
router.post('/google', async (req, res) => {
  const secret = config.googlePlay.rtdnSecret;
  if (!secret) {
    logger.warn('Google webhook: GOOGLE_RTDN_SECRET не задан, запрос отклонён');
    return res.status(404).json({ success: false, error: 'NOT_FOUND' });
  }
  if (req.query.token !== secret) {
    logger.warn('Google webhook: неверный секрет в адресе');
    return res.status(403).json({ success: false, error: 'FORBIDDEN' });
  }

  try {
    await googleWebhookService.handleNotification(req.body);
  } catch (err) {
    logger.error('Google webhook handling failed', { message: err.message });
    return res.status(500).json({ success: false, error: 'WEBHOOK_INTERNAL_ERROR' });
  }
  return success(res, { received: true });
});

module.exports = router;
