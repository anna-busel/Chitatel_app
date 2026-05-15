const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');

/**
 * Socket.io setup для real-time чата клуба.
 *
 * Архитектура:
 * - Один сервер Socket.io на всё приложение (один io)
 * - Каждый клуб = отдельная Room (`club:<clubMonthId>`)
 * - При подключении клиент передаёт JWT в auth.token
 * - При подключении клиент передаёт query.clubMonthId — комната к которой
 *   присоединяется. Проверяем что у юзера есть доступ к этому клубу (та же
 *   логика что в HTTP middleware resolveClubAccess, но упрощённая).
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
 * Проверка доступа юзера к клубу — упрощённая версия resolveClubAccess для socket.
 * Возвращает { club, canPost } или null если доступа нет.
 */
const checkClubAccess = async (userId, clubMonthId) => {
  if (!mongoose.Types.ObjectId.isValid(clubMonthId)) return null;

  const [user, club] = await Promise.all([
    User.findById(userId)
      .select('subscriptionStatus subscriptionExpiresAt gracePeriodExpiresAt role')
      .lean(),
    ClubMonth.findById(clubMonthId).lean(),
  ]);

  if (!user || !club) return null;

  // Админ — везде.
  if (user.role === 'admin') {
    return { club, canPost: true };
  }

  const now = new Date();
  const isInGrace =
    user.gracePeriodExpiresAt && user.gracePeriodExpiresAt > now;
  const hasActiveSub =
    (user.subscriptionStatus === 'basic' ||
      user.subscriptionStatus === 'premium') &&
    (user.subscriptionExpiresAt > now || isInGrace);

  if (hasActiveSub) {
    return { club, canPost: true };
  }

  // Архивный доступ — read-only.
  const hasArchiveAccess =
    club.archiveUntilDate && club.archiveUntilDate >= now;
  if (hasArchiveAccess) {
    return { club, canPost: false };
  }

  return null;
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
