const logger = require('../config/logger');
const Purchase = require('../models/Purchase');
const User = require('../models/User');
const {
  getVerifier,
  applyTransaction,
  userIdFromAppAccountToken,
} = require('./purchase.service');

/**
 * Обработка App Store Server Notifications V2 (задача 3.4).
 * Apple шлёт подписанные уведомления о жизненном цикле подписки.
 *
 * Фиксы аудита 07.07.2026:
 * - B2: fallback-маппинг «уведомление → юзер» по appAccountToken. Раньше юзер
 *   находился ТОЛЬКО по сохранённой записи Purchase (verify создал при
 *   покупке). Если сервер транзакцию не видел (переустановка приложения →
 *   автопродление ДО restore; family sharing; ASK_TO_BUY) — уведомление молча
 *   терялось и подписка в нашей БД не продлевалась. Теперь клиент при покупке
 *   передаёт appAccountToken (UUID, детерминированно из userId — см.
 *   userIdFromAppAccountToken в purchase.service), и webhook находит юзера по
 *   нему.
 * - B3: DID_FAIL_TO_RENEW → льготный период. Раньше тип игнорировался, и при
 *   неудачном списании (истёкшая карта, billing retry) подписчица теряла
 *   доступ мгновенно, хотя Apple ещё несколько дней пытается списать. Теперь
 *   из signedRenewalInfo берём gracePeriodExpiresDate и выставляем
 *   User.gracePeriodExpiresAt (его уже читают resolveClubAccess и
 *   checkClubAccess сокета). Оплата прошла / истекло окончательно — снимаем.
 *
 * userIdFromAppAccountToken перенесён в purchase.service (02.08.2026), чтобы
 * его переиспользовал и verify (защита от привязки чужого чека). Здесь —
 * ре-экспорт для обратной совместимости импортов.
 */

// Типы, после которых доступ отзывается / истекает.
const REVOKE_TYPES = new Set(['REFUND', 'REVOKE']);
const EXPIRE_TYPES = new Set(['EXPIRED', 'GRACE_PERIOD_EXPIRED']);
// Типы «оплата прошла» — льготный период (если был) снимается.
const RENEW_TYPES = new Set(['DID_RENEW', 'SUBSCRIBED']);

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

  // Кому принадлежит покупка:
  // 1) по уже сохранённой записи Purchase (verify создал её при покупке);
  // 2) fallback (B2) — по appAccountToken из транзакции, если записи нет
  //    (переустановка до restore, family sharing, ASK_TO_BUY).
  const purchase = await Purchase.findOne({ transactionId: originalTransactionId })
    .select('userId')
    .lean();

  let userId = purchase ? purchase.userId : null;

  if (!userId) {
    const candidateId = userIdFromAppAccountToken(tx.appAccountToken);
    if (candidateId) {
      const user = await User.findById(candidateId).select('_id').lean();
      if (user) {
        userId = user._id;
        logger.info('Apple webhook: юзер найден по appAccountToken', {
          notificationType,
          originalTransactionId,
        });
      }
    }
  }

  if (!userId) {
    logger.warn('Apple webhook: покупка не найдена (нет Purchase и appAccountToken)', {
      notificationType,
      originalTransactionId,
    });
    return; // подтверждаем приём (200), чтобы Apple не ретраил бесконечно
  }

  // Статус и льготный период по типу уведомления.
  // gracePeriodExpiresAt: undefined = не трогать, null = снять, Date = выставить
  // (семантика applyTransaction, фикс B3).
  let statusOverride = null;
  let gracePeriodExpiresAt;

  if (REVOKE_TYPES.has(notificationType)) {
    statusOverride = 'refunded';
    gracePeriodExpiresAt = null;
  } else if (EXPIRE_TYPES.has(notificationType)) {
    statusOverride = 'expired';
    gracePeriodExpiresAt = null;
  } else if (notificationType === 'DID_FAIL_TO_RENEW') {
    // Billing retry. Если Apple дал grace period — дата в signedRenewalInfo.
    let graceDate = null;
    if (data.signedRenewalInfo) {
      try {
        const renewalInfo = await verifier.verifyAndDecodeRenewalInfo(
          data.signedRenewalInfo
        );
        if (renewalInfo && renewalInfo.gracePeriodExpiresDate) {
          graceDate = new Date(renewalInfo.gracePeriodExpiresDate);
        }
      } catch (err) {
        logger.warn('Apple webhook: не удалось декодировать renewalInfo', {
          message: err.message,
        });
      }
    }

    if (graceDate && graceDate.getTime() > Date.now()) {
      // Grace активен: доступ сохраняем (status='active', хотя expiresDate
      // уже в прошлом) до gracePeriodExpiresAt. Когда grace кончится, Apple
      // пришлёт GRACE_PERIOD_EXPIRED / EXPIRED — тогда и закроем.
      statusOverride = 'active';
      gracePeriodExpiresAt = graceDate;
    } else {
      // Ретрай без grace (или дата в прошлом) — доступ считается по
      // expiresDate как обычно, льготный период снимаем.
      gracePeriodExpiresAt = null;
    }
  } else if (RENEW_TYPES.has(notificationType)) {
    // Оплата прошла — льготный период (если был) снимаем.
    gracePeriodExpiresAt = null;
  }
  // DID_CHANGE_* и прочие — статус считается по expiresDate в applyTransaction,
  // grace не трогаем (undefined).

  await applyTransaction({
    userId,
    decodedTransaction: tx,
    statusOverride,
    gracePeriodExpiresAt,
  });

  logger.info('Apple webhook обработан', { notificationType, subtype, originalTransactionId });
}

module.exports = { handleNotification, userIdFromAppAccountToken };
