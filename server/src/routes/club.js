const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { resolveClubAccess } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const { emitToClub } = require('../socket');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const QAQuestion = require('../models/QAQuestion');
const Report = require('../models/Report');
const Book = require('../models/Book');

const router = Router();

// Все endpoints клуба требуют авторизацию.
router.use(requireAuth);

/* ------------------------------------------------------------------ *
 *                          ИНФА О КЛУБЕ                              *
 * ------------------------------------------------------------------ */

/**
 * GET /api/club/list
 * Список клубов которые юзер может открыть.
 *
 * Возвращает три категории:
 * - archive[] — прошлые клубы где archiveUntilDate >= now (юзеру с подпиской
 *               отдаём все архивы; юзеру с expired — только в архивном окне)
 * - current[] — текущий активный клуб (0 или 1 элемент)
 * - future[] — ближайшие будущие клубы (отдаём только подписчикам и админу)
 *
 * Используется фронтом для построения dropdown'а переключения клубов.
 * Для каждого клуба возвращаем минимум полей + relation ('archive'/'current'/'future').
 */
router.get('/list', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select(
        'subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt role isBanned'
      )
      .lean();

    if (!user) {
      throw new AppError('UNAUTHORIZED', 'Пользователь не найден', 401);
    }

    if (user.isBanned) {
      throw new AppError(
        'CLUB_BLOCKED',
        'Ваш аккаунт заблокирован за нарушение правил',
        403
      );
    }

    const now = new Date();
    const isAdmin = user.role === 'admin';
    const isInGrace =
      user.gracePeriodExpiresAt && user.gracePeriodExpiresAt > now;
    const hasActiveSub =
      isAdmin ||
      ((user.subscriptionStatus === 'basic' ||
        user.subscriptionStatus === 'premium') &&
        (user.subscriptionExpiresAt > now || isInGrace));

    // Поля которые отдаём фронту в каждом клубе списка (минимум для dropdown'а).
    const projection = {
      month: 1,
      year: 1,
      bookId: 1,
      title: 1,
      author: 1,
      startsAt: 1,
      endsAt: 1,
      archiveUntilDate: 1,
      isActive: 1,
      participantCount: 1,
      messageCount: 1,
    };

    // — Текущий (активный сейчас) —
    const currentDocs = await ClubMonth.find({
      startsAt: { $lte: now },
      endsAt: { $gte: now },
    })
      .select(projection)
      .sort({ startsAt: -1 })
      .lean();

    // — Архивные —
    // Подписчик/админ: все где endsAt < now (включая «навсегда»-архив).
    // Expired: только в окне archiveUntilDate >= now.
    const archiveFilter = hasActiveSub
      ? { endsAt: { $lt: now } }
      : { endsAt: { $lt: now }, archiveUntilDate: { $gte: now } };

    const archiveDocs = await ClubMonth.find(archiveFilter)
      .select(projection)
      .sort({ startsAt: -1 })
      .limit(12) // не больше года назад в dropdown'е
      .lean();

    // — Будущие —
    // Только подписчики и админ видят будущие клубы (анонс).
    const futureDocs = hasActiveSub
      ? await ClubMonth.find({ startsAt: { $gt: now } })
          .select(projection)
          .sort({ startsAt: 1 })
          .limit(3) // ближайшие 3 месяца вперёд
          .lean()
      : [];

    const withRelation = (docs, relation) =>
      docs.map((d) => ({ ...d, relation }));

    return success(res, {
      archive: withRelation(archiveDocs, 'archive'),
      current: withRelation(currentDocs, 'current'),
      future: withRelation(futureDocs, 'future'),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/club/current
 * Текущий активный клуб месяца.
 */
router.get('/current', resolveClubAccess, async (req, res, next) => {
  try {
    const book = await Book.findById(req.club.bookId).lean();
    return success(res, {
      club: req.club,
      book,
      access: req.clubAccess,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/club/:clubMonthId
 * Конкретный клуб по ID (для архивных или будущих).
 */
router.get('/:clubMonthId', resolveClubAccess, async (req, res, next) => {
  try {
    const book = await Book.findById(req.club.bookId).lean();
    return success(res, {
      club: req.club,
      book,
      access: req.clubAccess,
    });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                              ЧАТ                                   *
 * ------------------------------------------------------------------ */

/**
 * GET /api/club/:clubMonthId/chat
 * История сообщений чата клуба. Пагинация курсором (before).
 */
const chatListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z
    .string()
    .datetime()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
});

router.get(
  '/:clubMonthId/chat',
  validate(chatListSchema, 'query'),
  resolveClubAccess,
  async (req, res, next) => {
    try {
      const { limit, before } = req.query;
      const filter = {
        clubMonthId: req.club._id,
        isHidden: { $ne: true },
      };
      if (before) {
        filter.createdAt = { $lt: before };
      }

      const messages = await ChatMessage.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'name avatarUrl')
        .lean();

      return success(res, {
        messages,
        hasMore: messages.length === limit,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/club/:clubMonthId/chat
 * Создать text/image/voice сообщение в чате.
 */
const chatCreateSchema = z
  .object({
    type: z.enum(['text', 'image', 'voice']).default('text'),
    text: z.string().max(1000).optional().default(''),
    imageUrl: z.string().url().optional(),
    voiceUrl: z.string().optional(),
    voiceDurationSec: z.number().int().min(1).max(180).optional(),
    voiceWaveform: z.array(z.number().min(0).max(100)).length(40).optional(),
    replyToId: z
      .string()
      .refine((s) => mongoose.Types.ObjectId.isValid(s), {
        message: 'replyToId должен быть валидным ObjectId',
      })
      .optional(),
    mentions: z
      .array(
        z.string().refine((s) => mongoose.Types.ObjectId.isValid(s), {
          message: 'mention должен быть валидным ObjectId',
        })
      )
      .max(10)
      .optional()
      .default([]),
  })
  .refine(
    (data) => {
      if (data.type === 'text') return data.text && data.text.length > 0;
      if (data.type === 'image') return !!data.imageUrl;
      if (data.type === 'voice') {
        return !!data.voiceUrl && !!data.voiceDurationSec && !!data.voiceWaveform;
      }
      return false;
    },
    {
      message:
        'Для text — text не пустой; для image — imageUrl; для voice — voiceUrl + voiceDurationSec + voiceWaveform',
    }
  );

router.post(
  '/:clubMonthId/chat',
  validate(chatCreateSchema),
  resolveClubAccess,
  async (req, res, next) => {
    try {
      if (!req.clubAccess.canPost) {
        throw new AppError(
          'FORBIDDEN',
          'В архивном клубе нельзя отправлять сообщения',
          403
        );
      }

      if (req.body.replyToId) {
        const parent = await ChatMessage.findById(req.body.replyToId)
          .select('clubMonthId')
          .lean();
        if (!parent || !parent.clubMonthId.equals(req.club._id)) {
          throw new AppError(
            'NOT_FOUND',
            'Сообщение для ответа не найдено в этом клубе',
            404
          );
        }
      }

      const message = await ChatMessage.create({
        clubMonthId: req.club._id,
        userId: req.user.userId,
        type: req.body.type,
        text: req.body.text,
        imageUrl: req.body.imageUrl || null,
        voiceUrl: req.body.voiceUrl || null,
        voiceDurationSec: req.body.voiceDurationSec || null,
        voiceWaveform: req.body.voiceWaveform || [],
        replyToId: req.body.replyToId || null,
        mentions: req.body.mentions || [],
      });

      await ClubMonth.updateOne(
        { _id: req.club._id },
        { $inc: { messageCount: 1 } }
      );

      const populated = await ChatMessage.findById(message._id)
        .populate('userId', 'name avatarUrl')
        .lean();

      const io = req.app.get('io');
      emitToClub(io, req.club._id, 'chat:new_message', { message: populated });

      return success(res, { message: populated }, 201);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/club/chat/:messageId/report
 * Жалоба на сообщение. Apple Guideline 1.2.
 */
const reportSchema = z.object({
  reason: z.enum(['spam', 'inappropriate', 'offensive', 'copyright', 'other']),
  comment: z.string().max(500).optional().default(''),
});

router.post(
  '/chat/:messageId/report',
  validate(reportSchema),
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppError('NOT_FOUND', 'Неверный messageId', 400);
      }

      const message = await ChatMessage.findById(messageId)
        .select('clubMonthId userId')
        .lean();
      if (!message) {
        throw new AppError('NOT_FOUND', 'Сообщение не найдено', 404);
      }

      if (message.userId.equals(req.user.userId)) {
        throw new AppError(
          'FORBIDDEN',
          'Нельзя жаловаться на свои сообщения',
          403
        );
      }

      try {
        await Report.create({
          reporterUserId: req.user.userId,
          targetType: 'message',
          targetId: messageId,
          clubMonthId: message.clubMonthId,
          reason: req.body.reason,
          comment: req.body.comment,
        });
      } catch (err) {
        if (err.code === 11000) {
          throw new AppError(
            'DUPLICATE_KEY',
            'Вы уже жаловались на это сообщение',
            409
          );
        }
        throw err;
      }

      await ChatMessage.updateOne(
        { _id: messageId },
        { $inc: { reportCount: 1 } }
      );

      return success(res, { reported: true }, 201);
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                               Q&A                                  *
 * ------------------------------------------------------------------ */

/**
 * GET /api/club/:clubMonthId/qa
 * Список вопросов клуба.
 */
router.get('/:clubMonthId/qa', resolveClubAccess, async (req, res, next) => {
  try {
    const questions = await QAQuestion.find({ clubMonthId: req.club._id })
      .sort({ answeredAt: -1, createdAt: -1 })
      .populate('userId', 'name avatarUrl')
      .populate('answeredByUserId', 'name avatarUrl')
      .lean();

    return success(res, { questions });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/club/:clubMonthId/qa
 * Задать вопрос Анне.
 */
const qaCreateSchema = z.object({
  questionText: z.string().min(5).max(500).trim(),
});

router.post(
  '/:clubMonthId/qa',
  validate(qaCreateSchema),
  resolveClubAccess,
  async (req, res, next) => {
    try {
      if (!req.clubAccess.canPost) {
        throw new AppError(
          'FORBIDDEN',
          'В архивном клубе нельзя задавать вопросы',
          403
        );
      }

      const normalized = req.body.questionText
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

      const existing = await QAQuestion.find({
        clubMonthId: req.club._id,
      })
        .select('questionText')
        .lean();

      const isDuplicate = existing.some(
        (q) =>
          q.questionText.toLowerCase().replace(/\s+/g, ' ').trim() === normalized
      );
      if (isDuplicate) {
        throw new AppError('QA_DUPLICATE', 'Похожий вопрос уже задан', 409);
      }

      const question = await QAQuestion.create({
        clubMonthId: req.club._id,
        userId: req.user.userId,
        questionText: req.body.questionText,
      });

      const populated = await QAQuestion.findById(question._id)
        .populate('userId', 'name avatarUrl')
        .lean();

      return success(res, { question: populated }, 201);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
