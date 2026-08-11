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
 *
 * authorizationCode обменивается на refresh-токен Apple (Фаза 6, A2) — он нужен,
 * чтобы отозвать доступ приложения при удалении аккаунта.
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
 * 1. Отзываем доступ у Apple (revoke по сохранённому refresh-токену). Требуется
 *    Apple для приложений с Sign in with Apple. Если токена нет (юзер вошёл до
 *    того, как мы начали их сохранять) или ключ не настроен — пишем в лог и
 *    продолжаем: удаление не должно срываться из-за этого.
 * 2. Удаляем ПОЛНОСТЬЮ личный контент: цитаты (Quote), еженедельные ИИ-отчёты
 *    (WeeklyReport), прогресс прослушивания (Progress).
 * 3. Стираем PII в User: email, имя, аватар, пароль, push-токен, ответы опроса,
 *    страна/город, почта для рассылки, блок-лист, привязки Apple/Google, apple
 *    refresh token. Имя заменяем на «Удалённый аккаунт» — это же имя увидят
 *    участницы рядом со старыми сообщениями.
 * 4. Сообщения чата НЕ удаляем — на них ссылаются ответы других участниц
 *    (reply-контекст рассыпался бы). Они анонимизируются автоматически: имя
 *    автора берётся из User, а там теперь «Удалённый аккаунт».
 * 5. Purchase НЕ удаляем — это финансовые записи (сверка с Apple, возвраты,
 *    налоги). Персональных данных они не содержат: транзакция + продукт.
 * 6. Помечаем isDeleted=true + deletionRequestedAt — вход в аккаунт закрыт.
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

      const user = await User.findById(userId)
        .select('authProvider appleRefreshToken')
        .lean();
      if (!user) {
        return success(res, { deleted: true });
      }

      // 1. Отзыв доступа у Apple.
      if (user.authProvider === 'apple') {
        const revoked = await appleAuthService.revokeAppleAccess(
          user.appleRefreshToken
        );
        if (!revoked) {
          logger.warn('Apple access NOT revoked on account deletion', {
            userId,
            hasToken: Boolean(user.appleRefreshToken),
          });
        }
      }

      // 2. Личный контент — под нож.
      await Quote.deleteMany({ userId });
      await WeeklyReport.deleteMany({ userId });
      await Progress.deleteMany({ userId });

      // 3-6. Обезличиваем аккаунт и закрываем вход.
      await User.updateOne(
        { _id: userId },
        {
          $set: {
            isDeleted: true,
            deletionRequestedAt: new Date(),
            name: 'Удалённый аккаунт',
            avatarUrl: null,
            avatarStoragePath: null,
            passwordHash: null,
            pushToken: null,
            surveyAnswers: null,
            onboardingCompleted: false,
            country: null,
            city: null,
            marketingEmail: null,
            marketingConsent: false,
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
            appleRefreshToken: '',
          },
        }
      );

      logger.info('Account deleted', { userId });

      return success(res, { deleted: true });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
