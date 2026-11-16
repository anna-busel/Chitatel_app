/**
 * «Вопрос Анне» в чате клуба (решение Анны 15.11.2026).
 *
 * Вопрос — обычное сообщение чата с isQuestion=true. Вкладки «Вопросы» в
 * клубе больше нет; старые роуты /qa (QAQuestion) остаются для 1.0.5.
 *
 * - лимит 3 вопроса в неделю на участницу в клубе (неделя с пн 00:00 МСК —
 *   qa.service.mskWeekStart). Считаются только сообщения-вопросы, не
 *   удалённые. Обычные сообщения не ограничены. Админ вопросы не задаёт —
 *   isQuestion у него игнорируется в роуте;
 * - список вопросов клуба (новые сверху) и newCount — вопросы новее
 *   ChatReadState.questionsSeenAt текущего пользователя;
 * - markSeen — questionsSeenAt = now.
 *
 * Тесты: tests/chat-questions.test.js.
 */
const { AppError } = require('../middleware/error');
const ChatMessage = require('../models/ChatMessage');
const ChatReadState = require('../models/ChatReadState');
const { mskWeekStart, QUESTION_WEEKLY_LIMIT } = require('./qa.service');

/** Сколько вопросов участница задала в чате клуба с пн 00:00 МСК. */
async function countAskedThisWeek(userId, clubMonthId, now = new Date()) {
  return ChatMessage.countDocuments({
    userId,
    clubMonthId,
    isQuestion: true,
    createdAt: { $gte: mskWeekStart(now) },
    deletedAt: null,
  });
}

/** Остаток на неделю. Админ вопросы не задаёт → null. */
async function remainingThisWeek({ userId, clubMonthId, isAdmin, now = new Date() }) {
  if (isAdmin) {return null;}
  const asked = await countAskedThisWeek(userId, clubMonthId, now);
  return Math.max(0, QUESTION_WEEKLY_LIMIT - asked);
}

/** 429 QUESTION_LIMIT, если лимит исчерпан (как POST /qa). */
async function assertCanAsk({ userId, clubMonthId, now = new Date() }) {
  const remaining = await remainingThisWeek({ userId, clubMonthId, isAdmin: false, now });
  if (remaining <= 0) {
    throw new AppError(
      'QUESTION_LIMIT',
      'На этой неделе можно задать ещё 0 вопросов',
      429,
      { remainingThisWeek: 0, weeklyLimit: QUESTION_WEEKLY_LIMIT }
    );
  }
  return remaining;
}

/** Фильтр видимых вопросов клуба (без скрытых, удалённых, заблокированных). */
function questionsFilter(clubMonthId, blockedIds = []) {
  const filter = {
    clubMonthId,
    isQuestion: true,
    isHidden: { $ne: true },
    deletedAt: null,
  };
  if (blockedIds.length > 0) {
    filter.userId = { $nin: blockedIds };
  }
  return filter;
}

/** Вопросы новее questionsSeenAt пользователя (нет отметки — все). */
async function countNew({ userId, clubMonthId, blockedIds = [] }) {
  const state = await ChatReadState.findOne({ userId, clubMonthId })
    .select('questionsSeenAt')
    .lean();
  const filter = questionsFilter(clubMonthId, blockedIds);
  if (state && state.questionsSeenAt) {
    filter.createdAt = { $gt: state.questionsSeenAt };
  }
  return ChatMessage.countDocuments(filter);
}

/** Открыла список — отметка questionsSeenAt = now. */
async function markSeen(userId, clubMonthId, now = new Date()) {
  try {
    await ChatReadState.updateOne(
      { userId, clubMonthId },
      { $set: { questionsSeenAt: now } },
      { upsert: true }
    );
  } catch (err) {
    // Два одновременных upsert — второй ловит дубль уникального индекса.
    if (!err || err.code !== 11000) {throw err;}
    await ChatReadState.updateOne(
      { userId, clubMonthId },
      { $set: { questionsSeenAt: now } }
    );
  }
  return now;
}

module.exports = {
  QUESTION_WEEKLY_LIMIT,
  countAskedThisWeek,
  remainingThisWeek,
  assertCanAsk,
  questionsFilter,
  countNew,
  markSeen,
};
