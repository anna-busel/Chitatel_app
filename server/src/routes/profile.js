const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const User = require('../models/User');

const router = Router();

router.use(requireAuth);

/**
 * PATCH /api/profile/ai-consent
 * Экран 4.7 (онбординг) и модалка 4.42 / тумблер в профиле.
 *
 * 🔴 Apple 5.1.2(i): пока consent=false, ни одна цитата не уходит в OpenAI
 * (гард в ai.service.js + aiStatus='skipped' при сохранении цитаты).
 *
 * Остальные эндпоинты профиля (GET/PATCH /api/profile, аватар, push-настройки)
 * — задача 6.2, здесь их сознательно нет.
 */
const consentSchema = z.object({
  consent: z.boolean(),
});

router.patch('/ai-consent', validate(consentSchema), async (req, res, next) => {
  try {
    const { consent } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { aiConsent: consent } },
      { new: true }
    )
      .select('-passwordHash -refreshTokens')
      .lean();

    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    return success(res, { user });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
