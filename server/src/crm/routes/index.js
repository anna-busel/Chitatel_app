const express = require('express');
const { success } = require('../../utils/response');
const { requireCrm } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { permsOf } = require('../services/permissions');
const authRoutes = require('./auth');

/**
 * Корневой роутер CRM, монтируется в app.js: app.use('/api/crm', crmRouter).
 *
 * Порядок:
 *   1. /auth — без токена (вход, 2FA, refresh);
 *   2. requireCrm() — дальше только участницы команды с токеном CRM;
 *   3. auditMiddleware — журнал каждого изменяющего действия (A3);
 *   4. роуты разделов; право конкретного действия — requireCrm('perm')
 *      на самом роуте (матрица crm/services/permissions.js).
 */
const router = express.Router();

router.use('/auth', authRoutes);

router.use(requireCrm());
router.use(auditMiddleware);

// GET /api/crm/me — кто вошёл и что ей можно (меню фронта по роли).
router.get('/me', (req, res) => {
  const m = req.crmMember;
  return success(res, {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    perms: permsOf(m.role),
  });
});

module.exports = router;
