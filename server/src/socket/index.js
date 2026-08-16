const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const { computeClubAccess } = require('../middleware/subscription');

/**
 * Socket.io setup для real-time чата клуба.
 *
 * Архитектура:
 * - Один сервер Socket.io на всё приложение (один io)
 * - Каждый клуб = отдельная Room (`club:<clubMonthId>`)
 * - При подключении клиент передаёт JWT в auth.token
 * - При подключении клиент передаёт query.clubMonthId — комната к которой
 *   присоединяется. Проверяем что у юзера есть доступ к этому клубу (та же
 *   логика что в HTTP middleware resolveClubAccess — общее ядро
 *   computeClubAccess из middleware/subscription.js).
 *
 * События:
 *   Сервер → Клиент:
 *     `chat:new_message` — новое сообщение (после POST /api/club/.../chat)
 *     `chat:message_edited` — сообщение отредактировано (4.8)
 *     `chat:message_deleted` — сообщение удалено (4.8)
 *     `chat:reaction_updated` — изменены реакции (4.7)
 *     `chat:message_hidden` — модератор скрыл сообщение (4.4)
 *     `chat:user_typing` — кто-то печатает
 *
 *   Клиент → Сервер:
 *     `chat:typing` — я печатаю (broadcast'им остальным)
 *
 * НЕ ИСПОЛЬЗУЕМ socket для отправки сообщений — POST /api/club/.../chat это
 * делает (с валидацией, Zod, проверкой подписки). Socket только доставляет.
 *
 * Это паттерн как в Telegram: REST для записи, WS для realtime push.
 */

/**
 * Middleware Socket.io авторизации.
 * Проверяет JWT из handshake.auth.token, кладёт userId в socket.data.
 * Если токена нет/невалиден — disconnect.
 */
const socketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('UNAUTHORIZED'));
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    if (!decoded || !decoded.userId) {
      return next(new Error('UNAUTHORIZED'));
    }

    socket.data.userId = decoded.userId;
    return next();
  } catch (_err) {
    return next(new Error('UNAUTHORIZED'));
  }
};

/**
 * Проверка доступа юзера к клубу для socket (аудит P11).
 * Раньше была «упрощённая» и пускала любого активного подписчика/архивника
 * в ЛЮБОЙ клуб, не проверяя isBanned и оплаченный набор clubMonthsEntitled.
 * Теперь — то же ядро, что у HTTP resolveClubAccess: computeClubAccess.
 * Возвращает { club, canPost } или null если доступа нет.
 */
const checkClubAccess = async (userId, clubMonthId) => {
  if (!mongoose.Types.ObjectId.isValid(clubMonthId)) return null;

  const [user, club] = await Promise.all([
    User.findById(userId)
      .select(
        'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt clubMonthsEntitled role isBanned mutedUntil'
      )
      .lean(),
    ClubMonth.findById(clubMonthId).lean(),
  ]);

  if (!user || !club) return null;

  // Забаненный — отказ (как CLUB_BLOCKED в HTTP).
  if (user.isBanned) return null;

  const access = computeClubAccess(user, club, new Date());
  if (!access) return null;

  return { club, canPost: access.canPost };
};

/**
 * Главная функция настройки Socket.io.
 * Вызывается из server.js после создания io.
 */
const setupSocket = (io) => {
  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const { userId } = socket.data;
    const clubMonthId = socket.handshake.query.clubMonthId;

    // Аудит S4: async-обработчик без try/catch → любая ошибка (напр. БД при
    // проверке доступа) уходила в unhandledRejection. Оборачиваем всё тело.
    try {
      logger.info(`Socket connected: user=${userId} club=${clubMonthId}`);

      if (!clubMonthId) {
        socket.emit('error', { code: 'NOT_FOUND', message: 'clubMonthId обязателен' });
        socket.disconnect(true);
        return;
      }

      // Проверка доступа к клубу.
      const access = await checkClubAccess(userId, clubMonthId);
      if (!access) {
        socket.emit('error', {
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Нет доступа к клубу',
        });
        socket.disconnect(true);
        return;
      }

      // Кладём данные в socket для использования в обработчиках.
      socket.data.clubMonthId = String(access.club._id);
      socket.data.canPost = access.canPost;

      // Присоединяем к комнате клуба.
      const roomName = `club:${socket.data.clubMonthId}`;
      await socket.join(roomName);

      socket.emit('connected', {
        clubMonthId: socket.data.clubMonthId,
        canPost: access.canPost,
      });

      // ---------- События от клиента ----------

      /**
       * `chat:typing` — клиент начал печатать.
       * Broadcast'им остальным участникам клуба (исключая отправителя).
       * Без сохранения в БД — это эфемерное событие.
       */
      socket.on('chat:typing', () => {
        if (!socket.data.canPost) return; // в архиве не печатают
        socket.to(roomName).emit('chat:user_typing', { userId });
      });

      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: user=${userId} club=${clubMonthId}`);
      });
    } catch (err) {
      logger.error(
        `Socket connection error: user=${userId} club=${clubMonthId}`,
        { message: err && err.message }
      );
      socket.disconnect(true);
    }
  });

  logger.info('Socket.io handlers initialized');
};

/**
 * Helper для эмита события всем в комнате клуба.
 * Вызывается из HTTP роутов (routes/club.js) после POST.
 *
 * @param {import('socket.io').Server} io
 * @param {string} clubMonthId
 * @param {string} event - например 'chat:new_message'
 * @param {object} payload
 */
const emitToClub = (io, clubMonthId, event, payload) => {
  if (!io) return;
  const roomName = `club:${String(clubMonthId)}`;
  io.to(roomName).emit(event, payload);
};

module.exports = { setupSocket, emitToClub };
