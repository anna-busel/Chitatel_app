const express = require('express');
const { success } = require('../../utils/response');
const { requireCrm } = require('../middleware/auth');
const { searchAll } = require('../services/search.service');

/**
 * Глобальный поиск в шапке (CRM-PLAN D8, 19.11.2026):
 *   GET /api/crm/search?q → { q, items: [{ kind: 'client'|'order', id, title, sub }] }
 * Всем ролям (просмотр клиенток и заказов открыт всем).
 */
const router = express.Router();

router.get('/', requireCrm(), async (req, res, next) => {
  try {
    return success(res, await searchAll(req.query.q));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
