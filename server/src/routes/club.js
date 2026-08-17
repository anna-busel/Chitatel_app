const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const multer = require('multer');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const {
  resolveClubAccess,
  computeClubAccess,
  clubMonthKey,
} = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const { emitToClub } = require('../socket');
const imageService = require('../services/image.service');
const voiceService = require('../services/voice.service');
const pushService = require('../services/push.service');
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

// Базовый фильтр сообщений чата для ОТДАЧИ истории (GET /chat, /context).
// Исключает:
// - isHidden (скрытые модератором)
// - deletedAt (удалённые — soft delete)
//
// КРИТИЧНО фильтровать deletedAt именно ЗДЕСЬ (на сервере, в запросе), а не
// на клиенте. Раньше удалённые отсеивались только на клиенте (_notDeleted),
// а лимит .limit(20) применялся к запросу ВКЛЮЧАЯ удалённые → сервер брал 20
// новейших СТРОК, среди которых были удалённые, клиент их выбрасывал, и в
// ленте оставалось непредсказуемо мало живых (то 3, то 5, то 6 — сколько
// удалённых попало в окно из 20). Из-за этого после перезахода часть живых
// сообщений «пропадала» (их вытеснили удалённые из лимита). Фильтруя
// deletedAt в запросе, лимит применяется к ЖИВЫМ сообщениям — клиент получает
// ровно столько живых, сколько просил.
const liveMessagesFilter = (clubMonthId) => ({
  clubMonthId,
  isHidden: { $ne: true },
  deletedAt: null,
});

/* ------------------------------------------------------------------ *
 *              БЛОКИРОВКА УЧАСТНИКОВ (Фаза 6, A1)                     *
 * ------------------------------------------------------------------ */

/**
 * Список заблокированных текущим пользователем (Apple Guideline 1.2).
 *
 * Блокировка односторонняя: тот, кого заблокировали, продолжает видеть чат;
 * скрываются только ЕГО сообщения — у того, кто заблокировал.
 *
 * Управление списком — POST/DELETE /api/users/:id/block (routes/users.js).
 */
async function getBlockedIds(userId) {
  const me = await User.findById(userId).select('blockedUsers').lean();
  if (!me || !Array.isArray(me.blockedUsers)) return [];
  return me.blockedUsers;
}

/**
 * Вырезает reply-снапшот, если его автор заблокирован.
 *
 * Зачем отдельно: сообщения заблокированного отсекаются фильтром запроса
 * ($nin по userId), но их текст/картинка могут ПРОТЕЧЬ через превью ответа —
 * когда кто-то другой ответил на сообщение заблокированного, populated
 * replyToId несёт его контент. Обнуляем превью (сам ответ остаётся в ленте,
 * как удалённый родитель — клиент просто не рисует блок цитаты).
 *
 * blockedSet — Set строковых id (быстрая проверка без обращений к БД).
 */
function stripBlockedReply(message, blockedSet) {
  if (!message || typeof message !== 'object') return message;
  if (blockedSet.size === 0) return message;

  const reply = message.replyToId;
  if (reply && typeof reply === 'object' && reply.userId) {
    // userId в снапшоте populated ({_id, name, avatarUrl}), но подстрахуемся
    // и от «сырого» ObjectId.
    const authorId =
      reply.userId && reply.userId._id ? reply.userId._id : reply.userId;
    if (blockedSet.has(String(authorId))) {
      message.replyToId = null;
    }
  }
  return message;
}

// Populate-спека для reply: подтягиваем РОДИТЕЛЬСКОЕ сообщение со снапшотом
// автора. Это устраняет баг «ответы без пользователя»: раньше клиент сам
// искал родителя среди загруженных сообщений (первые 20) — если родитель
// вне окна, превью было без автора («Участница»). Теперь снапшот родителя
// самодостаточен, как в Telegram (поле replyToId приходит populated-объектом
// с вложенным userId).
const REPLY_POPULATE = {
  path: 'replyToId',
  select: 'type text imageUrl imageStoragePath voiceUrl voiceStoragePath deletedAt userId createdAt',
  populate: { path: 'userId', select: 'name avatarUrl' },
};

// Перевыпустить свежий signed URL для медиа сообщения.
//
// БАГ который чиним: imageUrl/voiceUrl сохраняются в БД при загрузке как
// signed URL с TTL 1 час. При отдаче истории отдавался этот сохранённый URL —
// через час подпись истекала, и после перезахода картинка/голосовое не
// грузились (пустая картинка). Решение: на КАЖДОЙ отдаче перевыпускаем URL
// из imageStoragePath/voiceStoragePath (относительный путь, хранится в БД
// именно для этого). Так ссылка всегда свежая.
//
// Работает с lean-объектами (из .lean()). Мутирует и возвращает тот же объект.
// Рекурсивно обновляет вложенный reply-снапшот (replyToId populated-объект).
function withFreshMedia(message) {
  if (!message || typeof message !== 'object') return message;

  if (message.imageStoragePath) {
    message.imageUrl = imageService.generateImageSignedUrl(
      message.imageStoragePath
    );
  }
  if (message.voiceStoragePath) {
    message.voiceUrl = voiceService.generateVoiceSignedUrl(
      message.voiceStoragePath
    );
  }

  // Reply-снапшот (populated объект) — тоже может быть картинкой/голосовым.
  if (message.replyToId && typeof message.replyToId === 'object') {
    withFreshMedia(message.replyToId);
  }

  return message;
}

// Хелпер: загрузить сообщение по id с полным populate (автор + reply-снапшот)
// и свежими signed URL медиа. readBy клиенту не отдаём (аудит S7).
async function findMessagePopulated(id) {
  const message = await ChatMessage.findById(id)
    .select('-readBy')
    .populate('userId', 'name avatarUrl')
    .populate(REPLY_POPULATE)
    .lean();
  return withFreshMedia(message);
}

// Проверка доступа к клубу СООБЩЕНИЯ для эндпоинтов вида /chat/:messageId
// (в URL нет clubMonthId, поэтому resolveClubAccess там не применим) —
// аудит M13/C2. Правила те же: бан → 403 CLUB_BLOCKED, нет доступа по
// computeClubAccess → 403 SUBSCRIPTION_REQUIRED. Возвращает lean user
// (с role — нужен вызывающим для проверки админа), чтобы не грузить дважды.
async function assertClubAccessForMessage(userId, clubMonthId) {
  const [user, club] = await Promise.all([
    User.findById(userId)
      .select(
        'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt clubMonthsEntitled role isBanned mutedUntil'
      )
      .lean(),
    ClubMonth.findById(clubMonthId).lean(),
  ]);

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
  if (!club || !computeClubAccess(user, club, new Date())) {
    throw new AppError(
      'SUBSCRIPTION_REQUIRED',
      'Для доступа к клубу нужна подписка',
      403
    );
  }
  return user;
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

// Отдельный multer для голосовых (4.12) — свой лимит размера (~4 МБ,
// AAC 64kbps mono за 3 мин ≈ 1.4 МБ, берём с запасом).
const uploadVoice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: voiceService.MAX_FILE_SIZE_BYTES },
});

/* ------------------------------------------------------------------ *
 *                          ИНФА О КЛУБЕ                              *
 * ------------------------------------------------------------------ */

/**
 * GET /api/club/list
 * Список клубов которые юзер может открыть.
 *
 * Возвращает три категории:
 * - archive[] — прошлые клубы в 31-дневном окне (archiveUntilDate >= now).
 *               Одинаково для подписчика и expired (модель доступа 08.07).
 *               Админ видит все архивы (модерация/история).
 * - current[] — текущий активный клуб (0 или 1 элемент)
 * - future[] — ближайшие будущие клубы: админу все; подписчику — только те,
 *              что в его оплаченном наборе clubMonthsEntitled (аудит M2)
 *
 * Используется фронтом для построения dropdown'а переключения клубов.
 * Для каждогоклуба возвращаем минимум полей + relation ('archive'/'current'/'future').
 */
router.get('/list', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select(
        'subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt clubMonthsEntitled role isBanned'
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
    // МОДЕЛЬ ДОСТУПА: архив = ОПЛАЧЕННЫЕ клубы в архивном окне. Бонус-месяц:
    // клуб живёт свой месяц + весь следующий календарный, продление не нужно.
    // Старше окна закрыто всем кроме админа. Админ видит все архивы
    // (модерация/история). Синхронно с computeClubAccess.
    const archiveFilter = isAdmin
      ? { endsAt: { $lt: now } }
      : { endsAt: { $lt: now }, archiveUntilDate: { $gte: now } };

    let archiveDocs = await ClubMonth.find(archiveFilter)
      .select(projection)
      .sort({ startsAt: -1 })
      .limit(12) // не больше года назад в dropdown'е
      .lean();

    // ⛔️ 17.08.2026 — фильтр по оплаченному набору обязателен, не убирать.
    // Без него в списке архива висел клуб, который человек не оплачивал
    // (сентябрьский подписчик видел август), и открыть его теперь всё равно
    // нельзя — computeClubAccess отдаст 403. Показывать то, что не открывается,
    // хуже, чем не показывать.
    if (!isAdmin) {
      const archiveKeys = new Set(user.clubMonthsEntitled || []);
      archiveDocs = archiveDocs.filter((d) => archiveKeys.has(clubMonthKey(d)));
    }

    // — Будущие —
    // Админ видит все будущие клубы. Подписчик — только те, что уже оплачены
    // вперёд (ключ месяца клуба в user.clubMonthsEntitled — как в
    // resolveClubAccess/computeClubAccess), а не любой активный подписчик (M2).
    let futureDocs = [];
    if (hasActiveSub) {
      futureDocs = await ClubMonth.find({ startsAt: { $gt: now } })
        .select(projection)
        .sort({ startsAt: 1 })
        .limit(3) // ближайшие 3 месяца вперёд
        .lean();
      if (!isAdmin) {
        const coveredKeys = new Set(user.clubMonthsEntitled || []);
        futureDocs = futureDocs.filter((d) => coveredKeys.has(clubMonthKey(d)));
      }
    }

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
 * GET /api/club/:clubMonthId/mentionable
 * Список тех, кого можно упомянуть через @ в чате клуба (задача 4.9).
 *
 * Продуктовое решение (16.05.2026, вариант А): в книжном клубе осмысленно
 * упоминать ВЕДУЩУЮ (Анну, role=admin) — чтобы она не пропустила обращение.
 * Тегать любую участницу в MVP не нужно (это не групповой флуд-чат, а
 * сообщество вокруг разбора книги). Эндпоинт расширяем: если позже
 * понадобится тегать участниц — добавим их сюда же.
 *
 * Возвращает { mentionable: [{ id, name, avatarUrl, isAdmin }] }.
 * Клиент строит автокомплит по '@': показывает этот список (обычно 1 —
 * Анна), фильтрует по вводу после '@'.
 */
router.get(
  '/:clubMonthId/mentionable',
  resolveClubAccess,
  async (req, res, next) => {
    try {
      const admins = await User.find({ role: 'admin' })
        .select('name avatarUrl')
        .sort({ name: 1 })
        .lean();

      const mentionable = admins.map((u) => ({
        id: String(u._id),
        name: u.name,
        avatarUrl: u.avatarUrl || null,
        isAdmin: true,
      }));

      return success(res, { mentionable });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/club/:clubMonthId/chat
 * История сообщений чата клуба. Пагинация курсором (before).
 *
 * Удалённые (deletedAt) и скрытые (isHidden) НЕ отдаются — фильтруются в
 * запросе (liveMessagesFilter), поэтому лимит применяется к ЖИВЫМ сообщениям.
 * Это важно: раньше удалённые отсеивались только на клиенте, а лимит брал 20
 * строк включая удалённые → после перезахода живых оставалось непредсказуемо
 * мало (часть «пропадала»).
 *
 * ЗАБЛОКИРОВАННЫЕ (Фаза 6, A1 — Apple Guideline 1.2): сообщения тех, кого
 * пользователь заблокировал, не отдаются вовсе ($nin по userId), закреп от
 * заблокированного не показывается, а reply-снапшот на его сообщение
 * обнуляется (иначе контент протёк бы через превью ответа).
 *
 * Дополнительно (если это ПЕРВАЯ страница, т.е. before не задан) возвращает
 * pinnedMessage — закреплённое сообщение клуба (populated). Это нужно, чтобы
 * баннер закрепа был виден СРАЗУ при входе в чат, даже если само закреплённое
 * сообщение далеко в истории и не попало в первые 20 загруженных (как в
 * Telegram — закреп всегда виден сверху). Раньше клиент искал закреп только
 * среди загруженных сообщений → при входе баннера не было, пока не доскроллишь.
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

      const blockedIds = await getBlockedIds(req.user.userId);
      const blockedSet = new Set(blockedIds.map(String));

      const filter = liveMessagesFilter(req.club._id);
      if (blockedIds.length > 0) {
        filter.userId = { $nin: blockedIds };
      }
      if (before) {
        filter.createdAt = { $lt: before };
      }

      const messages = await ChatMessage.find(filter)
        .select('-readBy') // read receipts клиенту не отдаём (аудит S7)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'name avatarUrl')
        .populate(REPLY_POPULATE)
        .lean();

      // Перевыпускаем свежие signed URL медиа (фикс протухших картинок/голосовых).
      messages.forEach(withFreshMedia);
      // Вырезаем reply-превью на сообщения заблокированных.
      messages.forEach((m) => stripBlockedReply(m, blockedSet));

      // Закреплённое сообщение — отдаём отдельно ТОЛЬКО на первой странице
      // (before не задан), чтобы баннер закрепа был виден сразу при входе.
      // На страницах пагинации (before задан) не нужно — баннер уже показан.
      let pinnedMessage = null;
      if (!before && req.club.pinnedMessageId) {
        const pinned = await findMessagePopulated(req.club.pinnedMessageId);
        // Не отдаём если удалено/скрыто (баннер должен исчезнуть) или если
        // автор закрепа заблокирован этим пользователем.
        const pinnedAuthorId =
          pinned && pinned.userId && pinned.userId._id
            ? pinned.userId._id
            : pinned && pinned.userId;
        const pinnedAuthorBlocked =
          pinnedAuthorId && blockedSet.has(String(pinnedAuthorId));

        if (pinned && !pinned.deletedAt && !pinned.isHidden && !pinnedAuthorBlocked) {
          pinnedMessage = stripBlockedReply(pinned, blockedSet);
        }
      }

      return success(res, {
        messages,
        hasMore: messages.length === limit,
        pinnedMessage,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/club/:clubMonthId/chat/context/:messageId
 * Контекст вокруг конкретного сообщения (для перехода к закрепу / reply,
 * как в Telegram). Возвращает целевое сообщение + N до и N после него.
 *
 * Зачем: тап по баннеру закрепа или по reply-превью должен ВСЕГДА вести к
 * оригиналу, даже если он далеко в истории и не загружен в текущем окне.
 * Старая реализация скроллила только если сообщение уже в загруженных
 * _messages — иначе молча ничего. Теперь клиент при таком тапе запрашивает
 * этот эндпоинт, перестраивает ленту вокруг цели и подсвечивает её.
 *
 * Удалённые/скрытые соседи не отдаются (liveMessagesFilter) — как и в /chat.
 * Сообщения заблокированных — тоже не отдаются (A1); если заблокирован автор
 * САМОГО целевого сообщения — 404 (его в ленте для этого юзера не существует).
 *
 * Query: radius (сколько сообщений до и после, 1-30, default 15).
 *
 * Ответ:
 * - messages[] — DESC по createdAt (как и /chat), включает целевое + соседей
 * - targetId — id целевого (для подсветки на клиенте)
 * - hasMoreBefore — есть ли ещё более старые (для догрузки скроллом вверх)
 * - hasMoreAfter — есть ли ещё более новые (для догрузки скроллом вниз /
 *   кнопки «вниз»)
 *
 * Если целевое скрыто модератором (isHidden) или не в этом клубе — 404.
 */
const chatContextSchema = z.object({
  radius: z.coerce.number().int().min(1).max(30).default(15),
});

router.get(
  '/:clubMonthId/chat/context/:messageId',
  validate(chatContextSchema, 'query'),
  resolveClubAccess,
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      const { radius } = req.query;

      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppError('NOT_FOUND', 'Неверный messageId', 400);
      }

      const blockedIds = await getBlockedIds(req.user.userId);
      const blockedSet = new Set(blockedIds.map(String));

      const target = await ChatMessage.findById(messageId).lean();
      if (
        !target ||
        target.isHidden ||
        target.deletedAt ||
        !target.clubMonthId.equals(req.club._id) ||
        blockedSet.has(String(target.userId))
      ) {
        throw new AppError(
          'NOT_FOUND',
          'Сообщение не найдено в этом клубе',
          404
        );
      }

      const baseFilter = liveMessagesFilter(req.club._id);
      if (blockedIds.length > 0) {
        baseFilter.userId = { $nin: blockedIds };
      }

      // Соседи СТАРШЕ целевого (createdAt < target) — DESC, берём radius штук.
      const older = await ChatMessage.find({
        ...baseFilter,
        createdAt: { $lt: target.createdAt },
      })
        .select('-readBy')
        .sort({ createdAt: -1 })
        .limit(radius)
        .populate('userId', 'name avatarUrl')
        .populate(REPLY_POPULATE)
        .lean();

      // Соседи НОВЕЕ целевого (createdAt > target) — ASC чтобы взять ближайшие
      // radius штук, потом развернём в DESC для единообразия с лентой.
      const newerAsc = await ChatMessage.find({
        ...baseFilter,
        createdAt: { $gt: target.createdAt },
      })
        .select('-readBy')
        .sort({ createdAt: 1 })
        .limit(radius)
        .populate('userId', 'name avatarUrl')
        .populate(REPLY_POPULATE)
        .lean();

      // Целевое — с полным populate (как остальные).
      const targetPopulated = await findMessagePopulated(target._id);

      // Собираем единую ленту в DESC (новые первыми, как /chat и как рендерит
      // клиент с reverse=true): [newer DESC] + [target] + [older DESC].
      const newerDesc = newerAsc.slice().reverse();
      const messages = [...newerDesc, targetPopulated, ...older];

      // Перевыпускаем свежие signed URL медиа для всех (target уже обновлён
      // в findMessagePopulated, но older/newer — нет; повторный вызов идемпотентен).
      messages.forEach(withFreshMedia);
      // Вырезаем reply-превью на сообщения заблокированных.
      messages.forEach((m) => stripBlockedReply(m, blockedSet));

      // Есть ли ещё сообщения за пределами этого окна — для догрузки.
      const hasMoreAfter = newerAsc.length === radius;
      const hasMoreBefore = older.length === radius;

      return success(res, {
        messages,
        targetId: String(target._id),
        hasMoreBefore,
        hasMoreAfter,
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
 * Примечание: картинки — ТОЛЬКО через POST .../chat/image (multipart),
 * который сам пишет файл и ставит imageUrl/imageStoragePath. Аудит P12: этот
 * эндпоинт больше НЕ принимает внешний imageUrl из тела (type='image' → 400),
 * чтобы нельзя было подсунуть произвольную ссылку. Голосовые — только через
 * /chat/voice (multipart).
 *
 * Запрет ссылок: участницы (не admin) не могут слать ссылки в text —
 * см. assertNoLinkForNonAdmin.
 *
 * Mentions (4.9): клиент присылает mentions[] — массив userId упомянутых
 * через @. Сервер фильтрует его — оставляет только реальных админов
 * (вариант А: упоминать можно только Анну). Это защита от подделки
 * (клиент не может «упомянуть» произвольного юзера). Push по mentions —
 * в Фазе 6.
 */
const chatCreateSchema = z
  .object({
    type: z.enum(['text', 'image', 'voice']).default('text'),
    text: z.string().max(1000).optional().default(''),
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
      // image — валидируется ниже в роуте (всегда 400: только через /chat/image)
      if (data.type === 'image') return true;
      if (data.type === 'voice') {
        return !!data.voiceUrl && !!data.voiceDurationSec && !!data.voiceWaveform;
      }
      return false;
    },
    {
      message:
        'Для text — text не пустой; для voice — voiceUrl + voiceDurationSec + voiceWaveform',
    }
  );

// Отфильтровать mentions[] от клиента — оставить только реальных админов
// (вариант А: упоминать можно только Анну). Защита от подделки: клиент не
// может «упомянуть» произвольного юзера, проставив чужой userId.
async function sanitizeMentions(rawMentions) {
  if (!Array.isArray(rawMentions) || rawMentions.length === 0) return [];
  const unique = [...new Set(rawMentions.map(String))];
  const admins = await User.find({
    _id: { $in: unique },
    role: 'admin',
  })
    .select('_id')
    .lean();
  return admins.map((u) => u._id);
}

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

      // Голосовые не создаём через этот эндпоинт — только через /chat/voice
      // (там проверка role=admin + загрузка файла). Защита от обхода правила
      // «голосовые только Анна» через прямой JSON с voiceUrl.
      if (req.body.type === 'voice') {
        throw new AppError(
          'FORBIDDEN',
          'Голосовые отправляются только через загрузку записи',
          403
        );
      }

      // Аудит P12: картинки — только через /chat/image (multipart). Внешний
      // imageUrl из тела не принимаем и не сохраняем.
      if (req.body.type === 'image') {
        throw new AppError(
          'VALIDATION_ERROR',
          'Картинки — через /chat/image',
          400
        );
      }

      // Запрет ссылок для не-админов (text-сообщения).
      const author = await User.findById(req.user.userId)
        .select('role name')
        .lean();
      const isAdmin = author && author.role === 'admin';
      assertNoLinkForNonAdmin(req.body.text, isAdmin);

      let parentAuthorId = null;
      if (req.body.replyToId) {
        const parent = await ChatMessage.findById(req.body.replyToId)
          .select('clubMonthId userId')
          .lean();
        if (!parent || !parent.clubMonthId.equals(req.club._id)) {
          throw new AppError(
            'NOT_FOUND',
            'Сообщение для ответа не найдено в этом клубе',
            404
          );
        }
        parentAuthorId = parent.userId;
      }

      const mentions = await sanitizeMentions(req.body.mentions);

      const message = await ChatMessage.create({
        clubMonthId: req.club._id,
        userId: req.user.userId,
        type: req.body.type,
        text: req.body.text,
        imageUrl: null,
        voiceUrl: null,
        voiceDurationSec: null,
        voiceWaveform: [],
        replyToId: req.body.replyToId || null,
        mentions,
      });

      await ClubMonth.updateOne(
        { _id: req.club._id },
        { $inc: { messageCount: 1 } }
      );

      const populated = await findMessagePopulated(message._id);

      const io = req.app.get('io');
      emitToClub(io, req.club._id, 'chat:new_message', { message: populated });

      // Push (задача 6.1): автору сообщения, на которое ответили (reply), и
      // упомянутым через @ (по дизайну sanitizeMentions — только админы, т.е.
      // @ уведомляет Анну). Fire-and-forget, гейт chatMessages, себе не шлём;
      // reply приоритетнее mention для одного человека.
      {
        const senderName = author && author.name ? author.name : 'Участница';
        const t = (req.body.text || '').trim();
        const preview = t ? t.slice(0, 140) : 'Новое сообщение';
        const senderIdStr = String(req.user.userId);
        const targets = new Map();
        if (parentAuthorId && String(parentAuthorId) !== senderIdStr) {
          targets.set(String(parentAuthorId), 'chat_reply');
        }
        for (const m of mentions) {
          const mid = String(m);
          if (mid !== senderIdStr && !targets.has(mid)) {
            targets.set(mid, 'mention');
          }
        }
        for (const [uid, type] of targets) {
          pushService
            .sendToUser(
              uid,
              {
                title:
                  type === 'chat_reply'
                    ? `${senderName} ответил(а) вам`
                    : `${senderName} упомянул(а) вас`,
                body: preview,
                data: { type, clubMonthId: String(req.club._id) },
              },
              'chatMessages'
            )
            .catch(() => {});
        }
      }

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

      // Mentions в подписи картинки (вариант А: только админ).
      const mentions = await sanitizeMentions(
        Array.isArray(req.body.mentions)
          ? req.body.mentions
          : typeof req.body.mentions === 'string' && req.body.mentions
          ? [req.body.mentions]
          : []
      );

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
        mentions,
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
 * POST /api/club/:clubMonthId/chat/voice
 * Загрузить голосовое сообщение (multipart/form-data, поле "voice").
 * Задача 4.12.
 *
 * Поля формы:
 * - voice (файл .m4a, AAC) — обязательно
 * - durationSec (число, 1..180) — обязательно
 * - waveform (JSON-строка массива 40 чисел 0..100) — обязательно
 * - replyToId — опционально
 *
 * ПРОДУКТОВОЕ ПРАВИЛО: голосовые отправляет ТОЛЬКО Анна (role=admin).
 * Формат ведущей (разборы, ответы голосом), не общий чат участниц.
 * Не-админ → 403 VOICE_ADMIN_ONLY.
 *
 * Поток:
 * 1. uploadVoice принимает файл в память (лимит ~4 МБ).
 * 2. Проверяем role=admin.
 * 3. Проверяем mime (audio/mp4|m4a|aac).
 * 4. Пишем файл: AUDIO_BASE_PATH/voice-messages/<userId>/<uuid>.m4a.
 * 5. Создаём ChatMessage type=voice, voiceUrl = signed URL (TTL 1 час).
 * 6. Эмитим chat:new_message.
 *
 * Apple 1.2 (UGC): голосовое — пользовательский контент, тот же report-флоу
 * (жалоба + isHidden). Apple 5.1.2(iii): индикатор записи — на клиенте.
 */
router.post(
  '/:clubMonthId/chat/voice',
  resolveClubAccess,
  uploadVoice.single('voice'),
  async (req, res, next) => {
    try {
      if (!req.clubAccess.canPost) {
        throw new AppError(
          'FORBIDDEN',
          'В архивном клубе нельзя отправлять сообщения',
          403
        );
      }

      // Только Анна-admin отправляет голосовые.
      const author = await User.findById(req.user.userId)
        .select('role')
        .lean();
      if (!author || author.role !== 'admin') {
        throw new AppError(
          'VOICE_ADMIN_ONLY',
          'Голосовые сообщения может отправлять только ведущая клуба',
          403
        );
      }

      if (!req.file) {
        throw new AppError('VALIDATION', 'Файл записи не передан', 400);
      }

      const ext = voiceService.ALLOWED_MIME.get(req.file.mimetype);
      if (!ext) {
        throw new AppError(
          'VALIDATION',
          'Недопустимый формат аудио. Ожидается m4a (AAC)',
          400
        );
      }

      // Длительность.
      const durationSec = parseInt(req.body.durationSec, 10);
      if (
        !Number.isFinite(durationSec) ||
        durationSec < 1 ||
        durationSec > voiceService.MAX_DURATION_SEC
      ) {
        throw new AppError(
          'VALIDATION',
          `Длительность должна быть 1..${voiceService.MAX_DURATION_SEC} сек`,
          400
        );
      }

      // Waveform: JSON-строка массива из 40 чисел 0..100.
      let waveform;
      try {
        waveform = JSON.parse(req.body.waveform);
      } catch (_e) {
        waveform = null;
      }
      if (
        !Array.isArray(waveform) ||
        waveform.length !== 40 ||
        !waveform.every(
          (n) => typeof n === 'number' && n >= 0 && n <= 100
        )
      ) {
        throw new AppError(
          'VALIDATION',
          'waveform должен быть массивом из 40 чисел 0..100',
          400
        );
      }

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
      const dir = voiceService.voiceMessagesDir(req.user.userId);
      await fs.promises.mkdir(dir, { recursive: true });
      const fileName = voiceService.generateVoiceFileName();
      const fullPath = path.join(dir, fileName);
      await fs.promises.writeFile(fullPath, req.file.buffer);

      const relPath = voiceService.relativeVoicePath(
        req.user.userId,
        fileName
      );
      const signedUrl = voiceService.generateVoiceSignedUrl(relPath);

      const message = await ChatMessage.create({
        clubMonthId: req.club._id,
        userId: req.user.userId,
        type: 'voice',
        text: '',
        voiceUrl: signedUrl,
        voiceStoragePath: relPath,
        voiceDurationSec: durationSec,
        voiceWaveform: waveform,
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
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError('VALIDATION', 'Запись слишком большая', 400)
          );
        }
        return next(new AppError('VALIDATION', 'Ошибка загрузки записи', 400));
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

      // Доступ к клубу сообщения (бан / подписка) — аудит M13/C2.
      const editor = await assertClubAccessForMessage(
        req.user.userId,
        message.clubMonthId
      );

      // Запрет ссылок при редактировании для не-админов (антиобход).
      const isAdmin = editor.role === 'admin';
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

    // Доступ к клубу сообщения (бан / подписка) — аудит M13/C2.
    const user = await assertClubAccessForMessage(
      req.user.userId,
      message.clubMonthId
    );
    const isAdmin = user.role === 'admin';
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

    // Если удалили закреплённое — снимаем закреп с клуба (баннер исчезнет).
    await ClubMonth.updateOne(
      { _id: message.clubMonthId, pinnedMessageId: message._id },
      { $set: { pinnedMessageId: null } }
    );

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
 * Доступ: любой кто видит клуб может реагировать, включая архивный read-only
 * (реакция это не «сообщение», это лёгкий signal). В URL нет clubMonthId,
 * поэтому доступ проверяется по клубу сообщения — assertClubAccessForMessage
 * (бан / подписка → 403), аудит M13/C2.
 *
 * Аудит S5: вместо read-modify-write (findById → правка массива → save, где
 * параллельные реакции затирали друг друга) — атомарные $pull/$addToSet/$push.
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

      const message = await ChatMessage.findById(messageId)
        .select('clubMonthId reactions isHidden')
        .lean();
      if (!message || message.isHidden) {
        throw new AppError('NOT_FOUND', 'Сообщение не найдено', 404);
      }

      // Доступ к клубу сообщения (бан / подписка) — аудит M13/C2.
      await assertClubAccessForMessage(req.user.userId, message.clubMonthId);

      const userIdStr = String(userId);
      const uid = new mongoose.Types.ObjectId(userIdStr);

      // Юзер уже поставил ЭТОТ эмодзи → toggle off (только снять).
      const hadThisEmoji = (message.reactions || []).some(
        (r) =>
          r.emoji === emoji &&
          (r.userIds || []).some((u) => String(u) === userIdStr)
      );

      // 1. Снимаем юзера со ВСЕХ групп реакций (один юзер = одна реакция) —
      //    одна атомарная операция, чужие реакции не затираются.
      await ChatMessage.updateOne(
        { _id: message._id },
        { $pull: { 'reactions.$[].userIds': uid } }
      );

      // 2. Если не снимал этот же эмодзи — ставит: добавляем в группу emoji.
      //    Группа есть → $addToSet по позиционному $; нет → создаём $push
      //    (с фильтром «группы ещё нет», чтобы не задвоить при гонке).
      if (!hadThisEmoji) {
        const added = await ChatMessage.updateOne(
          { _id: message._id, 'reactions.emoji': emoji },
          { $addToSet: { 'reactions.$.userIds': uid } }
        );
        if (added.matchedCount === 0) {
          const pushed = await ChatMessage.updateOne(
            { _id: message._id, 'reactions.emoji': { $ne: emoji } },
            { $push: { reactions: { emoji, userIds: [uid] } } }
          );
          if (pushed.matchedCount === 0) {
            // Группа появилась параллельно — добавляем в неё.
            await ChatMessage.updateOne(
              { _id: message._id, 'reactions.emoji': emoji },
              { $addToSet: { 'reactions.$.userIds': uid } }
            );
          }
        }
      }

      // 3. Чистим пустые группы (отдельным апдейтом — MongoDB не даёт менять
      //    reactions и reactions.$[].userIds в одном запросе) и читаем итог.
      const updated = await ChatMessage.findOneAndUpdate(
        { _id: message._id },
        { $pull: { reactions: { userIds: { $size: 0 } } } },
        { new: true }
      )
        .select('reactions')
        .lean();

      const reactions = updated ? updated.reactions : [];

      const io = req.app.get('io');
      emitToClub(io, message.clubMonthId, 'chat:reaction_updated', {
        messageId: String(message._id),
        reactions: reactions.map((r) => ({
          emoji: r.emoji,
          userIds: r.userIds.map((u) => String(u)),
        })),
      });

      return success(res, {
        messageId: String(message._id),
        reactions,
      });
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * POST /api/club/chat/:messageId/report
 * Жалоба на сообщение. Apple Guideline 1.2.
 *
 * Жалоба на ПОЛЬЗОВАТЕЛЯ целиком и блокировка — отдельно, в routes/users.js
 * (POST /api/users/:id/report, POST/DELETE /api/users/:id/block).
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
 *                          ЗАКРЕП (4.10)                             *
 * ------------------------------------------------------------------ */

/**
 * POST /api/club/:clubMonthId/chat/:messageId/pin
 * Закрепить / открепить сообщение (задача 4.10).
 *
 * Body: { pinned: boolean } — true закрепить, false открепить.
 *
 * Правила:
 * - ТОЛЬКО Анна (role=admin) может закреплять/откреплять (как в Telegram —
 *   в канале закрепляет админ).
 * - 1 закреп на клуб (ClubMonth.pinnedMessageId). Новый закреп заменяет
 *   старый. isPinned на сообщениях синхронизируется (старое=false, новое=true).
 * - Нельзя закрепить удалённое/скрытое сообщение.
 *
 * Эмитит chat:pin_changed { pinnedMessageId } всем в клубе — баннер закрепа
 * у всех обновится в реальном времени.
 */
const pinSchema = z.object({
  pinned: z.boolean(),
});

router.post(
  '/:clubMonthId/chat/:messageId/pin',
  validate(pinSchema),
  resolveClubAccess,
  async (req, res, next) => {
    try {
      const { messageId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(messageId)) {
        throw new AppError('NOT_FOUND', 'Неверный messageId', 400);
      }

      const user = await User.findById(req.user.userId)
        .select('role')
        .lean();
      if (!user || user.role !== 'admin') {
        throw new AppError(
          'FORBIDDEN',
          'Закреплять сообщения может только ведущая клуба',
          403
        );
      }

      const message = await ChatMessage.findById(messageId);
      if (
        !message ||
        message.deletedAt ||
        message.isHidden ||
        !message.clubMonthId.equals(req.club._id)
      ) {
        throw new AppError(
          'NOT_FOUND',
          'Сообщение не найдено в этом клубе',
          404
        );
      }

      if (req.body.pinned) {
        // Снимаем флаг с прежнего закрепа (если был другой).
        if (
          req.club.pinnedMessageId &&
          String(req.club.pinnedMessageId) !== String(message._id)
        ) {
          await ChatMessage.updateOne(
            { _id: req.club.pinnedMessageId },
            { $set: { isPinned: false } }
          );
        }
        message.isPinned = true;
        await message.save();
        await ClubMonth.updateOne(
          { _id: req.club._id },
          { $set: { pinnedMessageId: message._id } }
        );
      } else {
        // Открепляем только если откреплеваемое — текущий закреп.
        message.isPinned = false;
        await message.save();
        if (
          req.club.pinnedMessageId &&
          String(req.club.pinnedMessageId) === String(message._id)
        ) {
          await ClubMonth.updateOne(
            { _id: req.club._id },
            { $set: { pinnedMessageId: null } }
          );
        }
      }

      const newPinnedId = req.body.pinned ? String(message._id) : null;

      const io = req.app.get('io');
      emitToClub(io, req.club._id, 'chat:pin_changed', {
        pinnedMessageId: newPinnedId,
      });

      return success(res, { pinnedMessageId: newPinnedId });
    } catch (err) {
      return next(err);
    }
  }
);

/* ------------------------------------------------------------------ *
 *                          READ RECEIPTS (4.11)                      *
 * ------------------------------------------------------------------ */

/**
 * POST /api/club/:clubMonthId/chat/read
 * Отметить сообщения прочитанными (задача 4.11).
 *
 * Body: { messageIds: [string] } — id сообщений которые юзер увидел.
 *
 * Логика: добавляем userId в readBy каждого сообщения ($addToSet — без
 * дублей). Используется в основном Анной — она видит сколько участниц
 * прочитали её сообщение/анонс. Лёгкая операция, без эмита по WS (read
 * receipts не требуют мгновенной доставки всем — это фоновая метрика;
 * клиент Анны подтянет при обновлении/перезаходе).
 *
 * Доступ — любой кто видит клуб (resolveClubAccess), включая архив (read-only
 * чтение всё равно «прочтение»). Бан/без доступа не пройдёт middleware.
 */
const readSchema = z.object({
  messageIds: z
    .array(
      z.string().refine((s) => mongoose.Types.ObjectId.isValid(s), {
        message: 'messageId должен быть валидным ObjectId',
      })
    )
    .min(1)
    .max(100),
});

router.post(
  '/:clubMonthId/chat/read',
  validate(readSchema),
  resolveClubAccess,
  async (req, res, next) => {
    try {
      const { messageIds } = req.body;
      await ChatMessage.updateMany(
        {
          _id: { $in: messageIds },
          clubMonthId: req.club._id,
        },
        { $addToSet: { readBy: req.user.userId } }
      );
      return success(res, { ok: true });
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
    // Вопросы заблокированных пользователей не отдаём (аудит P8) — тот же
    // список blockedUsers, что фильтрует чат (getBlockedIds).
    const blockedIds = await getBlockedIds(req.user.userId);
    const filter = { clubMonthId: req.club._id };
    if (blockedIds.length > 0) {
      filter.userId = { $nin: blockedIds };
    }

    const questions = await QAQuestion.find(filter)
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
