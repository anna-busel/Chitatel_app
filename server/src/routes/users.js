const { Router } = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const User = require('../models/User');
const Report = require('../models/Report');

/**
 * Блокировка участника участником + жалоба на пользователя (Фаза 6, A1).
 *
 * 🔴 Apple Guideline 1.2 (UGC): пользователь обязан иметь возможность
 * пожаловаться на контент И заблокировать автора. Раньше в проекте была
 * только жалоба на сообщение (club.js) — блокировки не было вовсе.
 *
 * Эндпоинты:
 *   POST   /api/users/:id/block    — заблокировать
 *   DELETE /api/users/:id/block    — разблокировать
 *   GET    /api/users/blocked      — список заблокированных (экран в профиле)
 *   POST   /api/users/:id/report   — пожаловаться на пользователя целиком
 *
 * Что даёт блокировка: сообщения заблокированного не приходят в выдаче чата
 * (GET /api/club/chat, /chat/context, pinnedMessage, reply-снапшоты — фильтр
 * в club.js) и скрываются на клиенте при доставке по WebSocket.
 *
 * Ограничения (осознанные):
 * - нельзя заблокировать себя;
 * - нельзя заблокировать администратора (Анну, автора клуба) — иначе участница
 *   потеряет разборы, ответы и закреплённое сообщение и решит, что клуб сломан.
 *   Решение согласовано 12.07.2026.
 */
const router = Router();

router.use(requireAuth);

/** Валидный ObjectId или 400. */
function assertObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('NOT_FOUND', 'Неверный id пользователя', 400);
  }
}

/**
 * GET /api/users/blocked
 * Список заблокированных (для экрана «Заблокированные» в профиле).
 * Отдаёт минимум: id, имя, аватар.
 */
router.get('/blocked', async (req, res, next) => {
  try {
    const me = await User.findById(req.user.userId)
      .select('blockedUsers')
      .populate('blockedUsers', 'name avatarUrl')
      .lean();

    if (!me) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    const blocked = (me.blockedUsers || []).map((u) => ({
      id: u._id,
      name: u.name || 'Участница',
      avatarUrl: u.avatarUrl || null,
    }));

    return success(res, { blocked });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/users/:id/block
 * Заблокировать участника. Идемпотентно ($addToSet).
 */
router.post('/:id/block', async (req, res, next) => {
  try {
    const targetId = req.params.id;
    assertObjectId(targetId);

    if (targetId === String(req.user.userId)) {
      throw new AppError('VALIDATION_ERROR', 'Нельзя заблокировать себя', 400);
    }

    const target = await User.findById(targetId).select('role isDeleted').lean();
    if (!target || target.isDeleted) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    // Автора клуба блокировать нельзя — иначе пропадут разборы и ответы Анны.
    if (target.role === 'admin') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Автора клуба заблокировать нельзя',
        400
      );
    }

    await User.updateOne(
      { _id: req.user.userId },
      { $addToSet: { blockedUsers: targetId } }
    );

    return success(res, { blocked: true, userId: targetId });
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/users/:id/block
 * Разблокировать участника. Идемпотентно ($pull).
 */
router.delete('/:id/block', async (req, res, next) => {
  try {
    const targetId = req.params.id;
    assertObjectId(targetId);

    await User.updateOne(
      { _id: req.user.userId },
      { $pull: { blockedUsers: new mongoose.Types.ObjectId(targetId) } }
    );

    return success(res, { blocked: false, userId: targetId });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/users/:id/report
 * Жалоба на пользователя целиком (не на конкретное сообщение).
 * Body: { reason, comment? }
 *
 * Жалоба на сообщение живёт отдельно — POST /api/club/chat/:id/report.
 * Обе попадают в одну коллекцию Report и разбираются в админке (A5).
 */
const reportSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'offensive', 'copyright', 'other']),
  comment: z.string().max(500).optional(),
});

router.post('/:id/report', validate(reportSchema), async (req, res, next) => {
  try {
    const targetId = req.params.id;
    assertObjectId(targetId);

    if (targetId === String(req.user.userId)) {
      throw new AppError('VALIDATION_ERROR', 'Нельзя пожаловаться на себя', 400);
    }

    const target = await User.findById(targetId).select('isDeleted').lean();
    if (!target || target.isDeleted) {
      throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
    }

    const { reason, comment } = req.body;

    let report;
    try {
      report = await Report.create({
        reporterUserId: req.user.userId,
        targetType: 'user',
        targetId,
        clubMonthId: null,
        reason,
        comment: comment || '',
      });
    } catch (err) {
      // Уникальный индекс (reporterUserId + targetType + targetId):
      // на одного человека жалуемся один раз — повтор считаем успехом,
      // чтобы клиент не показывал ошибку.
      if (err && err.code === 11000) {
        return success(res, { reported: true, duplicate: true });
      }
      throw err;
    }

    return success(res, { reported: true, reportId: report._id });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
