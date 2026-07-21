const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const pushService = require('../services/push.service');

const router = Router();

// Все админ-эндпоинты требуют requireAuth + requireAdmin.
router.use(requireAuth, requireAdmin);

/**
 * POST /api/admin/push/send
 * Ручная отправка push (MASTER 9). Используется Анной для анонсов и для
 * проверки трубы push («послать себе»).
 *
 * audience:
 *  - 'me'          — только себе (тест канала, настройки игнорируются)
 *  - 'all'         — всем, у кого есть токен
 *  - 'subscribers' — только активным подписчикам
 *
 * Ручная рассылка не гейтится настройками контента (settingKey=null).
 */
const sendSchema = z.object({
  title: z.string().min(1).max(120).trim(),
  body: z.string().min(1).max(300).trim(),
  audience: z.enum(['me', 'all', 'subscribers']).default('me'),
});

router.post('/send', validate(sendSchema), async (req, res, next) => {
  try {
    const { title, body, audience } = req.body;
    const payload = { title, body, data: { type: 'admin' } };

    if (audience === 'me') {
      const ok = await pushService.sendToUser(req.user.userId, payload, null);
      return success(res, { sent: ok ? 1 : 0, total: 1 });
    }

    const result = await pushService.broadcast({ audience }, payload, null);
    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
