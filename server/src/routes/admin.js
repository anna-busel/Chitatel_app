const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const { emitToClub } = require('../socket');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const QAQuestion = require('../models/QAQuestion');
const Report = require('../models/Report');
const { runWeeklyReports } = require('../jobs/weekly-report');
const { runMonthlyReports } = require('../jobs/monthly-report');
const pushService = require('../services/push.service');

const router = Router();

// Все админ-эндпоинты требуют requireAuth + requireAdmin.
router.use(requireAuth, requireAdmin);

/* ------------------------------------------------------------------ *
 *                       МОДЕРАЦИЯ ЖАЛОБ                              *
 * ------------------------------------------------------------------ */

/**
 * GET /api/admin/reports
 * Список жалоб для рассмотрения.
 *
 * Query:
 * - status (pending/resolved/dismissed, default pending)
 * - limit (1..50, default 20)
 * - clubMonthId (опц.) — фильтр по клубу
 */
const reportsListSchema = z.object({
  status: z
    .enum(['pending', 'resolved', 'dismissed'])
    .default('pending'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  clubMonthId: z
    .string()
    .refine((s) => mongoose.Types.ObjectId.isValid(s), {
      message: 'clubMonthId должен быть валидным ObjectId',
    })
    .optional(),
});

router.get(
  '/reports',
  validate(reportsListSchema, 'query'),
  async (req, res, next) => {
    try {
      const filter = { status: req.query.status };
      if (req.query.clubMonthId) {
        filter.clubMonthId = req.query.clubMonthId;
      }

      const reports = await Report.find(filter)
        .sort({ createdAt: -1 })
        .limit(req.query.limit)
        .populate('reporterUserId', 'name avatarUrl email')
        .lean();

      // Для каждого репорта подгружаем target (сообщение или юзера).
      const enriched = await Promise.all(
        reports.map(async (r) => {
          let target = null;
          if (r.targetType === 'message') {
            target = await ChatMessage.findById(r.targetId)
              .populate('userId', 'name avatarUrl email')
              .lean();
          } else if (r.targetType === 'user') {
            target = await User.findById(r.targetId)
              .select('name avatarUrl email isBanned mutedUntil')
              .lean();
          }
          return { ...r, target };
        })
      );

      return success(res, { reports: enriched });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/reports/:reportId/action
 * Разрешить жалобу. Действия:
 * - hide_message: ChatMessage.isHidden=true + Socket emit
 * - warn_user: ничего на бекенде (только пометить жалобу как resolved, push отправит push-сервис в 6.1)
 * - mute_user: User.mutedUntil = now + N дней
 * - ban_user: User.isBanned=true
 * - dismiss: пометить жалобу dismissed
 */
const reportActionSchema = z
  .object({
    action: z.enum([
      'hide_message',
      'warn_user',
      'mute_user',
      'ban_user',
      'dismiss',
    ]),
    muteDays: z.number().int().min(1).max(365).optional(),
  })
  .refine(
    (data) => data.action !== 'mute_user' || typeof data.muteDays === 'number',
    {
      message: 'Для mute_user необходим параметр muteDays',
    }
  );

router.post(
  '/reports/:reportId/action',
  validate(reportActionSchema),
  async (req, res, next) => {
    try {
      const { reportId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(reportId)) {
        throw new AppError('NOT_FOUND', 'Неверный reportId', 400);
      }

      const report = await Report.findById(reportId);
      if (!report) {
        throw new AppError('NOT_FOUND', 'Жалоба не найдена', 404);
      }
      if (report.status !== 'pending') {
        throw new AppError(
          'FORBIDDEN',
          'Жалоба уже обработана',
          409
        );
      }

      const { action, muteDays } = req.body;

      // Применяем действие.
      if (action === 'hide_message') {
        if (report.targetType !== 'message') {
          throw new AppError(
            'FORBIDDEN',
            'hide_message можно применять только к жалобам на сообщение',
            400
          );
        }
        await ChatMessage.updateOne(
          { _id: report.targetId },
          { $set: { isHidden: true } }
        );
        // Эмитим скрытие всем в комнате клуба — клиенты уберут сообщение из ленты.
        if (report.clubMonthId) {
          const io = req.app.get('io');
          emitToClub(io, report.clubMonthId, 'chat:message_hidden', {
            messageId: String(report.targetId),
          });
        }
      } else if (action === 'mute_user' || action === 'ban_user') {
        // Определяем целевого юзера — либо это target=user, либо автор сообщения.
        let targetUserId = null;
        if (report.targetType === 'user') {
          targetUserId = report.targetId;
        } else if (report.targetType === 'message') {
          const msg = await ChatMessage.findById(report.targetId)
            .select('userId')
            .lean();
          if (msg) targetUserId = msg.userId;
        }
        if (!targetUserId) {
          throw new AppError('NOT_FOUND', 'Целевой пользователь не найден', 404);
        }

        if (action === 'mute_user') {
          const mutedUntil = new Date(
            Date.now() + muteDays * 24 * 60 * 60 * 1000
          );
          await User.updateOne(
            { _id: targetUserId },
            { $set: { mutedUntil } }
          );
        } else {
          await User.updateOne(
            { _id: targetUserId },
            { $set: { isBanned: true } }
          );
        }
      }
      // warn_user / dismiss — никаких side-effect'ов на БД, только пометка report.

      report.status = action === 'dismiss' ? 'dismissed' : 'resolved';
      report.actionTaken = action;
      report.resolvedByUserId = req.user.userId;
      report.resolvedAt = new Date();
      await report.save();

      return success(res, { report });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                            Q&A ОТВЕТЫ                              *
 * ------------------------------------------------------------------ */

/**
 * GET /api/admin/qa/unanswered
 * Неотвеченные вопросы для админки (MASTER 9.4).
 *
 * Query:
 * - limit (1..50, default 50)
 */
const qaUnansweredSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

router.get(
  '/qa/unanswered',
  validate(qaUnansweredSchema, 'query'),
  async (req, res, next) => {
    try {
      const questions = await QAQuestion.find({ answeredAt: null })
        .sort({ createdAt: 1 }) // старые сверху — отвечать в порядке поступления
        .limit(req.query.limit)
        .populate('userId', 'name avatarUrl')
        .populate('clubMonthId', 'month year title')
        .lean();

      return success(res, { questions });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/admin/qa/:questionId/answer
 * Ответить на вопрос. Push отправит push-сервис в задаче 6.1.
 */
const qaAnswerSchema = z.object({
  answerText: z.string().min(1).max(5000).trim(),
});

router.post(
  '/qa/:questionId/answer',
  validate(qaAnswerSchema),
  async (req, res, next) => {
    try {
      const { questionId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(questionId)) {
        throw new AppError('NOT_FOUND', 'Неверный questionId', 400);
      }

      const question = await QAQuestion.findById(questionId);
      if (!question) {
        throw new AppError('NOT_FOUND', 'Вопрос не найден', 404);
      }
      if (question.answeredAt) {
        throw new AppError(
          'FORBIDDEN',
          'На вопрос уже отвечено',
          409
        );
      }

      question.answerText = req.body.answerText;
      question.answeredAt = new Date();
      question.answeredByUserId = req.user.userId;
      await question.save();

      const populated = await QAQuestion.findById(question._id)
        .populate('userId', 'name avatarUrl')
        .populate('answeredByUserId', 'name avatarUrl')
        .lean();

      return success(res, { question: populated });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                       ЗАКРЕПЛЁННОЕ СООБЩЕНИЕ                       *
 * ------------------------------------------------------------------ */

/**
 * POST /api/admin/club-months/:clubMonthId/pin
 * Закрепить сообщение в чате клуба (1 шт на клуб, только Анна — AI-CONTEXT v5).
 *
 * Body: { messageId }
 *
 * Логика:
 * - Снимаем isPinned со старого закрепа (если был)
 * - Ставим isPinned=true новому
 * - Обновляем ClubMonth.pinnedMessageId
 * - Эмитим chat:pin_changed в комнату
 *
 * Передача messageId=null → снять закреп.
 */
const pinSchema = z.object({
  messageId: z
    .string()
    .refine((s) => s === null || mongoose.Types.ObjectId.isValid(s), {
      message: 'messageId должен быть валидным ObjectId или null',
    })
    .nullable(),
});

router.post(
  '/club-months/:clubMonthId/pin',
  validate(pinSchema),
  async (req, res, next) => {
    try {
      const { clubMonthId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(clubMonthId)) {
        throw new AppError('NOT_FOUND', 'Неверный clubMonthId', 400);
      }

      const club = await ClubMonth.findById(clubMonthId);
      if (!club) {
        throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
      }

      const newPinId = req.body.messageId;

      // Снимаем со старого закрепа (если был).
      if (club.pinnedMessageId) {
        await ChatMessage.updateOne(
          { _id: club.pinnedMessageId },
          { $set: { isPinned: false } }
        );
      }

      // Если новый закреп — проверяем что сообщение из этого клуба.
      if (newPinId) {
        const message = await ChatMessage.findById(newPinId)
          .select('clubMonthId isHidden deletedAt')
          .lean();
        if (!message || !message.clubMonthId.equals(club._id)) {
          throw new AppError(
            'NOT_FOUND',
            'Сообщение для закрепа не найдено в этом клубе',
            404
          );
        }
        if (message.isHidden || message.deletedAt) {
          throw new AppError(
            'FORBIDDEN',
            'Нельзя закрепить скрытое или удалённое сообщение',
            400
          );
        }
        await ChatMessage.updateOne(
          { _id: newPinId },
          { $set: { isPinned: true } }
        );
      }

      club.pinnedMessageId = newPinId;
      await club.save();

      // Эмитим всем в комнате клуба.
      const io = req.app.get('io');
      emitToClub(io, club._id, 'chat:pin_changed', {
        pinnedMessageId: newPinId ? String(newPinId) : null,
      });

      return success(res, { pinnedMessageId: newPinId });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                РУЧНОЙ ЗАПУСК ОТЧЁТОВ (тест/catch-up)              *
 * ------------------------------------------------------------------ */

/**
 * POST /api/admin/reports/weekly/run
 * POST /api/admin/reports/monthly/run
 *
 * Запуск генерации отчётов за прошедший период.
 * Body:
 * - userId (опц.) — только для одного пользователя (тест);
 * - force (опц., по умолчанию true) — генерировать заново, без порога/регистрации.
 *
 * С userId — выполняется синхронно и возвращает { generated }.
 * Без userId — по всем юзерам в фоне (может быть долго), возвращает { started: true }.
 */
const runReportsSchema = z.object({
  userId: z
    .string()
    .refine((s) => mongoose.Types.ObjectId.isValid(s), {
      message: 'userId должен быть валидным ObjectId',
    })
    .optional(),
  force: z.boolean().optional(),
});

router.post(
  '/reports/weekly/run',
  validate(runReportsSchema),
  async (req, res, next) => {
    try {
      const userId = req.body.userId || null;
      const force = req.body.force !== undefined ? req.body.force : true;

      if (userId) {
        const generated = await runWeeklyReports({ force, userId });
        return success(res, { generated });
      }

      runWeeklyReports({ force }).catch(() => {});
      return success(res, { started: true });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/reports/monthly/run',
  validate(runReportsSchema),
  async (req, res, next) => {
    try {
      const userId = req.body.userId || null;
      const force = req.body.force !== undefined ? req.body.force : true;

      if (userId) {
        const generated = await runMonthlyReports({ force, userId });
        return success(res, { generated });
      }

      runMonthlyReports({ force }).catch(() => {});
      return success(res, { started: true });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                        НОВОСТИ / АНОНСЫ                            *
 * ------------------------------------------------------------------ */

/**
 * POST /api/admin/news
 * Разослать новость/анонс (напр. старт сезона). Пишется в ленту 4.30 всем
 * адресатам (история), push шлётся тем, у кого включена настройка news.
 *
 * Body:
 * - title, body — текст новости;
 * - audience ('all' | 'subscribers', default 'all');
 * - data (опц.) — полезная нагрузка для навигации по тапу.
 */
const newsSchema = z.object({
  title: z.string().min(1).max(120).trim(),
  body: z.string().min(1).max(1000).trim(),
  audience: z.enum(['all', 'subscribers']).default('all'),
  data: z.record(z.any()).optional(),
});

router.post('/news', validate(newsSchema), async (req, res, next) => {
  try {
    const { title, body, audience } = req.body;
    const result = await pushService.sendNews({
      audience,
      title,
      body,
      data: req.body.data || {},
    });
    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                        СТАТИСТИКА                                  *
 * ------------------------------------------------------------------ */

/**
 * GET /api/admin/stats
 * Базовая статистика (MASTER 9.2).
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const [
      totalUsers,
      activeSubscribers,
      totalMessages,
      pendingReports,
      unansweredQuestions,
    ] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({
        subscriptionStatus: { $in: ['basic', 'premium'] },
        subscriptionExpiresAt: { $gt: new Date() },
      }),
      ChatMessage.countDocuments({ deletedAt: null }),
      Report.countDocuments({ status: 'pending' }),
      QAQuestion.countDocuments({ answeredAt: null }),
    ]);

    return success(res, {
      totalUsers,
      activeSubscribers,
      totalMessages,
      pendingReports,
      unansweredQuestions,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
