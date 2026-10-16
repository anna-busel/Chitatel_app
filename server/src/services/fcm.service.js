const fs = require('fs');
const config = require('../config');
const logger = require('../config/logger');

/**
 * Отправка push на Android через FCM HTTP v1 (задача C2 ANDROID-PLAN).
 *
 * Без firebase-admin: токен доступа даёт уже установленный
 * google-auth-library по JSON-ключу сервисного аккаунта Firebase
 * (FCM_SERVICE_ACCOUNT_PATH), отправка — обычный fetch (Node 20).
 *
 * HTTP v1 шлёт по одному токену на запрос, поэтому пачка идёт параллельно
 * по CONCURRENCY штук. Для нашего числа устройств этого хватает с запасом.
 *
 * Не настроено (нет пути, нет файла, нет пакета) — sendToTokens тихо
 * возвращает { sent: 0, dead: [] }, сервер не падает, iOS не затрагивается.
 */

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const CONCURRENCY = 10;
// Иконка уведомления — монохромный drawable из Android-проекта
// (тот же, что у плеера: app/android/app/src/main/res/drawable/ic_stat_chitatel.xml).
const ANDROID_ICON = 'ic_stat_chitatel';
const ANDROID_COLOR = '#750009';

let authClient = null;
let projectId = null;
let initTried = false;

/** Ленивая инициализация: клиент авторизации + project_id из ключа. */
const init = async () => {
  if (initTried) return authClient;
  initTried = true;

  const keyFile = config.fcm.serviceAccountPath;
  if (!keyFile) {
    logger.warn('FCM не настроен (FCM_SERVICE_ACCOUNT_PATH) — Android-пуши отключены');
    return null;
  }

  try {
    const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    projectId = key.project_id;
    if (!projectId) throw new Error('в ключе нет project_id');

    // eslint-disable-next-line global-require
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ keyFile, scopes: [SCOPE] });
    authClient = await auth.getClient();
    logger.info('FCM инициализирован', { projectId });
  } catch (err) {
    logger.error('FCM не инициализировался', { message: err.message });
    authClient = null;
  }
  return authClient;
};

/** FCM принимает в data только строки — приводим всё к строкам. */
const stringifyData = (data) => {
  const out = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
};

/**
 * Токен мёртв (приложение удалено / токен сменился / не FCM-токен) —
 * его нужно забыть. UNREGISTERED приходит с 404, кривой токен — 400
 * INVALID_ARGUMENT с упоминанием registration token.
 */
const isDeadTokenError = (status, body) => {
  const err = body && body.error;
  if (!err) return false;
  const codes = (err.details || []).map((d) => d && d.errorCode).filter(Boolean);
  if (codes.includes('UNREGISTERED')) return true;
  if (status === 404 && err.status === 'NOT_FOUND') return true;
  if (
    err.status === 'INVALID_ARGUMENT' &&
    /registration token/i.test(err.message || '')
  ) {
    return true;
  }
  return false;
};

const sendOne = async (token, payload, accessToken) => {
  const message = {
    token,
    notification: { title: payload.title, body: payload.body },
    data: stringifyData(payload.data),
    android: {
      priority: 'HIGH',
      // Живёт сутки, как у APNs: офлайн-устройство получит позже.
      ttl: '86400s',
      notification: {
        icon: ANDROID_ICON,
        color: ANDROID_COLOR,
        sound: 'default',
      },
    },
  };

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      }
    );
    if (res.ok) return { ok: true };

    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch (_e) {
      body = null;
    }
    return {
      ok: false,
      dead: isDeadTokenError(res.status, body),
      reason: (body && body.error && (body.error.message || body.error.status)) || `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, dead: false, reason: err.message };
  }
};

/**
 * Отправить одно уведомление на список FCM-токенов.
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:object}} payload
 * @returns {Promise<{sent:number, dead:string[]}>}
 */
const sendToTokens = async (tokens, payload) => {
  const result = { sent: 0, dead: [] };
  if (!tokens || tokens.length === 0) return result;

  const client = await init();
  if (!client) return result;

  let accessToken;
  try {
    const t = await client.getAccessToken();
    accessToken = t && (t.token || t);
  } catch (err) {
    logger.error('FCM: не удалось получить токен доступа', { message: err.message });
    return result;
  }
  if (!accessToken) return result;

  let firstFail = null;
  let failed = 0;
  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const chunk = tokens.slice(i, i + CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const outcomes = await Promise.all(chunk.map((t) => sendOne(t, payload, accessToken)));
    outcomes.forEach((o, idx) => {
      if (o.ok) {
        result.sent += 1;
        return;
      }
      failed += 1;
      if (!firstFail) firstFail = o.reason;
      if (o.dead) result.dead.push(chunk[idx]);
    });
  }

  if (failed > 0) {
    logger.warn('FCM: часть не доставлена', {
      failed,
      dead: result.dead.length,
      reason: firstFail,
    });
  }
  return result;
};

module.exports = { sendToTokens, _test: { isDeadTokenError, stringifyData } };
