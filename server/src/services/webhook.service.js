const logger = require('../config/logger');
const Purchase = require('../models/Purchase');
const { getVerifier, applyTransaction } = require('./purchase.service');

/**
 * Обработка App Store Server Notifications V2 (задача 3.4).
 * Apple шлёт подписанные уведомления о жизненном цикле подписки.
 */

// Типы, после которых доступ отзывается / истекает.
const REVOKE_TYPES = new Set(['REFUND', 'REVOKE']);
const EXPIRE_TYPES = new Set(['EXPIRED', 'GRACE_PERIOD_EXPIRED']);

/**
 * Верифицирует и обрабатывает одно уведомление Apple.
 * @param {string} signedPayload — подписанный payload из тела запроса Apple
 */
async function handleNotification(signedPayload) {
  const verifier = getVerifier();

  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  const { notificationType, subtype, data } = notification;

  if (!data || !data.signedTransactionInfo) {
    logger.info('Apple webhook: уведомление без транзакции', { notificationType, subtype });
    return;
  }

  const tx = await verifier.verifyAndDecodeTransaction(data.signedTransactionInfo);
  const originalTransactionId = tx.originalTransactionId || tx.transactionId;

  // Кому принадлежит покупка — по уже сохранённой записи (verify создал её при покупке).
  const purchase = await Purchase.findOne({ transactionId: originalTransactionId })
    .select('userId')
    .lean();

  if (!purchase) {
    logger.warn('Apple webhook: покупка не найдена', { notificationType, originalTransactionId });
    return; // подтверждаем приём (200), чтобы Apple не ретраил бесконечно
  }

  let statusOverride = null;
  if (REVOKE_TYPES.has(notificationType)) statusOverride = 'refunded';
  else if (EXPIRE_TYPES.has(notificationType)) statusOverride = 'expired';
  // DID_RENEW / SUBSCRIBED / DID_CHANGE_* — статус считается по expiresDate в applyTransaction.

  await applyTransaction({
    userId: purchase.userId,
    decodedTransaction: tx,
    statusOverride,
  });

  logger.info('Apple webhook обработан', { notificationType, subtype, originalTransactionId });
}

module.exports = { handleNotification };
