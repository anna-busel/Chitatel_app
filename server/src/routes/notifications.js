const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const User = require('../models/User');

const router = Router();

router.use(requireAuth);

/**
 * POST /api/notifications/register
 * Сохранить APNs-токен устройства (MASTER 7.9). Токен приходит с клиента после
 * выдачи разрешения на уведомления (экран 4.8) и при каждом обновлении токена.
 */
const registerSchema = z.object({
  pushToken: z.string().min(1).max(500).trim(),
  platform: z.enum(['ios', 'android']).default('ios'),
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    await User.updateOne(
      { _id: req.user.userId },
      { $set: { pushToken: req.body.pushToken } }
    );
    return success(res, { message: 'Токен зарегистрирован' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
