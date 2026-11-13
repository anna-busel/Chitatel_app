const mongoose = require('mongoose');
const { AppError } = require('../middleware/error');
const QAQuestion = require('../models/QAQuestion');
const pushService = require('./push.service');

/**
 * Раздел «Вопросы» клуба (UPDATES-PLAN D1–D5, 13.11.2026).
 *
 * - лимит 3 вопроса в неделю на участницу в клубе (неделя пн–вс по Москве);
 * - «Тоже интересно» — атомарный toggle interestedUserIds;
 * - статусы open | podcast | answered, пуш автору при смене статуса;
 * - выдача: interestCount / interestedByMe / status вместо массива id.
 *
 * Старые документы (до D1) не мигрируются: статус вычисляется при выдаче —
 * без status и без ответа = open, с ответом = answered (effectiveStatus).
 * Читать документы для решений только .lean(): обычный find подставил бы
 * default 'open' и в старый ОТВЕЧЕННЫЙ вопрос.
 */

const QUESTION_WEEKLY_LIMIT = 3;

// Москва = UTC+3 круглый год (часы не переводят с 2014) — как weekly-report.js.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Начало текущей недели по Москве: понедельник 00:00 МСК (в UTC — вс 21:00).
 * @param {Date} now
 * @returns {Date}
 */
function mskWeekStart(now = new Date()) {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS);
  const daysSinceMonday = (msk.getUTCDay() + 6) % 7; // пн=0 … вс=6
  const mskMidnight = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate());
  return new Date(mskMidnight - daysSinceMonday * DAY_MS - MSK_OFFSET_MS);
}

/** Статус с учётом старых документов без поля status. */
function effectiveStatus(q) {
  if (q.status === 'open' || q.status === 'podcast' || q.status === 'answered') {
    return q.status;
  }
  return q.answeredAt ? 'answered' : 'open';
}

/** Фильтр Mongo по статусу, учитывающий старые документы без status. */
function statusFilter(status) {
  if (status === 'podcast') {return { status: 'podcast' };}
  if (status === 'answered') {
    return { $or: [{ status: 'answered' }, { status: null, answeredAt: { $ne: null } }] };
  }
  return { $or: [{ status: 'open' }, { status: null, answeredAt: null }] };
}

/**
 * Вопрос для выдачи клиенту: массив interestedUserIds не отдаём, вместо него
 * interestCount и interestedByMe. Остальные поля — как раньше (P7).
 */
function serializeQuestion(q, viewerId) {
  if (!q) {return q;}
  const { interestedUserIds, ...rest } = q;
  const ids = Array.isArray(interestedUserIds) ? interestedUserIds : [];
  const me = viewerId ? String(viewerId) : null;
  return {
    ...rest,
    status: effectiveStatus(q),
    interestCount: ids.length,
    interestedByMe: me ? ids.some((id) => String(id) === me) : false,
  };
}

/** Сколько вопросов пользователь задал в этом клубе с понедельника 00:00 МСК. */
async function countAskedThisWeek(userId, clubMonthId, now = new Date()) {
  return QAQuestion.countDocuments({
    userId,
    clubMonthId,
    createdAt: { $gte: mskWeekStart(now) },
  });
}

/**
 * Остаток на неделю. Админ не ограничен → null.
 */
async function remainingThisWeek({ userId, clubMonthId, isAdmin, now = new Date() }) {
  if (isAdmin) {return null;}
  const asked = await countAskedThisWeek(userId, clubMonthId, now);
  return Math.max(0, QUESTION_WEEKLY_LIMIT - asked);
}

/**
 * Бросает 429 QUESTION_LIMIT, если лимит исчерпан. Возвращает остаток ДО
 * создания нового вопроса (null у админа).
 */
async function assertCanAsk({ userId, clubMonthId, isAdmin, now = new Date() }) {
  const remaining = await remainingThisWeek({ userId, clubMonthId, isAdmin, now });
  if (remaining !== null && remaining <= 0) {
    throw new AppError(
      'QUESTION_LIMIT',
      'На этой неделе можно задать ещё 0 вопросов',
      429,
      { remainingThisWeek: 0, weeklyLimit: QUESTION_WEEKLY_LIMIT }
    );
  }
  return remaining;
}

/**
 * Сортировка списка. sort='interest' — по числу «тоже интересно» убыв.,
 * при равенстве — новые сверху. sort='new' — новые сверху.
 * Без sort — прежний порядок (отвеченные по дате ответа, потом новые) —
 * его сделал запрос в роуте, здесь не трогаем.
 */
function sortQuestions(questions, sort) {
  const time = (d) => (d ? new Date(d).getTime() : 0);
  const byNew = (a, b) => time(b.createdAt) - time(a.createdAt);
  if (sort === 'interest') {
    const count = (q) => (Array.isArray(q.interestedUserIds) ? q.interestedUserIds.length : 0);
    return [...questions].sort((a, b) => count(b) - count(a) || byNew(a, b));
  }
  if (sort === 'new') {return [...questions].sort(byNew);}
  return questions;
}

/**
 * «Тоже интересно» — toggle. Атомарно: сначала пробуем добавить (только если
 * меня нет в массиве), не вышло — убрать (только если я есть). Два
 * одновременных нажатия = два переключения, массив без дублей.
 */
async function toggleInterest(questionId, userId) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const opts = { new: true, projection: { interestedUserIds: 1, clubMonthId: 1 } };

  let doc = await QAQuestion.findOneAndUpdate(
    { _id: questionId, interestedUserIds: { $ne: uid } },
    { $addToSet: { interestedUserIds: uid } },
    opts
  ).lean();
  let interested = true;

  if (!doc) {
    doc = await QAQuestion.findOneAndUpdate(
      { _id: questionId, interestedUserIds: uid },
      { $pull: { interestedUserIds: uid } },
      opts
    ).lean();
    interested = false;
  }
  if (!doc) {
    throw new AppError('NOT_FOUND', 'Вопрос не найден', 404);
  }

  return {
    interested,
    interestCount: Array.isArray(doc.interestedUserIds) ? doc.interestedUserIds.length : 0,
    clubMonthId: doc.clubMonthId,
  };
}

function notifyAuthor(question, adminId, payload) {
  if (String(question.userId) === String(adminId)) {return;}
  pushService
    .sendToUser(
      question.userId,
      {
        ...payload,
        data: {
          type: 'qa_answer',
          questionId: String(question._id),
          clubMonthId: String(question.clubMonthId),
          status: payload.status,
        },
      },
      'chatMessages'
    )
    .catch(() => {});
}

/**
 * Анна меняет статус вопроса.
 *
 * status='podcast' — пуш «Анна возьмёт ваш вопрос в подкаст», если статус
 *   реально сменился (повтор — без пуша).
 * status='answered' — answerText обязателен, если ответа ещё нет. Первый
 *   ответ ставит answeredAt и шлёт пуш; повтор/правка текста — без пуша.
 * legacy=true — старое поведение POST /api/admin/qa/:id/answer без status:
 *   уже отвеченный → 409 (старые клиенты на это рассчитывают).
 *
 * Пуш с type 'qa_answer' — sendToUser сам пишет его в ленту Notification.
 * Возвращает { changed } — был ли пуш.
 */
async function setQuestionStatus({ questionId, status, answerText, adminId, legacy = false }) {
  if (!mongoose.Types.ObjectId.isValid(questionId)) {
    throw new AppError('NOT_FOUND', 'Неверный questionId', 400);
  }
  const current = await QAQuestion.findById(questionId).lean();
  if (!current) {
    throw new AppError('NOT_FOUND', 'Вопрос не найден', 404);
  }

  if (status === 'podcast') {
    const prev = await QAQuestion.findOneAndUpdate(
      { _id: questionId, status: { $ne: 'podcast' } },
      { $set: { status: 'podcast' } },
      { new: false }
    ).lean();
    if (prev) {
      notifyAuthor(current, adminId, {
        title: 'Ваш вопрос — в подкаст',
        body: 'Анна возьмёт ваш вопрос в подкаст',
        status: 'podcast',
      });
    }
    return { changed: !!prev };
  }

  // status === 'answered'
  const text = typeof answerText === 'string' ? answerText.trim() : '';
  if (!text && !current.answerText) {
    throw new AppError('VALIDATION_ERROR', 'Нужен текст ответа', 400, {
      answerText: 'Нужен текст ответа',
    });
  }

  // Первый ответ: только если ответа ещё не было (answeredAt null) — атомарно.
  const prev = await QAQuestion.findOneAndUpdate(
    { _id: questionId, answeredAt: null },
    {
      $set: {
        status: 'answered',
        answerText: text || current.answerText,
        answeredAt: new Date(),
        answeredByUserId: adminId,
      },
    },
    { new: false }
  ).lean();

  if (prev) {
    notifyAuthor(current, adminId, {
      title: 'Анна ответила на ваш вопрос',
      body: (text || current.answerText).slice(0, 140),
      status: 'answered',
    });
    return { changed: true };
  }

  if (legacy) {
    throw new AppError('FORBIDDEN', 'На вопрос уже отвечено', 409);
  }

  // Ответ уже был: правка текста / возврат в answered из podcast — без пуша.
  const set = { status: 'answered', answeredByUserId: adminId };
  if (text) {set.answerText = text;}
  await QAQuestion.updateOne({ _id: questionId }, { $set: set });
  return { changed: false };
}

/** Вопрос после изменения — в формате выдачи (populated, как раньше). */
async function findQuestionForResponse(questionId, viewerId) {
  const q = await QAQuestion.findById(questionId)
    .populate('userId', 'name avatarUrl')
    .populate('answeredByUserId', 'name avatarUrl')
    .lean();
  return serializeQuestion(q, viewerId);
}

module.exports = {
  QUESTION_WEEKLY_LIMIT,
  QA_STATUSES: ['open', 'podcast', 'answered'],
  mskWeekStart,
  effectiveStatus,
  statusFilter,
  serializeQuestion,
  countAskedThisWeek,
  remainingThisWeek,
  assertCanAsk,
  sortQuestions,
  toggleInterest,
  setQuestionStatus,
  findQuestionForResponse,
};
