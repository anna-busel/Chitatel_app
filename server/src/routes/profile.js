const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const { z } = require('zod');
const multer = require('multer');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const imageService = require('../services/image.service');
const User = require('../models/User');

const router = Router();

router.use(requireAuth);

// Поля, которые НИКОГДА не уходят клиенту.
const HIDDEN_FIELDS = '-passwordHash -refreshTokens';

// Аватар грузим в память, потом пишем на диск (как картинки чата).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageService.MAX_FILE_SIZE_BYTES },
});

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
 * Редактирование профиля (экран 4.46) и шаги онбординга «Имя» и «Страна/город/
 * рассылка» (задача 6.3).
 *
 * Аккаунтная почта (email) не меняется: у Apple/Google-входа она приходит от
 * провайдера, у email-входа это логин — смена логина отдельная история с
 * подтверждением, в MVP её нет. Почта для рассылки (marketingEmail) — отдельное
 * необязательное поле, к логину отношения не имеет.
 */
const updateSchema = z.object({
  name: z.string().min(1, 'Имя обязательно').max(100).trim().optional(),
  country: z.string().max(100).trim().optional(),
  city: z.string().max(100).trim().optional(),
  marketingEmail: z.string().max(200).trim().email('Некорректный email').optional(),
  marketingConsent: z.boolean().optional(),
});

router.patch('/', validate(updateSchema), async (req, res, next) => {
  try {
    const update = {};
    if (typeof req.body.name === 'string') update.name = req.body.name;
    if (typeof req.body.country === 'string') update.country = req.body.country;
    if (typeof req.body.city === 'string') update.city = req.body.city;
    if (typeof req.body.marketingEmail === 'string') {
      update.marketingEmail = req.body.marketingEmail;
    }
    if (typeof req.body.marketingConsent === 'boolean') {
      update.marketingConsent = req.body.marketingConsent;
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
});

/**
 * POST /api/profile/avatar
 * Загрузить фото профиля (multipart/form-data, поле "avatar").
 *
 * Экран 4.46 (камера/галерея). Аватар нужен не только в профиле: он лежит в
 * User.avatarUrl, а этот же документ попадает в снапшот автора КАЖДОГО
 * сообщения чата — значит после загрузки лицо участницы сразу появляется
 * напротив её реплик, без изменений в коде чата.
 *
 * Хранение — та же инфраструктура, что у картинок чата: файл на диске под
 * AUDIO_BASE_PATH/avatars/<userId>/<uuid>.<ext>, ссылка — signed URL с
 * фиксированным exp (стабильный URL → клиент кэширует, аватар не мигает).
 *
 * Старый файл аватара удаляем: иначе диск VPS будет копить мусор при каждой
 * смене фото.
 */
router.post('/avatar', upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'Файл не передан', 400);
    }

    const ext = imageService.ALLOWED_MIME.get(req.file.mimetype);
    if (!ext) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Недопустимый тип файла. Разрешены JPEG, PNG, WEBP, HEIC',
        400
      );
    }

    const userId = req.user.userId;

    const dir = imageService.avatarsDir(userId);
    await fs.promises.mkdir(dir, { recursive: true });

    const fileName = imageService.generateImageFileName(ext);
    const fullPath = path.join(dir, fileName);
    await fs.promises.writeFile(fullPath, req.file.buffer);

    const relPath = imageService.relativeAvatarPath(userId, fileName);
    const avatarUrl = imageService.generateImageSignedUrl(relPath);

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { avatarUrl, avatarStoragePath: relPath } },
      { new: true }
    )
      .select(HIDDEN_FIELDS)
      .lean();

    if (!user) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    // Чистим предыдущие файлы аватара этого юзера (кроме только что записанного).
    try {
      const files = await fs.promises.readdir(dir);
      await Promise.all(
        files
          .filter((f) => f !== fileName)
          .map((f) => fs.promises.unlink(path.join(dir, f)).catch(() => null))
      );
    } catch (_e) {
      // Не критично: не смогли подчистить — аватар всё равно обновлён.
    }

    return success(res, { user });
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('VALIDATION_ERROR', 'Файл больше 8 МБ', 400));
      }
      return next(new AppError('VALIDATION_ERROR', 'Ошибка загрузки файла', 400));
    }
    return next(err);
  }
});

/**
 * PATCH /api/profile/push-settings
 * Настройки уведомлений (экран 4.31).
 *
 * Сами уведомления отправляет push-сервис (задача 6.1) — он читает эти флаги
 * перед отправкой. reports — недельный + месячный отчёты; news — новости/анонсы.
 */
const pushSettingsSchema = z.object({
  dailyQuote: z.boolean().optional(),
  newAudio: z.boolean().optional(),
  aiReady: z.boolean().optional(),
  chatMessages: z.boolean().optional(),
  reports: z.boolean().optional(),
  news: z.boolean().optional(),
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
 *
 * Завершение опроса (в т.ч. «Пропустить» — тогда answers пустой) помечает
 * onboardingCompleted = true, поэтому персонализацию больше не показываем
 * (вариант А). Ответы уходят в контекст ИИ-анализа (ai.service.buildUserContext).
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
      { $set: { surveyAnswers: answers, onboardingCompleted: true } },
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
