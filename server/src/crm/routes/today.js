const express = require('express');
const { success } = require('../../utils/response');
const { requireCrm } = require('../middleware/auth');
const { getToday } = require('../services/today.service');

/**
 * «Сегодня» (CRM-PLAN D7, 19.11.2026):
 *   GET /api/crm/today → { date, requireTransferConfirm, canConfirm,
 *     kpis: { unpaid, unlinked, inbox, tg }, tasks, unpaid, transfers,
 *     unlinked, tg, recent, store: { products, unmatchedCount, unmatched },
 *     journal (null без права «Настройки») }
 *
 * Всем ролям. Подтверждение перевода — в карточке заказа (D5).
 */
const router = express.Router();

router.get('/', requireCrm(), async (req, res, next) => {
  try {
    return success(res, await getToday(req.crmMember));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
