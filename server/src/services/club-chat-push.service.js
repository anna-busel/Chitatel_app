const logger = require('../config/logger');
const pushService = require('./push.service');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const { computeClubAccess, clubMonthKey } = require('../middleware/subscription');

/**
 * Пуши чата клуба (решение Анны 07.11.2026, UPDATES-PLAN U).
 *
 * 1. Анна (role=admin) пишет в чат клуба → пуш всем, кто может читать этот
 *    чат: «Анна написала в чате клуба» + превью. Не чаще раза в 30 минут на
 *    клуб (отметка ClubMonth.lastAnnaPushAt в БД — pm2 перезапускается).
 * 2. Вечерняя сводка в 21:00 МСК (jobs/push-scheduler.js): число сообщений
 *    текущего клуба за сутки, если их больше нуля.
 *
 * Получатели обоих пушей — findClubReaders: доступ к клубу ровно по
 * computeClubAccess (текущий оплаченный месяц, архивное окно, «чат
 * остаётся»), без бана и удалённых, с устройством. Гейт — настройка
 * chatMessages И своя: clubAnna (пуш Анны) / clubDigest (сводка). В ленту
 * уведомлений не пишем (массовая рассылка, как broadcast). data.type =
 * 'mention' — в вышедших версиях приложения (iOS 1.0.3, Android) этот тип
 * открывает клуб.
 */

const ANNA_PUSH_COOLDOWN_MS = 30 * 60 * 1000;
// Сводка раз в сутки; защита от повтора при рестарте в ту же минуту.
const DIGEST_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500;
const PREVIEW_MAX = 140;

const USER_FIELDS =
  '_id devices pushToken pushSettings isDeleted ' +
  'subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt ' +
  'clubMonthsEntitled clubChatForever role isBanned mutedUntil';

const HAS_DEVICE = {
  $or: [
    { 'devices.0': { $exists: true } },
    { pushToken: { $exists: true, $nin: [null, ''] } },
  ],
};

/**
 * Кто может читать чат этого клуба (и кому есть куда слать пуш).
 * Кандидаты — те, у кого месяц клуба в оплаченном наборе (без него
 * computeClubAccess доступа не даёт никому, кроме админа); дальше — сама
 * computeClubAccess. Выборка страницами по _id, чтобы не тянуть всю базу
 * одним запросом.
 * @returns {Promise<object[]>} lean-пользователи
 */
async function findClubReaders(club, { excludeUserIds = [], now = new Date() } = {}) {
  const exclude = new Set(excludeUserIds.map(String));
  const readers = [];
  let lastId = null;
  for (;;) {
    const filter = {
      clubMonthsEntitled: clubMonthKey(club),
      isDeleted: { $ne: true },
      isBanned: { $ne: true },
      ...HAS_DEVICE,
    };
    if (lastId) {filter._id = { $gt: lastId };}
    // eslint-disable-next-line no-await-in-loop
    const page = await User.find(filter)
      .select(USER_FIELDS)
      .sort({ _id: 1 })
      .limit(PAGE_SIZE)
      .lean();
    for (const u of page) {
      if (!exclude.has(String(u._id)) && computeClubAccess(u, club, now)) {
        readers.push(u);
      }
    }
    if (page.length < PAGE_SIZE) {break;}
    lastId = page[page.length - 1]._id;
  }
  return readers;
}

/**
 * Пачками по PAGE_SIZE через push.sendToUsers. Гейт — chatMessages (его
 * проверяет sendToUsers) И своя настройка пуша (clubAnna / clubDigest).
 * Нет поля — считаем включённым.
 */
async function pushToReaders(users, payload, ownSettingKey) {
  const allowed = users.filter(
    (u) => !(u.pushSettings && u.pushSettings[ownSettingKey] === false)
  );
  let sent = 0;
  for (let i = 0; i < allowed.length; i += PAGE_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const r = await pushService.sendToUsers(
      allowed.slice(i, i + PAGE_SIZE),
      payload,
      'chatMessages'
    );
    sent += r.sent;
  }
  return sent;
}

/** Превью сообщения для пуша. */
function messagePreview(message) {
  if (message.type === 'image') {return 'Фото';}
  if (message.type === 'voice') {return 'Голосовое сообщение';}
  const t = (message.text || '').trim();
  return t ? t.slice(0, PREVIEW_MAX) : 'Новое сообщение';
}

/**
 * Пуш «Анна написала в чате клуба». Вызывать без await (fire-and-forget).
 * author — lean User отправителя (нужно поле role); не admin → ничего.
 * excludeUserIds — кому в этом сообщении уже ушёл пуш reply/mention.
 * @returns {Promise<{sent:number, skipped?:string}>}
 */
async function notifyAnnaMessage({
  club,
  author,
  message,
  excludeUserIds = [],
  now = new Date(),
}) {
  if (!author || author.role !== 'admin') {return { sent: 0, skipped: 'not_admin' };}

  // Атомарно занять окно 30 минут: из параллельных сообщений пройдёт одно.
  const mark = await ClubMonth.updateOne(
    {
      _id: club._id,
      $or: [
        { lastAnnaPushAt: null },
        { lastAnnaPushAt: { $lte: new Date(now.getTime() - ANNA_PUSH_COOLDOWN_MS) } },
      ],
    },
    { $set: { lastAnnaPushAt: now } }
  );
  if (!mark || !mark.modifiedCount) {return { sent: 0, skipped: 'cooldown' };}

  const readers = await findClubReaders(club, {
    excludeUserIds: [String(author._id || message.userId), ...excludeUserIds],
    now,
  });
  const sent = await pushToReaders(readers, {
    title: 'Анна написала в чате клуба',
    body: messagePreview(message),
    data: { type: 'mention', clubMonthId: String(club._id) },
  }, 'clubAnna');
  logger.info('Club chat: Anna push', {
    clubMonthId: String(club._id),
    recipients: readers.length,
    sent,
  });
  return { sent, recipients: readers.length };
}

/** «1 новое сообщение», «2 новых сообщения», «5 новых сообщений». */
function newMessagesLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) {return `${n} новое сообщение`;}
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} новых сообщения`;
  }
  return `${n} новых сообщений`;
}

/**
 * Вечерняя сводка (cron 21:00 МСК). Текущий клуб — startsAt <= now <= endsAt
 * (как resolveClubAccess). Считаем живые сообщения за 24 часа; 0 → не шлём.
 */
async function sendDailyDigest(now = new Date()) {
  const club = await ClubMonth.findOne({
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  })
    .sort({ startsAt: -1 })
    .lean();
  if (!club) {return { sent: 0, skipped: 'no_club' };}

  const count = await ChatMessage.countDocuments({
    clubMonthId: club._id,
    createdAt: { $gte: new Date(now.getTime() - DIGEST_WINDOW_MS) },
    isHidden: { $ne: true },
    deletedAt: null,
  });
  if (!count) {return { sent: 0, skipped: 'empty', count: 0 };}

  const mark = await ClubMonth.updateOne(
    {
      _id: club._id,
      $or: [
        { lastDigestAt: null },
        { lastDigestAt: { $lte: new Date(now.getTime() - DIGEST_MIN_GAP_MS) } },
      ],
    },
    { $set: { lastDigestAt: now } }
  );
  if (!mark || !mark.modifiedCount) {return { sent: 0, skipped: 'already_sent', count };}

  const readers = await findClubReaders(club, { now });
  const sent = await pushToReaders(readers, {
    title: 'Чат клуба',
    body: `За сегодня в чате ${newMessagesLabel(count)}`,
    data: { type: 'mention', clubMonthId: String(club._id) },
  }, 'clubDigest');
  logger.info('Club chat: daily digest', {
    clubMonthId: String(club._id),
    count,
    recipients: readers.length,
    sent,
  });
  return { sent, count, recipients: readers.length };
}

module.exports = {
  findClubReaders,
  notifyAnnaMessage,
  sendDailyDigest,
  newMessagesLabel,
  messagePreview,
  ANNA_PUSH_COOLDOWN_MS,
};
