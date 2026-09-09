const logger = require('../config/logger');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const googlePlay = require('./google-play.service');
const { applyTransaction, userIdFromAppAccountToken } = require('./purchase.service');

/**
 * Real-time Developer Notifications от Google Play (задача E5 ANDROID-PLAN).
 * Аналог App Store Server Notifications: продления, отмены, возвраты,
 * приостановки — всё, что происходит с покупкой БЕЗ участия приложения.
 *
 * Google присылает уведомление через Pub/Sub: в теле запроса лежит
 * { message: { data: <base64> } }, внутри — DeveloperNotification.
 *
 * ⚠️ Ключевое отличие от Apple: уведомление Google НЕ содержит состояния
 * покупки — только её токен и тип события. Поэтому на каждое уведомление мы
 * заново спрашиваем у Google текущее состояние и применяем ЕГО. Это надёжнее
 * маппинга двух десятков типов событий: источник истины один, а гонки
 * (два уведомления подряд) не приводят к рассинхрону.
 */

/**
 * Кому принадлежит покупка. Сначала по сохранённой записи Purchase (её создал
 * verify при покупке), затем — по obfuscatedAccountId из ответа Google
 * (переустановка приложения, продление до первого запуска и т.п.).
 */
async function resolveUserId({ purchaseToken, tx }) {
  const purchase = await Purchase.findOne({ transactionId: purchaseToken })
    .select('userId')
    .lean();
  if (purchase) return purchase.userId;

  const candidateId = userIdFromAppAccountToken(tx && tx.appAccountToken);
  if (!candidateId) return null;

  const user = await User.findById(candidateId).select('_id').lean();
  return user ? user._id : null;
}

/** Подписка или разовая покупка: спрашиваем состояние и применяем. */
async function applyFromGoogle({ packageName, productId, purchaseToken, forceStatus }) {
  const { tx, statusOverride, gracePeriodExpiresAt } = await googlePlay.fetchPurchase({
    packageName,
    productId,
    purchaseToken,
  });
  if (!tx.productId) tx.productId = productId;

  const userId = await resolveUserId({ purchaseToken, tx });
  if (!userId) {
    logger.warn('Google webhook: покупка не найдена ни по токену, ни по аккаунту', {
      productId,
    });
    return false;
  }

  await applyTransaction({
    userId,
    decodedTransaction: tx,
    statusOverride: forceStatus || statusOverride,
    gracePeriodExpiresAt: forceStatus === 'refunded' ? null : gracePeriodExpiresAt,
    platform: 'google',
  });
  return true;
}

/**
 * Возврат денег. В уведомлении о возврате нет productId, поэтому берём его из
 * нашей записи Purchase. Состояние всё равно перезапрашиваем у Google — важны
 * даты покупки: по ним applyTransaction считает, какие клубные месяцы снять.
 * Если Google уже не отдаёт покупку, откатываемся на сохранённую дату.
 */
async function handleVoided({ packageName, voided }) {
  const purchaseToken = voided.purchaseToken;
  const purchase = await Purchase.findOne({ transactionId: purchaseToken })
    .select('userId appleProductId purchasedAt')
    .lean();

  if (!purchase) {
    logger.warn('Google webhook: возврат по неизвестной покупке');
    return false;
  }

  try {
    return await applyFromGoogle({
      packageName,
      productId: purchase.appleProductId,
      purchaseToken,
      forceStatus: 'refunded',
    });
  } catch (err) {
    logger.warn('Google webhook: состояние возвращённой покупки недоступно, применяем по своим данным', {
      message: err.message,
    });
    await applyTransaction({
      userId: purchase.userId,
      decodedTransaction: {
        productId: purchase.appleProductId,
        transactionId: purchaseToken,
        originalTransactionId: purchaseToken,
        purchaseDate: purchase.purchasedAt ? purchase.purchasedAt.getTime() : undefined,
      },
      statusOverride: 'refunded',
      gracePeriodExpiresAt: null,
      platform: 'google',
    });
    return true;
  }
}

/**
 * Обрабатывает одно уведомление Pub/Sub.
 * @param {object} body — тело запроса от Pub/Sub
 */
async function handleNotification(body) {
  const data = body && body.message && body.message.data;
  if (!data) {
    logger.info('Google webhook: сообщение без данных');
    return;
  }

  let notification;
  try {
    notification = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch (err) {
    logger.warn('Google webhook: не удалось разобрать сообщение', { message: err.message });
    return;
  }

  const packageName = notification.packageName;

  if (notification.testNotification) {
    logger.info('Google webhook: тестовое уведомление получено', { packageName });
    return;
  }

  if (notification.subscriptionNotification) {
    const n = notification.subscriptionNotification;
    const applied = await applyFromGoogle({
      packageName,
      productId: n.subscriptionId,
      purchaseToken: n.purchaseToken,
    });
    logger.info('Google webhook: подписка обработана', {
      notificationType: n.notificationType,
      productId: n.subscriptionId,
      applied,
    });
    return;
  }

  if (notification.oneTimeProductNotification) {
    const n = notification.oneTimeProductNotification;
    const applied = await applyFromGoogle({
      packageName,
      productId: n.sku,
      purchaseToken: n.purchaseToken,
    });
    logger.info('Google webhook: разовая покупка обработана', {
      notificationType: n.notificationType,
      productId: n.sku,
      applied,
    });
    return;
  }

  if (notification.voidedPurchaseNotification) {
    const applied = await handleVoided({
      packageName,
      voided: notification.voidedPurchaseNotification,
    });
    logger.info('Google webhook: возврат обработан', { applied });
    return;
  }

  logger.info('Google webhook: уведомление без известной секции', {
    keys: Object.keys(notification),
  });
}

module.exports = { handleNotification };
