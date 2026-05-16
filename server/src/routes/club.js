const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const multer = require('multer');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { resolveClubAccess } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const { emitToClub } = require('../socket');
const imageService = require('../services/image.service');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const QAQuestion = require('../models/QAQuestion');
const Report = require('../models/Report');
const Book = require('../models/Book');

const { ALLOWED_REACTIONS } = ChatMessage;

// Окно редактирования сообщения после отправки (как в Telegram — 48 часов;
// у нас 15 минут — книжный чат, правки только «опечатку поправить»).
const EDIT_WINDOW_MS = 15 * 60 * 1000;

// Запрет ссылок для участниц (продуктовое правило): обычные участницы НЕ
// могут отправлять ссылки в чат — антиспам/антифишинг. Анна (role=admin)
// может (анонсы, материалы). Стратегия — блокировать отправку (вариант А):
// сообщение со ссылкой от не-админа отклоняется с понятной ошибкой, текст
// не сохраняется (участница сам редактирует).
//
// Регэксп ловит явные ссылки и «голые» домены:
// - http:// / https:// схемы
// - www.<что-то>
// - <слово>.<tld>[/...] — домен вида site.ru, example.com/page
//   (tld 2-24 буквы, чтобы не цеплять «и т.д.», «т.е.» — там tld был бы
//   из 1-2 кириллических букв; список tld не проверяем, но требуем
//   латиницу в домене и tld, что отсекает обычные предложения)
const LINK_REGEX =
  /(https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.[a-z]{2,24}(\/[^\s]*)?/i;

function containsLink(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return LINK_REGEX.test(text);
}

// Бросает LINK_NOT_ALLOWED если текст содержит ссылку И юзер не админ.
// isAdmin вычисляется один раз на запрос (см. вызовы ниже).
function assertNoLinkForNonAdmin(text, isAdmin) {
  if (isAdmin) return;
  if (containsLink(text)) {
    throw new AppError(
      'LINK_NOT_ALLOWED',
      'Ссылки в чате запрещены. Уберите ссылку из сообщения',
      403
    );
  }
}

// Populate-спека для reply: подтягиваем РОДИТЕЛЬСКОЕ сообщение со снапшотом
// автора. Это устраняет баг «ответы без пользователя»: раньше клиент сам
// искал родителя среди загруженных сообщений (первые 20) — если родитель
// вне окна, превью было без автора («Участница»). Теперь снапшот родителя
// самодостаточен, как в Telegram (поле replyToId приходит populated-объектом
// с вложенным userId).
const REPLY_POPULATE = {
  path: 'replyToId',
  select: 'type text imageUrl voiceUrl deletedAt userId createdAt',
  populate: { path: 'userId', select: 'name avatarUrl' },
};

// Хелпер: загрузить сообщение по id с полным populate (автор + reply-снапшот).
function findMessagePopulated(id) {
  return ChatMessage.findById(id)
    .populate('userId', 'name avatarUrl')
    .populate(REPLY_POPULATE)
    .lean();
}

const router = Router();

// Все endpoints клуба требуют авторизацию.
router.use(requireAuth);

// Multer: храним загруженный файл в памяти (буфер), потом сами пишем на диск
// через image.service. memoryStorage т.к. файлы небольшие (макс 8 МБ),
// и нам нужно проверить mime/размер до записи.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageService.MAX_FILE_SIZE_BYTES },
});

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
        .populate(REPLY_POPULATE)
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
 *
 * Примечание: для image обычно используется POST .../chat/image (multipart),
 * который сам создаёт сообщение. Этот эндпоинт принимает уже готовый imageUrl
 * (на случай если клиент шлёт ссылку), но штатный путь картинки — через
 * /chat/image ниже.
 *
 * Запрет ссылок: участницы (не admin) не могут слать ссылки в text —
 * см. assertNoLinkForNonAdmin.
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

      // Запрет ссылок для не-админов (text-сообщения).
      const author = await User.findById(req.user.userId)
        .select('role')
        .lean();
      const isAdmin = author && author.role === 'admin';
      assertNoLinkForNonAdmin(req.body.text, isAdmin);

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

      const populated = await findMessagePopulated(message._id);

      const io = req.app.get('io');
      emitToClub(io, req.club._id, 'chat:new_message', { message: populated });

      return success(res, { message: populated }, 201);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/club/:clubMonthId/chat/image
 * Загрузить картинку в чат (multipart/form-data, поле "image").
 * Опционально поля: text (caption, до 1000), replyToId.
 *
 * Поток:
 * 1. multer принимает файл в память (лимит 8 МБ).
 * 2. Проверяем mime по白списку (jpeg/png/webp/heic/heif).
 * 3. Пишем файл на диск: AUDIO_BASE_PATH/club-images/<clubId>/<uuid>.<ext>.
 * 4. Создаём ChatMessage type=image, imageUrl = signed URL (TTL 1 час).
 * 5. Эмитим chat:new_message в комнату клуба.
 *
 * Apple Guideline 1.2 (UGC): картинка — пользовательский контент. На неё
 * распространяется тот же report-флоу что на текст (см. /chat/:messageId/report),
 * + модерация в админке (reportCount, isHidden).
 *
 * isHidden по умолчанию false. Жалоба инкрементит reportCount; админ
 * скрывает через существующий /api/admin/reports/action (задача 4.4).
 *
 * Запрет ссылок: участницы (не admin) не могут слать ссылки в caption.
 */
router.post(
  '/:clubMonthId/chat/image',
  resolveClubAccess,
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.clubAccess.canPost) {
        throw new AppError(
          'FORBIDDEN',
          'В архивном клубе нельзя отправлять сообщения',
          403
        );
      }

      if (!req.file) {
        throw new AppError('VALIDATION', 'Файл картинки не передан', 400);
      }

      const ext = imageService.ALLOWED_MIME.get(req.file.mimetype);
      if (!ext) {
        throw new AppError(
          'VALIDATION',
          'Недопустимый тип файла. Разрешены JPEG, PNG, WEBP, HEIC',
          400
        );
      }

      // Caption и reply — опциональны.
      const caption =
        typeof req.body.text === 'string'
          ? req.body.text.slice(0, 1000)
          : '';

      // Запрет ссылок для не-админов (в подписи картинки).
      const author = await User.findById(req.user.userId)
        .select('role')
        .lean();
      const isAdmin = author && author.role === 'admin';
      assertNoLinkForNonAdmin(caption, isAdmin);

      let replyToId = null;
      if (req.body.replyToId) {
        if (!mongoose.Types.ObjectId.isValid(req.body.replyToId)) {
          throw new AppError('VALIDATION', 'Неверный replyToId', 400);
        }
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
        replyToId = req.body.replyToId;
      }

      // Пишем файл на диск.
      const dir = imageService.clubImagesDir(req.club._id);
      await fs.promises.mkdir(dir, { recursive: true });
      const fileName = imageService.generateImageFileName(ext);
      const fullPath = path.join(dir, fileName);
      await fs.promises.writeFile(fullPath, req.file.buffer);

      const relPath = imageService.relativeImagePath(
        req.club._id,
        fileName
      );
      const signedUrl = imageService.generateImageSignedUrl(relPath);

      const message = await ChatMessage.create({
        clubMonthId: req.club._id,
        userId: req.user.userId,
        type: 'image',
        text: caption,
        imageUrl: signedUrl,
        // imageStoragePath — относительный путь, чтобы можно было перевыпустить
        // signed URL при истечении (клиент перезапросит сообщение/историю).
        imageStoragePath: relPath,
        replyToId,
        mentions: [],
      });

      await ClubMonth.updateOne(
        { _id: req.club._id },
        { $inc: { messageCount: 1 } }
      );

      const populated = await findMessagePopulated(message._id);

      const io = req.app.get('io');
      emitToClub(io, req.club._id, 'chat:new_message', { message: populated });

      return success(res, { message: populated }, 201);
    } catch (err) {
      // multer выбрасывает ошибку лимита размера — переводим в AppError.
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError('VALIDATION', 'Файл больше 8 МБ', 400)
          );
        }
        return next(new AppError('VALIDATION', 'Ошибка загрузки файла', 400));
      }
      return next(err);
    }
  }
);

/**
 * PATCH /api/club/chat/:messageId
 * Редактировать своё сообщение (задача 4.8).
 *
 * Body: { text } — новый текст (для type=text) или подпись (для type=image).
 *
 * Правила (как в Telegram):
 * - Только автор может редактировать своё сообщение.
 * - Окно редактирования — EDIT_WINDOW_MS (15 минут после отправки).
 * - Голосовые (type=voice) не редактируются — нечего (нет текста).
 * - Картинку нельзя заменить, только подпись.
 * - Удалённые (deletedAt) — нельзя.
 * - Проставляем editedAt — клиент покажет «изменено».
 * - Запрет ссылок: участница не может вписать ссылку при редактировании
 *   (иначе можно обойти запрет — отправить «ок», потом отредактировать
 *   в ссылку). Админ может.
 *
 * Эмитит chat:message_edited с обновлённым сообщением.
 */
const editSchema = z.object({
  text: z.string().min(1).max(1000),
});

router.patch(
  '/chat/:messageId',
  validate(editSchema),
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppError('NOT_FOUND', 'Неверный messageId', 400);
      }

      const message = await ChatMessage.findById(messageId);
      if (!message || message.deletedAt || message.isHidden) {
        throw new AppError('NOT_FOUND', 'Сообщение не найдено', 404);
      }

      if (String(message.userId) !== String(req.user.userId)) {
        throw new AppError(
          'FORBIDDEN',
          'Можно редактировать только свои сообщения',
          403
        );
      }

      if (message.type === 'voice') {
        throw new AppError(
          'FORBIDDEN',
          'Голосовые сообщения нельзя редактировать',
          403
        );
      }

      const age = Date.now() - new Date(message.createdAt).getTime();
      if (age > EDIT_WINDOW_MS) {
        throw new AppError(
          'EDIT_WINDOW_EXPIRED',
          'Прошло больше 15 минут — сообщение нельзя изменить',
          403
        );
      }

      // Запрет ссылок при редактировании для не-админов (антиобход).
      const editor = await User.findById(req.user.userId)
        .select('role')
        .lean();
      const isAdmin = editor && editor.role === 'admin';
      assertNoLinkForNonAdmin(req.body.text, isAdmin);

      message.text = req.body.text;
      message.editedAt = new Date();
      await message.save();

      const populated = await findMessagePopulated(message._id);

      const io = req.app.get('io');
      emitToClub(io, message.clubMonthId, 'chat:message_edited', {
        message: populated,
      });

      return success(res, { message: populated });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * DELETE /api/club/chat/:messageId
 * Удалить своё сообщение (задача 4.8). Soft delete.
 *
 * Правила:
 * - Автор может удалить своё. Админ — любое (модерация).
 * - Soft delete: проставляем deletedAt, текст/картинку оставляем в БД
 *   (для аудита и контекста reply). На клиенте — «Сообщение удалено».
 * - Голосовые тоже можно удалять (deletedAt — общий механизм).
 *
 * Эмитит chat:message_deleted с messageId — клиент перерисует bubble
 * как удалённое (НЕ убирает из ленты целиком — reply-контекст должен
 * остаться, как в Telegram).
 */
router.delete('/chat/:messageId', async (req, res, next) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      throw new AppError('NOT_FOUND', 'Неверный messageId', 400);
    }

    const message = await ChatMessage.findById(messageId);
    if (!message || message.deletedAt) {
      throw new AppError('NOT_FOUND', 'Сообщение не найдено', 404);
    }

    const user = await User.findById(req.user.userId).select('role').lean();
    const isAdmin = user && user.role === 'admin';
    const isAuthor = String(message.userId) === String(req.user.userId);

    if (!isAuthor && !isAdmin) {
      throw new AppError(
        'FORBIDDEN',
        'Можно удалять только свои сообщения',
        403
      );
    }

    message.deletedAt = new Date();
    await message.save();

    const io = req.app.get('io');
    emitToClub(io, message.clubMonthId, 'chat:message_deleted', {
      messageId: String(message._id),
    });

    return success(res, { deleted: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/club/chat/:messageId/reaction
 * Поставить/снять реакцию на сообщение (toggle). Задача 4.7.
 *
 * Body: { emoji } — один из ALLOWED_REACTIONS (6 эмодзи белый список).
 *
 * Логика (как в Telegram — один юзер = одна реакция на сообщение):
 * - Если юзер уже поставил ЭТОТ эмодзи → снимаем (toggle off).
 * - Если юзер поставил ДРУГОЙ эмодзи → переносим на новый.
 * - Если не реагировал → добавляем.
 * - Пустые группы (без userIds) удаляем из массива.
 *
 * Эмитит chat:reaction_updated в комнату клуба с полным массивом reactions
 * (клиенты заменяют локальный массив реакций целиком — проще консистентность).
 *
 * Доступ: нужен resolveClubAccess (любой кто видит клуб может реагировать,
 * включая архивный read-only — реакция это не «сообщение», это лёгкий signal;
 * но забаненный/без доступа — не пройдёт middleware).
 */
const reactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTIONS),
});

router.post(
  '/chat/:messageId/reaction',
  validate(reactionSchema),
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppError('NOT_FOUND', 'Неверный messageId', 400);
      }

      const { emoji } = req.body;
      const userId = req.user.userId;

      const message = await ChatMessage.findById(messageId);
      if (!message || message.isHidden) {
        throw new AppError('NOT_FOUND', 'Сообщение не найдено', 404);
      }

      const userIdStr = String(userId);

      // Убираем юзера из всех групп реакций (один юзер = одна реакция).
      let hadThisEmoji = false;
      for (const r of message.reactions) {
        const idx = r.userIds.findIndex((u) => String(u) === userIdStr);
        if (idx !== -1) {
          if (r.emoji === emoji) hadThisEmoji = true;
          r.userIds.splice(idx, 1);
        }
      }

      // Если юзер НЕ снимал этот же эмодзи — значит ставит реакцию.
      if (!hadThisEmoji) {
        const existing = message.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          existing.userIds.push(userId);
        } else {
          message.reactions.push({ emoji, userIds: [userId] });
        }
      }

      // Чистим пустые группы.
      message.reactions = message.reactions.filter(
        (r) => r.userIds.length > 0
      );

      await message.save();

      const io = req.app.get('io');
      emitToClub(io, message.clubMonthId, 'chat:reaction_updated', {
        messageId: String(message._id),
        reactions: message.reactions.map((r) => ({
          emoji: r.emoji,
          userIds: r.userIds.map((u) => String(u)),
        })),
      });

      return success(res, {
        messageId: String(message._id),
        reactions: message.reactions,
      });
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
