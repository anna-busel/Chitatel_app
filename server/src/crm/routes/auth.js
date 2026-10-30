const express = require('express');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { authLimiter, refreshLimiter } = require('../../middleware/rate-limit');
const { success } = require('../../utils/response');
const authService = require('../services/auth.service');

/**
 * Вход команды в CRM (CRM-PLAN A2):
 *   POST /api/crm/auth/login   { email, password }
 *   POST /api/crm/auth/2fa     { tempToken, code }
 *   POST /api/crm/auth/refresh { refreshToken }
 */
const router = express.Router();

const loginSchema = z.object({
  email: z.string().email('Некорректная почта'),
  password: z.string().min(1, 'Введите пароль'),
});

const twoFaSchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().regex(/^\s*\d{3}\s?\d{3}\s*$/, 'Код — 6 цифр'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    return success(res, await authService.login(req.body));
  } catch (err) {
    return next(err);
  }
});

router.post('/2fa', authLimiter, validate(twoFaSchema), async (req, res, next) => {
  try {
    return success(res, await authService.verify2fa(req.body));
  } catch (err) {
    return next(err);
  }
});

router.post('/refresh', refreshLimiter, validate(refreshSchema), async (req, res, next) => {
  try {
    return success(res, await authService.refresh(req.body));
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
