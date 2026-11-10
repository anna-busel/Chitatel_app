/**
 * Непрочитанные в чате клуба (UPDATES-PLAN V1, 10.11.2026).
 *
 * - markRead — сдвинуть «прочитано до» вперёд (монотонно).
 * - countUnread — сколько новых в одном клубе для пользователя.
 * - unreadForUser — счётчики по всем клубам, чат которых пользователь может
 *   читать (ровно по computeClubAccess — её не меняем).
 *
 * Тесты: tests/chat-unread.test.js.
 */
const mongoose = require('mongoose');
const {
  computeClubAccess,
  archiveWindowEnd,
} = require('../middleware/subscription');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const ChatReadState = require('../models/ChatReadState');

// Больше 99 не считаем — клиент показывает «99+».
const UNREAD_CAP = 99;

// Нет записи о прочитанном (впервые открывает чат или 1.0.4 ещё не отметил) —
// считаем только последние 7 дней, а не всю историю клуба.
const NO_STATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Архивное окно — максимум следующий календарный месяц; 70 дней с запасом
// для выборки кандидатов, точную проверку делает computeClubAccess.
const CANDIDATE_ENDS_AFTER_MS = 70 * 24 * 60 * 60 * 1000;

const ACCESS_FIELDS =
  'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt clubMonthsEntitled clubChatForever role isBanned mutedUntil blockedUsers';

/**
 * Отметить прочитанным до самого нового из messageIds (в этом клубе).
 * createdAt берём из БД. Если сохранённое уже новее — не трогаем.
 *
 * Возвращает { lastReadAt, lastReadMessageId } (текущее состояние) или null,
 * если ни одно сообщение не найдено в этом клубе.
 */
async function markRead(userId, clubMonthId, messageIds) {
  const ids = (messageIds || []).filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  if (ids.length === 0) {return null;}

  const newest = await ChatMessage.findOne({
    _id: { $in: ids },
    clubMonthId,
  })
    .select('_id createdAt')
    .sort({ createdAt: -1 })
    .lean();
  if (!newest) {return null;}

  let state = null;
  try {
    // Совпадает только если запись старее (или пустая) — тогда сдвигаем.
    // Записи нет — upsert создаёт. Запись есть и новее — фильтр не совпал,
    // upsert пытается вставить дубль → E11000 → оставляем как есть.
    state = await ChatReadState.findOneAndUpdate(
      {
        userId,
        clubMonthId,
        $or: [{ lastReadAt: null }, { lastReadAt: { $lt: newest.createdAt } }],
      },
      {
        $set: {
          lastReadAt: newest.createdAt,
          lastReadMessageId: newest._id,
        },
      },
      { upsert: true, new: true }
    ).lean();
  } catch (err) {
    if (!err || err.code !== 11000) {throw err;}
  }

  if (!state) {
    state = await ChatReadState.findOne({ userId, clubMonthId }).lean();
  }
  return state
    ? {
        lastReadAt: state.lastReadAt || null,
        lastReadMessageId: state.lastReadMessageId
          ? String(state.lastReadMessageId)
          : null,
      }
    : null;
}

/** Состояние «прочитано до» в одном клубе или null. */
async function getReadState(userId, clubMonthId) {
  const state = await ChatReadState.findOne({ userId, clubMonthId }).lean();
  if (!state) {return null;}
  return {
    lastReadAt: state.lastReadAt || null,
    lastReadMessageId: state.lastReadMessageId
      ? String(state.lastReadMessageId)
      : null,
  };
}

/**
 * Число непрочитанных в клубе: видимые (не скрытые, не удалённые), не свои,
 * не от заблокированных мной, новее lastReadAt (или за 7 дней без записи).
 * Не больше UNREAD_CAP.
 */
async function countUnread({
  userId,
  clubMonthId,
  lastReadAt = null,
  blockedIds = [],
  now = new Date(),
}) {
  const since = lastReadAt
    ? new Date(lastReadAt)
    : new Date(now.getTime() - NO_STATE_WINDOW_MS);
  const filter = {
    clubMonthId,
    isHidden: { $ne: true },
    deletedAt: null,
    createdAt: { $gt: since },
    userId: { $nin: [userId, ...(blockedIds || [])] },
  };
  const n = await ChatMessage.countDocuments(filter, { limit: UNREAD_CAP });
  return Math.min(n || 0, UNREAD_CAP);
}

/**
 * Счётчики по клубам, чат которых пользователь может читать сейчас:
 * текущий, архивное окно, «чат остаётся» (всё — по computeClubAccess).
 * Будущие (анонс) не считаем. Бан / нет пользователя — пусто.
 *
 * Возвращает { items: [{ clubMonthId, unread }], total } (total ≤ 99).
 */
async function unreadForUser(userId, now = new Date()) {
  const empty = { items: [], total: 0 };
  const user = await User.findById(userId).select(ACCESS_FIELDS).lean();
  if (!user || user.isBanned) {return empty;}

  const or = [{ endsAt: { $gte: new Date(now.getTime() - CANDIDATE_ENDS_AFTER_MS) } }];
  const forever = (user.clubChatForever || [])
    .map((k) => String(k).split('-').map(Number))
    .filter(([y, m]) => y && m)
    .map(([year, month]) => ({ year, month }));
  if (forever.length) {or.push(...forever);}

  const candidates = await ClubMonth.find({ startsAt: { $lte: now }, $or: or })
    .select('_id year month startsAt endsAt')
    .lean();

  const isAdmin = user.role === 'admin';
  const clubs = (candidates || []).filter((club) => {
    if (!computeClubAccess(user, club, now)) {return false;}
    // Админу computeClubAccess открывает все клубы — считаем только живые:
    // текущий и архивное окно.
    if (isAdmin) {return archiveWindowEnd(club.endsAt) >= now;}
    return true;
  });
  if (clubs.length === 0) {return empty;}

  const states = await ChatReadState.find({
    userId,
    clubMonthId: { $in: clubs.map((c) => c._id) },
  }).lean();
  const byClub = new Map(
    (states || []).map((s) => [String(s.clubMonthId), s.lastReadAt || null])
  );

  const blockedIds = user.blockedUsers || [];
  const items = await Promise.all(
    clubs.map(async (club) => ({
      clubMonthId: String(club._id),
      unread: await countUnread({
        userId,
        clubMonthId: club._id,
        lastReadAt: byClub.get(String(club._id)) || null,
        blockedIds,
        now,
      }),
    }))
  );

  const total = Math.min(
    items.reduce((sum, i) => sum + i.unread, 0),
    UNREAD_CAP
  );
  return { items, total };
}

module.exports = {
  UNREAD_CAP,
  NO_STATE_WINDOW_MS,
  markRead,
  getReadState,
  countUnread,
  unreadForUser,
};
