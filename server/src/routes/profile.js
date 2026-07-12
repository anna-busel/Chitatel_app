const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const User = require('../models/User');

const router = Router();

router.use(requireAuth);

// Поля, которые НИКОГДА не уходят клиенту.
const HIDDEN_FIELDS = '-passwordHash -refreshTokens';

/**
 * GET /api/profile
 * Профиль текущего пользователя (экран 4.27, задача 6.2).
 *
 * Отдаём всё, что нужно экрану профиля и его подэкранам: имя/почта/аватар,
 * подписка (статус, план, до какого числа), согласие на ИИ, настройки push.
 */
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select(HIDDEN_FIELDS)
      .lean();

    if (!user || user.isDeleted) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    return success(res, { user });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/profile
 * Редактирование профиля (экран 4.46).
 *
 * Меняются только имя и город. Почта не меняется: у Apple/Google-входа она
 * приходит от провайдера, у email-входа это логин — смена логина отдельная
 * история с подтверждением, в MVP её нет.
 *
 * Аватар — отдельная задача: загрузка файла (multipart) не сделана, экран
 * редактирования показывает инициал. Появится вместе с push-волной (6Б).
 */
const updateSchema = z.object({
  name: z.string().min(1, 'Имя обязательно').max(100).trim().optional(),
  city: z.string().max(100).trim().optional(),
});

router.patch('/', validate(updateSchema), async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.name === 'string') update.name = req.body.name;
    if (typeof req.body.city === 'string') update.city = req.body.city;

    if (Object.keys(update).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Нечего обновлять', 400);
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: update },
      { new: true }
    )
      .select(HIDDEN_FIELDS)
      .lean();

    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    return success(res, { user });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/profile/push-settings
 * Настройки уведомлений (экран 4.31).
 *
 * Сами уведомления отправляет push-сервис (задача 6.1) — он обязан читать эти
 * флаги перед отправкой. Пока push-сервиса нет, настройки просто сохраняются:
 * так экран настроек честный и не врёт пользователю, что что-то включено.
 */
const pushSettingsSchema = z.object({
  dailyQuote: z.boolean().optional(),
  newAudio: z.boolean().optional(),
  aiReady: z.boolean().optional(),
  chatMessages: z.boolean().optional(),
  weeklyReport: z.boolean().optional(),
  reminders: z.boolean().optional(),
});

router.patch(
  '/push-settings',
  validate(pushSettingsSchema),
  async (req, res, next) => {
    try {
      const update = {};
      for (const key of Object.keys(pushSettingsSchema.shape)) {
        if (typeof req.body[key] === 'boolean') {
          update[`pushSettings.${key}`] = req.body[key];
        }
      }

      if (Object.keys(update).length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Нечего обновлять', 400);
      }

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        { $set: update },
        { new: true }
      )
        .select(HIDDEN_FIELDS)
        .lean();

      if (!user) {
        throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
      }

      return success(res, { user });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/profile/survey
 * Ответы опроса при онбординге (экран 4.6, задача 6.3).
 *
 * Схема ответов свободная (Mixed в модели): вопросы могут меняться, ломать
 * миграциями из-за этого базу незачем. Ограничиваем только размер.
 */
const surveySchema = z.object({
  answers: z.record(z.any()),
});

router.post('/survey', validate(surveySchema), async (req, res, next) => {
  try {
    const { answers } = req.body;

    if (Object.keys(answers).length > 30) {
      throw new AppError('VALIDATION_ERROR', 'Слишком много ответов', 400);
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { surveyAnswers: answers } },
      { new: true }
    )
      .select(HIDDEN_FIELDS)
      .lean();

    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    return success(res, { user });
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/profile/ai-consent
 * Экран 4.7 (онбординг), модалка 4.42 и тумблер «ИИ-анализ» в профиле (4.27).
 *
 * 🔴 Apple 5.1.2(i): пока consent=false, ни одна цитата не уходит в OpenAI
 * (гард в ai.service.js + aiStatus='skipped' при сохранении цитаты).
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
      .select(HIDDEN_FIELDS)
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
