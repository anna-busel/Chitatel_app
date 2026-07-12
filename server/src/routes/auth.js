const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const logger = require('../config/logger');
const authService = require('../services/auth.service');
const googleAuthService = require('../services/google-auth.service');
const appleAuthService = require('../services/apple-auth.service');
const User = require('../models/User');
const Quote = require('../models/Quote');
const WeeklyReport = require('../models/WeeklyReport');
const Progress = require('../models/Progress');

const router = Router();

/**
 * Zod-схемы валидации
 * MASTER 7.5: email format, password 8-72 символов, name 1-100 символов
 */
const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Пароль минимум 8 символов').max(72, 'Пароль максимум 72 символа'),
  name: z.string().min(1, 'Имя обязательно').max(100, 'Имя максимум 100 символов'),
});

const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token обязателен'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token обязателен'),
});

const googleSchema = z.object({
  idToken: z.string().min(1, 'Google ID token обязателен'),
});

const appleSchema = z.object({
  identityToken: z.string().min(1, 'Apple identity token обязателен'),
  authorizationCode: z.string().optional(),
  fullName: z.string().max(100, 'Имя максимум 100 символов').optional(),
});

/**
 * POST /api/auth/register
 * MASTER 7.4: { email, password, name } → { accessToken, refreshToken, user }
 */
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    return success(res, result, 201);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/login
 * MASTER 7.4: { email, password } → { accessToken, refreshToken, user }
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/apple
 * MASTER 7.4: { identityToken, authorizationCode, fullName } → { accessToken, refreshToken, user, isNewUser }
 */
router.post('/apple', validate(appleSchema), async (req, res, next) => {
  try {
    const result = await appleAuthService.authenticateWithApple(req.body);
    const statusCode = result.isNewUser ? 201 : 200;
    return success(res, result, statusCode);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/google
 * MASTER 7.4: { idToken } → { accessToken, refreshToken, user, isNewUser }
 */
router.post('/google', validate(googleSchema), async (req, res, next) => {
  try {
    const result = await googleAuthService.authenticateWithGoogle(req.body);
    const statusCode = result.isNewUser ? 201 : 200;
    return success(res, result, statusCode);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/refresh
 * MASTER 12.1: refresh rotation
 */
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body);
    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/logout
 * Инвалидировать refresh token
 */
router.post('/logout', requireAuth, validate(logoutSchema), async (req, res, next) => {
  try {
    await authService.logout({
      refreshToken: req.body.refreshToken,
      userId: req.user.userId,
    });
    return success(res, { message: 'Вы вышли из аккаунта' });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/auth/account
 * Удаление аккаунта (Фаза 6, A2). Экран 4.34.
 *
 * 🔴 Apple Guideline 5.1.1(v): приложение, позволяющее создать аккаунт, ОБЯЗАНО
 * позволять его удалить — из самого приложения, без писем в поддержку.
 * Раньше этого флоу не было вовсе (экран висел в воздухе) — блокер ревью.
 *
 * Body: { confirm: 'УДАЛИТЬ' } — защита от случайного вызова.
 *
 * Что делаем:
 * 1. Удаляем ПОЛНОСТЬЮ личный контент: цитаты (Quote), еженедельные ИИ-отчёты
 *    (WeeklyReport), прогресс прослушивания (Progress). Появились в Фазе 5 —
 *    забыть их здесь было бы утечкой персональных данных.
 * 2. Стираем PII в User: email, имя, аватар, пароль, push-токен, ответы опроса,
 *    город, блок-лист, привязки Apple/Google. Имя заменяем на «Удалённый
 *    аккаунт» — это же имя увидят участницы рядом со старыми сообщениями.
 * 3. Сообщения чата НЕ удаляем — на них ссылаются ответы других участниц
 *    (reply-контекст рассыпался бы). Они анонимизируются автоматически: имя
 *    автора берётся из User, а там теперь «Удалённый аккаунт».
 * 4. Purchase НЕ удаляем — это финансовые записи (сверка с Apple, возвраты,
 *    налоги). Персональных данных они не содержат: транзакция + продукт.
 * 5. Помечаем isDeleted=true + deletionRequestedAt — вход в аккаунт закрыт.
 *
 * ⚠️ ОТЗЫВ ТОКЕНА APPLE (Sign in with Apple) НЕ ВЫПОЛНЯЕТСЯ: для вызова
 * revoke нужен .p8-ключ Sign in with Apple (config.apple.privateKeyPath —
 * сейчас пуст) И сохранённый refresh-токен Apple, который мы при входе не
 * сохраняем. Если Apple потребует revoke на ревью — нужно (а) выдать ключ,
 * (б) сохранять appleRefreshToken при входе, (в) дёргать здесь revoke.
 * Логируем факт, чтобы это было видно в pm2, а не забылось.
 */
const deleteAccountSchema = z.object({
  confirm: z.literal('УДАЛИТЬ', {
    errorMap: () => ({ message: 'Для удаления введите слово УДАЛИТЬ' }),
  }),
});

router.delete(
  '/account',
  requireAuth,
  validate(deleteAccountSchema),
  async (req, res, next) => {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId).select('authProvider').lean();
      if (!user) {
        return success(res, { deleted: true });
      }

      // 1. Личный контент — под нож.
      await Quote.deleteMany({ userId });
      await WeeklyReport.deleteMany({ userId });
      await Progress.deleteMany({ userId });

      // 2-5. Обезличиваем аккаунт и закрываем вход.
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            isDeleted: true,
            deletionRequestedAt: new Date(),
            name: 'Удалённый аккаунт',
            avatarUrl: null,
            passwordHash: null,
            pushToken: null,
            surveyAnswers: null,
            city: null,
            aiConsent: false,
            blockedUsers: [],
            refreshTokens: [],
          },
          // $unset для уникальных полей: null в них нарушил бы sparse-индекс
          // при втором удалённом аккаунте.
          $unset: {
            email: '',
            appleUserId: '',
            googleUserId: '',
            referralCode: '',
          },
        }
      );

      if (user.authProvider === 'apple') {
        logger.warn(
          'Account deleted for Apple user — Apple token revoke NOT performed',
          { userId, reason: 'no Sign in with Apple key / no stored refresh token' }
        );
      }

      logger.info('Account deleted', { userId });

      return success(res, { deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
