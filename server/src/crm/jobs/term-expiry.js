const cron = require('node-cron');
const logger = require('../../config/logger');
const { expireTerms } = require('../services/access.service');

/**
 * Срок доступа по заказам CRM (CRM-PLAN B2, 05.11.2026): разборы и пакеты с
 * term «до даты» / «N мес. с оплаты» закрываются после срока. Раз в день в
 * 03:10 по времени сервера; повтор безопасен (termExpiredAt).
 * ⚠️ PM2 — 1 инстанс, иначе cron задвоится (как остальные jobs).
 */
function scheduleCrmTermExpiry() {
  cron.schedule('10 3 * * *', () => {
    expireTerms(new Date())
      .then((n) => {
        if (n) {logger.info('CRM term expiry: доступ снят', { orders: n });}
      })
      .catch((err) => logger.error('CRM term expiry cron error', { message: err.message }));
  });
  logger.info('CRM term expiry cron scheduled: daily 03:10');
}

module.exports = { scheduleCrmTermExpiry };
