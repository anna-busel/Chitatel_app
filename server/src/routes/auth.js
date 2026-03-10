const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const authService = require('../services/auth.service');

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

module.exports = router;
