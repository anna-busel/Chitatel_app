const crypto = require('crypto');
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const config = require('../config');
const logger = require('../config/logger');
const User = require('../models/User');
const mailService = require('../services/mail.service');

/**
 * Восстановление и смена пароля для входа по почте (UPDATES-PLAN P1, P2;
 * 05.11.2026). Монтируется под /api/auth рядом с routes/auth.js:
 *   POST /api/auth/forgot-password {email}                     → {sent:true}
 *   POST /api/auth/reset-password  {email, code, newPassword}  → {ok:true}
 *   POST /api/auth/change-password {currentPassword, newPassword} (вход) → {ok:true}
 *
 * Только authProvider 'email': у входа через Apple / Google пароля нет.
 * forgot-password отвечает одинаково, есть такая почта или нет, и не ждёт
 * отправки письма — по ответу и по времени ответа не понять, зарегистрирован
 * ли адрес. Лимиты по IP — в app.js (middleware/rate-limit.js).
 */
const router = Router();

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_INTERVAL_MS = 60 * 1000;
const BCRYPT_ROUNDS = 12; // как в auth.service

const normEmail = (email) => String(email || '').trim().toLowerCase();

/** HMAC от кода (ключ — JWT_SECRET, привязка к почте): сам код не храним. */
function hashCode(email, code) {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`${normEmail(email)}:${String(code).trim()}`)
    .digest('hex');
}

function sameHash(a, b) {
  const ba = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

const passwordField = z
  .string()
  .min(8, 'Пароль минимум 8 символов')
  .max(72, 'Пароль максимум 72 символа');

/* ------------------------------------------------------------------ *
 *                           FORGOT PASSWORD                           *
 * ------------------------------------------------------------------ */

const forgotSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
});

router.post('/forgot-password', validate(forgotSchema), async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const user = await User.findOne({ email, isDeleted: false })
      .select('_id email authProvider +passwordReset')
      .lean();

    // Apple / Google или нет аккаунта — письма нет, ответ тот же.
    if (!user || user.authProvider !== 'email') {
      return success(res, { sent: true });
    }

    // Не чаще раза в минуту на почту — молча, ответ тот же.
    const lastSent = user.passwordReset && user.passwordReset.sentAt;
    if (lastSent && Date.now() - new Date(lastSent).getTime() < RESEND_INTERVAL_MS) {
      logger.info('forgot-password: повтор раньше 60 с, письмо не отправлено', {
        userId: String(user._id),
      });
      return success(res, { sent: true });
    }

    const code = generateCode();
    const now = Date.now();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordReset: {
            codeHash: hashCode(email, code),
            expiresAt: new Date(now + CODE_TTL_MS),
            attempts: 0,
            sentAt: new Date(now),
          },
        },
      }
    );

    // Не ждём SMTP: ответ не должен зависеть от того, ушло ли письмо.
    Promise.resolve()
      .then(() => mailService.sendPasswordResetCode(user.email, code, CODE_TTL_MS / 60000))
      .then((sent) => {
        logger.info('forgot-password: код выдан', { userId: String(user._id), mailed: !!sent });
      })
      .catch((err) => {
        logger.error('forgot-password: ошибка отправки', { message: err.message });
      });

    return success(res, { sent: true });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                           RESET PASSWORD                            *
 * ------------------------------------------------------------------ */

const resetSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
  code: z.string().trim().min(1, 'Код обязателен').max(20),
  newPassword: passwordField,
});

router.post('/reset-password', validate(resetSchema), async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const { code, newPassword } = req.body;

    const user = await User.findOne({ email, isDeleted: false })
      .select('_id authProvider +passwordReset')
      .lean();
    const pr = user && user.passwordReset;

    if (!user || user.authProvider !== 'email' || !pr || !pr.codeHash) {
      throw new AppError('CODE_INVALID', 'Неверный код', 400);
    }
    if ((pr.attempts || 0) >= MAX_ATTEMPTS) {
      throw new AppError(
        'TOO_MANY_ATTEMPTS',
        'Слишком много попыток. Запросите новый код',
        400
      );
    }
    if (!pr.expiresAt || new Date(pr.expiresAt).getTime() < Date.now()) {
      throw new AppError('CODE_EXPIRED', 'Срок действия кода истёк. Запросите новый код', 400);
    }

    if (!sameHash(pr.codeHash, hashCode(email, code))) {
      // Атомарно +1 к попыткам этого же кода (параллельные запросы не обходят лимит).
      await User.updateOne(
        { _id: user._id, 'passwordReset.codeHash': pr.codeHash },
        { $inc: { 'passwordReset.attempts': 1 } }
      );
      const left = MAX_ATTEMPTS - (pr.attempts || 0) - 1;
      if (left <= 0) {
        throw new AppError(
          'TOO_MANY_ATTEMPTS',
          'Слишком много попыток. Запросите новый код',
          400
        );
      }
      throw new AppError('CODE_INVALID', 'Неверный код', 400, { attemptsLeft: left });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    // Новый пароль + выход на всех устройствах: все refresh-токены
    // (User.refreshTokens) сбрасываются, код больше не действует.
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash, refreshTokens: [] }, $unset: { passwordReset: '' } }
    );

    logger.info('reset-password: пароль изменён по коду', { userId: String(user._id) });
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                           CHANGE PASSWORD                           *
 * ------------------------------------------------------------------ */

const changeSchema = z.object({
  currentPassword: z.string().min(1, 'Текущий пароль обязателен'),
  newPassword: passwordField,
});

router.post('/change-password', requireAuth, validate(changeSchema), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('_id authProvider passwordHash isDeleted')
      .lean();
    if (!user || user.isDeleted) {
      throw new AppError('UNAUTHORIZED', 'Пользователь не найден', 401);
    }
    if (user.authProvider !== 'email' || !user.passwordHash) {
      throw new AppError(
        'NOT_EMAIL_ACCOUNT',
        'Пароль есть только у входа по почте',
        403
      );
    }

    const ok = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!ok) {
      throw new AppError('WRONG_PASSWORD', 'Неверный текущий пароль', 400);
    }

    const passwordHash = await bcrypt.hash(req.body.newPassword, BCRYPT_ROUNDS);
    // Сессии не трогаем: клиент не присылает свой refresh-токен, сброс всех
    // выкинул бы и это устройство (контракт — только {ok:true}).
    await User.updateOne({ _id: user._id }, { $set: { passwordHash } });

    logger.info('change-password: пароль изменён', { userId: String(user._id) });
    return success(res, { ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports._internal = { hashCode, CODE_TTL_MS, MAX_ATTEMPTS, RESEND_INTERVAL_MS };
