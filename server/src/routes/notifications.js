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
 * Сохранить push-токен устройства (MASTER 7.9). Токен приходит с клиента после
 * выдачи разрешения на уведомления (экран 4.8) и при каждом обновлении токена.
 *
 * ⚠️ 09.09.2026 (задача C1 ANDROID-PLAN): токен пишется в User.devices —
 * список устройств с платформой, потому что у человека может быть и iPhone,
 * и андроид, а прежнее одно поле pushToken хранило только последний токен.
 * Для iOS токен ДОПОЛНИТЕЛЬНО дублируется в устаревшее pushToken: тогда
 * пуши на iPhone продолжат работать, даже если код придётся откатить назад.
 */
const registerSchema = z.object({
  pushToken: z.string().min(1).max(500).trim(),
  platform: z.enum(['ios', 'android']).default('ios'),
});

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { pushToken, platform } = req.body;
    const userId = req.user.userId;
    const now = new Date();

    // Один токен = одно устройство: снимаем его у других юзеров (иначе после
    // смены аккаунта на телефоне предыдущий владелец получал бы чужие пуши).
    // Два отдельных запроса, а не один с $or: иначе у чужого пользователя,
    // совпавшего только по devices, снялся бы его собственный старый pushToken.
    await User.updateMany(
      { _id: { $ne: userId }, 'devices.token': pushToken },
      { $pull: { devices: { token: pushToken } } }
    );
    await User.updateMany(
      { _id: { $ne: userId }, pushToken },
      { $unset: { pushToken: 1 } }
    );

    // Своё устройство: обновляем, если такой токен уже записан, иначе добавляем.
    const updated = await User.updateOne(
      { _id: userId, 'devices.token': pushToken },
      { $set: { 'devices.$.platform': platform, 'devices.$.updatedAt': now } }
    );
    const matched = updated.matchedCount != null ? updated.matchedCount : updated.n;
    if (!matched) {
      await User.updateOne(
        { _id: userId },
        { $push: { devices: { token: pushToken, platform, updatedAt: now } } }
      );
    }

    // Совместимость назад (см. комментарий у поля в models/User.js).
    if (platform === 'ios') {
      await User.updateOne({ _id: userId }, { $set: { pushToken } });
    }

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
