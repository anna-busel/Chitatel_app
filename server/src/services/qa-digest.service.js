const logger = require('../config/logger');
const pushService = require('./push.service');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const QAQuestion = require('../models/QAQuestion');

/**
 * Дайджест новых вопросов Анне (UPDATES-PLAN D6, 15.11.2026).
 *
 * Раз в день (cron в jobs/push-scheduler.js, по умолчанию 10:00 МСК —
 * QA_DIGEST_HOUR_MSK) — пуш всем role=admin: «Новые вопросы в клубе»,
 * «N новых вопросов, самый популярный: «…»». Считаем вопросы текущего клуба
 * (startsAt <= now <= endsAt, как сводка чата) за последние 24 часа; самый
 * популярный — по числу «тоже интересно» среди них (при равенстве — более
 * ранний). N = 0 → не шлём.
 *
 * Повтор при рестарте отсекает ClubMonth.lastQaDigestAt (как lastDigestAt у
 * сводки чата): отметка ставится атомарно ДО рассылки.
 *
 * Пуш служебный (Анне), настройками не гейтится, в ленту не пишется.
 * data.type = 'qa_digest' — клиенты, которые его не знают, просто открывают
 * приложение.
 */

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const PREVIEW_MAX = 80;

/** «1 новый вопрос», «2 новых вопроса», «5 новых вопросов». */
function newQuestionsLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {return `${n} новый вопрос`;}
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} новых вопроса`;
  }
  return `${n} новых вопросов`;
}

/** Текст вопроса для пуша: одна строка, не длиннее PREVIEW_MAX. */
function questionPreview(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= PREVIEW_MAX) {return t;}
  return `${t.slice(0, PREVIEW_MAX - 1).trimEnd()}…`;
}

/** Самый популярный вопрос: больше «тоже интересно», при равенстве — ранний. */
function mostPopular(questions) {
  let best = null;
  let bestCount = -1;
  for (const q of questions || []) {
    const n = Array.isArray(q.interestedUserIds) ? q.interestedUserIds.length : 0;
    if (
      n > bestCount ||
      (n === bestCount && new Date(q.createdAt) < new Date(best.createdAt))
    ) {
      best = q;
      bestCount = n;
    }
  }
  return best;
}

async function sendQaDigest(now = new Date()) {
  const club = await ClubMonth.findOne({
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  })
    .sort({ startsAt: -1 })
    .lean();
  if (!club) {return { sent: 0, skipped: 'no_club' };}

  const questions = await QAQuestion.find({
    clubMonthId: club._id,
    createdAt: { $gte: new Date(now.getTime() - DIGEST_WINDOW_MS) },
  })
    .select('questionText interestedUserIds createdAt')
    .lean();
  const count = questions.length;
  if (!count) {return { sent: 0, skipped: 'empty', count: 0 };}

  const mark = await ClubMonth.updateOne(
    {
      _id: club._id,
      $or: [
        { lastQaDigestAt: null },
        { lastQaDigestAt: { $lte: new Date(now.getTime() - DIGEST_MIN_GAP_MS) } },
      ],
    },
    { $set: { lastQaDigestAt: now } }
  );
  if (!mark || !mark.modifiedCount) {return { sent: 0, skipped: 'already_sent', count };}

  const top = mostPopular(questions);
  const admins = await User.find({ role: 'admin', isDeleted: { $ne: true } })
    .select('_id devices pushToken pushSettings isDeleted')
    .lean();
  const payload = {
    title: 'Новые вопросы в клубе',
    body: `${newQuestionsLabel(count)}, самый популярный: «${questionPreview(top.questionText)}»`,
    data: { type: 'qa_digest', clubMonthId: String(club._id) },
  };
  const { sent } = await pushService.sendToUsers(admins, payload, null);
  logger.info('Q&A digest', {
    clubMonthId: String(club._id),
    count,
    admins: admins.length,
    sent,
  });
  return { sent, count, recipients: admins.length, body: payload.body };
}

module.exports = {
  sendQaDigest,
  newQuestionsLabel,
  questionPreview,
  mostPopular,
  PREVIEW_MAX,
};
