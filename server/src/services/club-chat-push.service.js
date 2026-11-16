const logger = require('../config/logger');
const pushService = require('./push.service');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const { computeClubAccess, clubMembersFilter } = require('../middleware/subscription');

/**
 * Пуши чата клуба.
 *
 * 1. Новое сообщение в чате (решение Анны 15.11.2026, заменило пуш «Анна
 *    написала» с антиспамом 30 минут от 07.11) — пуш о КАЖДОМ сообщении всем,
 *    кто может читать чат, кроме автора, тех, кто сейчас в комнате чата по
 *    сокету, и тех, кто заблокировал автора. Получатель — при chatMessages и
 *    (clubAll ИЛИ (сообщение Анны и clubAnna)); нет поля — включено. Один пуш
 *    на получателя. Для сообщений Анны текст прежний: «Анна написала в чате
 *    клуба» + превью; для остальных — название клуба и «Имя: текст».
 *    Группировка по клубу: APNs thread-id / Android tag (payload.threadId).
 * 2. Вечерняя сводка в 21:00 МСК (jobs/push-scheduler.js): число сообщений
 *    текущего клуба за сутки, если их больше нуля.
 *
 * Получатели — findClubReaders: доступ к клубу ровно по computeClubAccess
 * (текущий оплаченный месяц, архивное окно, «чат остаётся»), без бана и
 * удалённых, с устройством. Гейт — настройка chatMessages И своя. В ленту
 * уведомлений не пишем (push.sendToUsers ленту не пишет). data.type =
 * 'mention' — в вышедших версиях приложения (iOS 1.0.3, Android) этот тип
 * открывает клуб.
 */

// Сводка раз в сутки; защита от повтора при рестарте в ту же минуту.
const DIGEST_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500;
const PREVIEW_MAX = 100;

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
 * Кандидаты — clubMembersFilter (middleware/subscription): месяц клуба в
 * оплаченном наборе (без него computeClubAccess доступа не даёт никому,
 * кроме админа); с includeAdmins — плюс role=admin, как в списке участниц E1. Дальше — сама
 * computeClubAccess. blockedBy — исключить тех, кто заблокировал этого
 * пользователя (User.blockedUsers). Выборка страницами по _id, чтобы не
 * тянуть всю базу одним запросом.
 * @returns {Promise<object[]>} lean-пользователи
 */
async function findClubReaders(
  club,
  { excludeUserIds = [], includeAdmins = false, blockedBy = null, now = new Date() } = {}
) {
  const exclude = new Set(excludeUserIds.map(String));
  const readers = [];
  let lastId = null;
  for (;;) {
    const filter = {
      $and: [clubMembersFilter(club, { includeAdmins }), HAS_DEVICE],
    };
    if (blockedBy) {filter.blockedUsers = { $ne: blockedBy };}
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
  // ownSettingKey — ключ pushSettings или функция-фильтр получателя.
  const allowed =
    typeof ownSettingKey === 'function'
      ? users.filter(ownSettingKey)
      : users.filter(
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

/** Превью сообщения: текст до ~100 символов / «📷 Фото» / «🎤 Голосовое». */
function messagePreview(message) {
  if (message.type === 'image') {return '📷 Фото';}
  if (message.type === 'voice') {return '🎤 Голосовое';}
  const t = (message.text || '').trim().replace(/\s+/g, ' ');
  if (!t) {return 'Новое сообщение';}
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX).trimEnd()}…` : t;
}

/**
 * Хочет ли получатель пуш об этом сообщении (своя настройка; chatMessages
 * проверяет push.sendToUsers). Нет поля — включено.
 */
function wantsChatPush(user, fromAnna) {
  const ps = user.pushSettings || {};
  if (ps.clubAll !== false) {return true;}
  return !!fromAnna && ps.clubAnna !== false;
}

/**
 * Текст пуша о сообщении. Анна — прежний «Анна написала в чате клуба» +
 * превью; остальные — название клуба и «Имя: текст». Фото с подписью —
 * «📷 Фото» (подпись не показываем).
 */
function chatPushPayload(club, author, message) {
  const preview = messagePreview(message);
  const fromAnna = !!author && author.role === 'admin';
  const clubId = String(club._id);
  const name = (author && author.name && String(author.name).trim()) || 'Участница';
  return {
    title: fromAnna ? 'Анна написала в чате клуба' : (club.title || 'Чат клуба'),
    body: fromAnna ? preview : `${name}: ${preview}`,
    data: { type: 'mention', clubMonthId: clubId, messageId: String(message._id) },
    threadId: `club-${clubId}`,
  };
}

/**
 * Пуш о новом сообщении в чате клуба. Вызывать без await (fire-and-forget).
 * author — lean User отправителя (_id, role, name).
 * excludeUserIds — кому в этом сообщении уже ушёл пуш reply/mention и кто
 * сейчас в комнате чата по сокету.
 * @returns {Promise<{sent:number, recipients?:number, skipped?:string}>}
 */
async function notifyChatMessage({
  club,
  author,
  message,
  excludeUserIds = [],
  now = new Date(),
}) {
  if (!message || message.isHidden || message.deletedAt) {
    return { sent: 0, skipped: 'not_live' };
  }
  const authorId = String((author && author._id) || message.userId);
  const fromAnna = !!author && author.role === 'admin';

  const readers = await findClubReaders(club, {
    excludeUserIds: [authorId, ...excludeUserIds],
    includeAdmins: true,
    blockedBy: authorId,
    now,
  });
  const sent = await pushToReaders(
    readers,
    chatPushPayload(club, author, message),
    (u) => wantsChatPush(u, fromAnna)
  );
  logger.info('Club chat: message push', {
    clubMonthId: String(club._id),
    fromAnna,
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
  notifyChatMessage,
  wantsChatPush,
  chatPushPayload,
  sendDailyDigest,
  newMessagesLabel,
  messagePreview,
};
