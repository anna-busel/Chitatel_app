const { Router } = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const User = require('../models/User');
const Report = require('../models/Report');
const Review = require('../models/Review');

/**
 * POST /api/reports — жалоба на пользовательский контент (UPDATES-PLAN A1).
 * Apple 1.2 / Google UGC: на любом публичном контенте должна быть жалоба.
 *
 * Body: { targetType: 'review' | 'profile', targetId, reason, comment? }
 *  - review  — отзыв на разбор (targetId — id отзыва), +1 к Review.reportCount;
 *  - profile — профиль участницы (targetId — id пользователя).
 * 'feed_post' уже есть в Report.targetType, но принимать его роут начнёт
 * вместе с моделью FeedPost (лента, релиз R5).
 *
 * Жалобы на сообщение чата (/api/club/chat/:id/report), на пользователя
 * (/api/users/:id/report) и на ИИ-разбор (/api/ai/report) остаются как были —
 * старые клиенты ими пользуются. Всё попадает в одну коллекцию Report.
 *
 * Отдельный файл, а не POST '/' в routes/reports.js: тот роутер — личные
 * недельные/месячные отчёты, к модерации отношения не имеет.
 */
const router = Router();

const objectId = z.string().refine((s) => mongoose.Types.ObjectId.isValid(s), {
  message: 'targetId должен быть валидным id',
});

const contentReportSchema = z.object({
  targetType: z.enum(['review', 'profile']),
  targetId: objectId,
  reason: z.enum(['spam', 'inappropriate', 'offensive', 'copyright', 'other']),
  comment: z.string().trim().max(500).default(''),
});

// requireAuth на самом роуте, не router.use: роутер смонтирован на тот же
// /api/reports, что и отчёты, и не должен перехватывать их запросы.
router.post('/', requireAuth, validate(contentReportSchema), async (req, res, next) => {
  try {
    const { targetType, targetId, reason, comment } = req.body;
    const userId = String(req.user.userId);

    if (targetType === 'review') {
      const review = await Review.findById(targetId).select('userId').lean();
      if (!review) {
        throw new AppError('NOT_FOUND', 'Отзыв не найден', 404);
      }
      if (String(review.userId) === userId) {
        throw new AppError('VALIDATION_ERROR', 'Нельзя пожаловаться на свой отзыв', 400);
      }
    } else {
      if (targetId === userId) {
        throw new AppError('VALIDATION_ERROR', 'Нельзя пожаловаться на себя', 400);
      }
      const target = await User.findById(targetId).select('isDeleted').lean();
      if (!target || target.isDeleted) {
        throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
      }
    }

    let report;
    try {
      report = await Report.create({
        reporterUserId: userId,
        targetType,
        targetId,
        reason,
        comment,
      });
    } catch (err) {
      // Уникальный индекс (reporterUserId + targetType + targetId): повторная
      // жалоба — не ошибка для пользователя, счётчик не увеличиваем.
      if (err && err.code === 11000) {
        return success(res, { reported: true, duplicate: true });
      }
      throw err;
    }

    if (targetType === 'review') {
      await Review.updateOne({ _id: targetId }, { $inc: { reportCount: 1 } });
    }

    return success(res, { reported: true, reportId: report._id });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
