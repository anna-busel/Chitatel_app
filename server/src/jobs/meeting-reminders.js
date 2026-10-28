const cron = require('node-cron');
const logger = require('../config/logger');
const pushService = require('../services/push.service');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const { hasTier2ForClub, clubMonthKey } = require('../middleware/subscription');

/**
 * Пуш «через час встреча с Анной» участницам с Тарифом 2 (UPDATES-PLAN M,
 * 28.10.2026).
 *
 * Каждые 5 минут ищем встречи, до начала которых осталось не больше часа и
 * напоминание по которым ещё не отправлено (reminderSentAt = null). Сначала
 * атомарно ставим reminderSentAt — чтобы при любом сбое пуш не ушёл дважды, —
 * затем шлём тем, у кого hasTier2ForClub (доступ к клубу + месяц Тарифа 2).
 *
 * Текст без цен и без призыва купить — уходит и на iPhone, и на Android.
 * ⚠️ PM2 — строго fork mode, 1 инстанс, иначе cron задвоится.
 */

const LEAD_MS = 60 * 60 * 1000; // за час

const USER_FIELDS =
  'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt ' +
  'clubMonthsEntitled tier2MonthsEntitled role isBanned mutedUntil';

/**
 * Встречи, по которым пора слать напоминание: начало в (now; now + час],
 * напоминание не отправлено. Чистая функция — покрыта тестами.
 * @returns {{ club: object, meeting: object }[]}
 */
function dueMeetings(clubs, now = new Date()) {
  const out = [];
  (clubs || []).forEach((club) => {
    (club.meetings || []).forEach((m) => {
      if (m.reminderSentAt) {
        return;
      }
      const t = new Date(m.startsAt).getTime();
      if (t > now.getTime() && t - now.getTime() <= LEAD_MS) {
        out.push({ club, meeting: m });
      }
    });
  });
  return out;
}

function timeLabel(date) {
  // Время по Москве — как и остальные пуши клуба (аудитория РФ/РБ).
  return new Date(date).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });
}

async function sendMeetingReminders(now = new Date()) {
  const clubs = await ClubMonth.find({
    meetings: {
      $elemMatch: {
        reminderSentAt: null,
        startsAt: { $gt: now, $lte: new Date(now.getTime() + LEAD_MS) },
      },
    },
  })
    .select('year month startsAt endsAt title meetings')
    .lean();

  const due = dueMeetings(clubs, now);
  let sent = 0;

  for (const { club, meeting } of due) {
    // Отметка «отправлено» ДО рассылки и только если её ещё никто не поставил.
    // eslint-disable-next-line no-await-in-loop
    const mark = await ClubMonth.updateOne(
      {
        _id: club._id,
        meetings: { $elemMatch: { _id: meeting._id, reminderSentAt: null } },
      },
      { $set: { 'meetings.$.reminderSentAt': now } }
    );
    if (!mark.modifiedCount) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const users = await User.find({
      tier2MonthsEntitled: clubMonthKey(club),
      isDeleted: { $ne: true },
      isBanned: { $ne: true },
    })
      .select(USER_FIELDS)
      .lean();

    const payload = {
      title: meeting.title || 'Встреча с Анной',
      body: `Начинаем в ${timeLabel(meeting.startsAt)}. Ссылка — в клубе`,
      data: { type: 'club_meeting', clubMonthId: String(club._id) },
    };

    for (const u of users) {
      if (!hasTier2ForClub(u, club, now)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        if (await pushService.sendToUser(String(u._id), payload, null)) {
          sent += 1;
        }
      } catch (err) {
        logger.warn('Meeting reminder push error', {
          userId: String(u._id),
          message: err.message,
        });
      }
    }
    logger.info('Meeting reminder sent', {
      clubMonthId: String(club._id),
      meetingId: String(meeting._id),
      recipients: users.length,
    });
  }
  return sent;
}

function scheduleMeetingReminders() {
  cron.schedule('*/5 * * * *', () => {
    sendMeetingReminders().catch((err) => {
      logger.error('Meeting reminders cron error', { message: err.message });
    });
  });
  logger.info('Meeting reminders cron scheduled: every 5 min');
}

module.exports = { scheduleMeetingReminders, sendMeetingReminders, dueMeetings };
