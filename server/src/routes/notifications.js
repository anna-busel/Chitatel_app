const { Router } = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const User = require('../models/User');
const Notification = require('../models/Notification');

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
    // Один токен = одно устройство: снимаем его у других юзеров (иначе после
    // смены аккаунта на телефоне предыдущий владелец получал бы чужие пуши).
    await User.updateMany(
      { pushToken: req.body.pushToken, _id: { $ne: req.user.userId } },
      { $unset: { pushToken: 1 } }
    );
    await User.updateOne(
      { _id: req.user.userId },
      { $set: { pushToken: req.body.pushToken } }
    );
    return success(res, { message: 'Токен зарегистрирован' });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/notifications?page=&limit=
 * Лента уведомлений (экран 4.30), новые сверху, + число непрочитанных.
 */
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const skip = (page - 1) * limit;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: req.user.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments({ userId: req.user.userId, isRead: false }),
    ]);

    return success(res, { notifications, unreadCount });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Отметить все уведомления прочитанными.
 * Объявлено ВЫШЕ /:id/read — '/read-all' одним сегментом, конфликта нет.
 */
router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user.userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return success(res, { message: 'Все уведомления прочитаны' });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Отметить одно уведомление прочитанным.
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('NOT_FOUND', 'Неверный id', 400);
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    ).lean();

    if (!notification) {
      throw new AppError('NOT_FOUND', 'Уведомление не найдено', 404);
    }

    return success(res, { notification });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
