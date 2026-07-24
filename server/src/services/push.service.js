const config = require('../config');
const logger = require('../config/logger');
const User = require('../models/User');
const Notification = require('../models/Notification');

/**
 * Отправка push через APNs (MASTER 7.9), token-based (.p8).
 *
 * Только iOS (приложение iPhone-only). Firebase/FCM НЕ используем — лишняя
 * Google-зависимость для аудитории РФ/РБ и для iOS-only избыточна.
 *
 * Перед каждой отправкой проверяем user.pushSettings[settingKey] — если тип
 * выключен пользователем (экран 4.31), не шлём. settingKey=null → системная/
 * ручная отправка, настройками не гейтится.
 */

// Пакет apn (node-apn) грузим лениво и в try/catch: если он ещё не установлен
// (деплой без `npm install`), сервер не должен падать — push просто отключается.
let apn = null;
try {
  // eslint-disable-next-line global-require
  apn = require('apn');
} catch (err) {
  logger.warn('Пакет apn не установлен — push отключён (нужен npm install)');
}

let provider = null;
let providerInitTried = false;

// Типы, которые сохраняются в ленту уведомлений (4.30) при отправке.
// Персональные события + новости — да; массовые напоминания — нет (шум).
const PERSIST_TYPES = new Set([
  'ai_ready',
  'weekly_report',
  'monthly_report',
  'chat_reply',
  'new_audio',
  'news',
]);

/**
 * Ленивая инициализация APNs-провайдера. Возвращает null, если apn не
 * установлен или не заданы env — тогда отправка тихо пропускается.
 */
const getProvider = () => {
  if (providerInitTried) return provider;
  providerInitTried = true;

  if (!apn) return null;

  const { keyPath, keyId, teamId } = config.apns;
  if (!keyPath || !keyId || !teamId) {
    logger.warn(
      'APNs не настроен (APNS_KEY_PATH/APNS_KEY_ID/APNS_TEAM_ID) — push отключён'
    );
    return null;
  }

  try {
    provider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production: config.apns.production,
    });
    logger.info('APNs provider инициализирован', {
      production: config.apns.production,
      bundleId: config.apns.bundleId,
    });
  } catch (err) {
    logger.error('APNs provider не инициализировался', { message: err.message });
    provider = null;
  }

  return provider;
};

/** Собирает apn.Notification из полезной нагрузки. */
const buildNotification = ({ title, body, data }) => {
  const note = new apn.Notification();
  note.topic = config.apns.bundleId;
  note.alert = { title, body };
  note.sound = 'default';
  note.pushType = 'alert';
  // Живёт сутки: если устройство офлайн, APNs подержит и доставит позже.
  note.expiry = Math.floor(Date.now() / 1000) + 24 * 3600;
  if (data) note.payload = data;
  return note;
};

/**
 * Можно ли слать этому пользователю данный тип.
 * settingKey — ключ user.pushSettings; null → не гейтить.
 */
const isAllowed = (user, settingKey) => {
  if (!user || user.isDeleted) return false;
  if (!user.pushToken) return false;
  if (
    settingKey &&
    user.pushSettings &&
    user.pushSettings[settingKey] === false
  ) {
    return false;
  }
  return true;
};

/** Низкоуровневая доставка на токен + очистка мёртвых токенов. */
const deliver = async (user, payload) => {
  const p = getProvider();
  if (!p) return false;

  try {
    const result = await p.send(buildNotification(payload), user.pushToken);

    if (result.failed && result.failed.length > 0) {
      const fail = result.failed[0];
      const reason =
        (fail.response && fail.response.reason) ||
        (fail.error && fail.error.message) ||
        'unknown';
      logger.warn('APNs доставка не удалась', {
        userId: String(user._id),
        reason,
      });

      // Мёртвый токен — стираем, чтобы не долбить APNs впустую.
      const dead = ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'];
      if (fail.response && dead.includes(fail.response.reason)) {
        await User.updateOne({ _id: user._id }, { $unset: { pushToken: '' } });
      }
      return false;
    }

    return true;
  } catch (err) {
    logger.error('APNs send исключение', {
      userId: String(user._id),
      message: err.message,
    });
    return false;
  }
};

/**
 * Отправить одному пользователю по id.
 * Значимые персональные типы (PERSIST_TYPES) сохраняются в ленту 4.30
 * НЕЗАВИСИМО от push-разрешения и наличия токена (лента = история).
 *
 * @param {string} userId
 * @param {{title:string, body:string, data?:object}} payload
 * @param {string|null} settingKey - ключ pushSettings или null
 */
const sendToUser = async (userId, payload, settingKey = null) => {
  const type = payload.data && payload.data.type;
  if (type && PERSIST_TYPES.has(type)) {
    try {
      await Notification.create({
        userId,
        type,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
      });
    } catch (err) {
      logger.warn('Не удалось сохранить уведомление в ленту', { message: err.message });
    }
  }

  const user = await User.findById(userId)
    .select('pushToken pushSettings isDeleted')
    .lean();
  if (!isAllowed(user, settingKey)) return false;
  return deliver(user, payload);
};

/**
 * Рассылка сегменту (в ленту НЕ пишется).
 * @param {{audience?: 'all'|'subscribers'}} opts
 * @param {{title:string, body:string, data?:object}} payload
 * @param {string|null} settingKey
 */
const broadcast = async ({ audience = 'all' } = {}, payload, settingKey = null) => {
  const filter = {
    pushToken: { $exists: true, $nin: [null, ''] },
    isDeleted: { $ne: true },
  };
  if (audience === 'subscribers') {
    filter.subscriptionStatus = { $in: ['basic', 'premium'] };
    filter.subscriptionExpiresAt = { $gt: new Date() };
  }

  const users = await User.find(filter)
    .select('pushToken pushSettings isDeleted')
    .lean();

  let sent = 0;
  for (const user of users) {
    if (!isAllowed(user, settingKey)) continue;
    // eslint-disable-next-line no-await-in-loop
    const ok = await deliver(user, payload);
    if (ok) sent += 1;
  }

  logger.info('Push broadcast завершён', {
    audience,
    total: users.length,
    sent,
  });
  return { total: users.length, sent };
};

/**
 * Новости/анонсы (админ). В отличие от broadcast, ПИШЕТСЯ в ленту 4.30 всем
 * адресатам (лента = история, независимо от push-разрешения и токена), а push
 * шлётся только тем, у кого включена настройка news и есть токен.
 *
 * @param {{audience?: 'all'|'subscribers', title:string, body:string, data?:object}} opts
 * @returns {Promise<{total:number, persisted:number, sent:number}>}
 */
const sendNews = async ({ audience = 'all', title, body, data = {} } = {}) => {
  const feedFilter = { isDeleted: { $ne: true } };
  if (audience === 'subscribers') {
    feedFilter.subscriptionStatus = { $in: ['basic', 'premium'] };
    feedFilter.subscriptionExpiresAt = { $gt: new Date() };
  }

  const users = await User.find(feedFilter)
    .select('_id pushToken pushSettings isDeleted')
    .lean();

  const payloadData = { ...data, type: 'news' };

  // Пишем в ленту всем адресатам (история). ordered:false — один сбой не рушит пачку.
  if (users.length > 0) {
    try {
      await Notification.insertMany(
        users.map((u) => ({
          userId: u._id,
          type: 'news',
          title,
          body,
          data: payloadData,
        })),
        { ordered: false }
      );
    } catch (err) {
      logger.warn('Не удалось записать часть новостей в ленту', {
        message: err.message,
      });
    }
  }

  // Push — только тем, у кого включена настройка news и есть токен.
  let sent = 0;
  for (const user of users) {
    if (!isAllowed(user, 'news')) continue;
    // eslint-disable-next-line no-await-in-loop
    const ok = await deliver(user, { title, body, data: payloadData });
    if (ok) sent += 1;
  }

  logger.info('Push news завершён', {
    audience,
    total: users.length,
    sent,
  });
  return { total: users.length, persisted: users.length, sent };
};

module.exports = { sendToUser, broadcast, sendNews };
