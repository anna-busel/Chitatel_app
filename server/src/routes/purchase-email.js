const crypto = require('crypto');
const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const config = require('../config');
const logger = require('../config/logger');
const User = require('../models/User');
const mailService = require('../services/mail.service');
const { linkPurchaseEmail } = require('../crm/services/access.service');

/**
 * Почта, с которой участница оплачивала (27.11.2026, решение Гиорги).
 * Монтируется под /api/profile/purchase-email:
 *   GET  /                       → { emails: [...] }
 *   POST /request {email}        → код на эту почту, { sent: true }
 *   POST /confirm {email, code}  → почта в User.purchaseEmails, CRM связывает
 *                                  её оплаты с аккаунтом:
 *                                  { email, found, linked, applied, conflicts }
 *
 * Зачем: почта аккаунта и почта оплаты часто расходятся (вход через Apple со
 * «Скрыть e-mail», оплата с рабочей почты). Код из письма доказывает, что
 * почта её, — иначе любой мог бы забрать чужие покупки, вписав чужой адрес.
 * Если в CRM по почте пока ничего нет (база ГетКурса ещё не перенесена),
 * почта всё равно сохраняется: linkUser проверяет её при каждом входе.
 */
const router = Router();
router.use(requireAuth);

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_INTERVAL_MS = 60 * 1000;
const MAX_EMAILS = 5;

const normEmail = (email) => String(email || '').trim().toLowerCase();

function hashCode(userId, email, code) {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`purchase-email:${userId}:${normEmail(email)}:${String(code).trim()}`)
    .digest('hex');
}

function sameHash(a, b) {
  const ba = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('purchaseEmails').lean();
    return success(res, { emails: (user && user.purchaseEmails) || [] });
  } catch (err) {
    return next(err);
  }
});

const requestSchema = z.object({ email: z.string().trim().email('Некорректная почта') });

router.post('/request', validate(requestSchema), async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const user = await User.findOne({ _id: req.user.userId, isDeleted: false })
      .select('_id email purchaseEmails +purchaseEmailCode')
      .lean();
    if (!user) {throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);}

    const known = [normEmail(user.email), ...(user.purchaseEmails || [])];
    if (known.includes(email)) {
      throw new AppError('ALREADY_LINKED', 'Эта почта уже привязана к вашему аккаунту', 400);
    }
    if ((user.purchaseEmails || []).length >= MAX_EMAILS) {
      throw new AppError('TOO_MANY_EMAILS', 'Можно привязать не больше 5 почт. Напишите в поддержку', 400);
    }
    const last = user.purchaseEmailCode && user.purchaseEmailCode.sentAt;
    if (last && Date.now() - new Date(last).getTime() < RESEND_INTERVAL_MS) {
      throw new AppError('TOO_SOON', 'Код уже отправлен. Повторно можно через минуту', 429);
    }

    const code = generateCode();
    const now = Date.now();
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          purchaseEmailCode: {
            email,
            codeHash: hashCode(String(user._id), email, code),
            expiresAt: new Date(now + CODE_TTL_MS),
            attempts: 0,
            sentAt: new Date(now),
          },
        },
      }
    );

    const sent = await mailService.sendPurchaseEmailCode(email, code, CODE_TTL_MS / 60000);
    if (!sent) {
      // Письмо не ушло — снимаем паузу, чтобы можно было сразу повторить.
      await User.updateOne({ _id: user._id }, { $unset: { purchaseEmailCode: '' } });
      throw new AppError('MAIL_FAILED', 'Не удалось отправить письмо. Попробуйте позже', 503);
    }
    logger.info('purchase-email: код отправлен', { userId: String(user._id) });
    return success(res, { sent: true });
  } catch (err) {
    return next(err);
  }
});

const confirmSchema = z.object({
  email: z.string().trim().email('Некорректная почта'),
  code: z.string().trim().min(1, 'Код обязателен').max(20),
});

router.post('/confirm', validate(confirmSchema), async (req, res, next) => {
  try {
    const email = normEmail(req.body.email);
    const user = await User.findOne({ _id: req.user.userId, isDeleted: false })
      .select('_id email purchaseEmails +purchaseEmailCode')
      .lean();
    const pc = user && user.purchaseEmailCode;
    if (!pc || !pc.codeHash || pc.email !== email) {
      throw new AppError('CODE_INVALID', 'Неверный код', 400);
    }
    if ((pc.attempts || 0) >= MAX_ATTEMPTS) {
      throw new AppError('TOO_MANY_ATTEMPTS', 'Слишком много попыток. Запросите новый код', 400);
    }
    if (!pc.expiresAt || new Date(pc.expiresAt).getTime() < Date.now()) {
      throw new AppError('CODE_EXPIRED', 'Срок действия кода истёк. Запросите новый код', 400);
    }
    if (!sameHash(pc.codeHash, hashCode(String(user._id), email, req.body.code))) {
      await User.updateOne(
        { _id: user._id, 'purchaseEmailCode.codeHash': pc.codeHash },
        { $inc: { 'purchaseEmailCode.attempts': 1 } }
      );
      const left = MAX_ATTEMPTS - (pc.attempts || 0) - 1;
      if (left <= 0) {
        throw new AppError('TOO_MANY_ATTEMPTS', 'Слишком много попыток. Запросите новый код', 400);
      }
      throw new AppError('CODE_INVALID', 'Неверный код', 400, { attemptsLeft: left });
    }

    await User.updateOne(
      { _id: user._id },
      { $addToSet: { purchaseEmails: email }, $unset: { purchaseEmailCode: '' } }
    );

    let result = { found: 0, linked: 0, applied: 0, conflicts: 0 };
    try {
      result = await linkPurchaseEmail({ _id: user._id, email: user.email }, email);
    } catch (err) {
      // Почта уже сохранена: CRM повторит привязку при следующем входе.
      logger.error('purchase-email: ошибка привязки в CRM', { message: err.message, userId: String(user._id) });
    }
    logger.info('purchase-email: почта подтверждена', { userId: String(user._id), ...result });
    return success(res, { email, ...result });
  } catch (err) {
    return next(err);
  }
});

router._internal = { hashCode };
module.exports = router;
