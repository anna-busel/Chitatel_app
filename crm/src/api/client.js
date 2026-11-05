/**
 * API-клиент CRM (CRM-PLAN A4).
 *
 * - базовый URL: VITE_API_URL (без завершающего «/»), по умолчанию тот же
 *   origin — в продакшене nginx проксирует /api на сервер;
 * - ответы сервера: { success:true, data } | { success:false, error:{code,message,details} };
 * - токены CRM (scope:'crm') — в localStorage;
 * - на 401 один раз обновляет пару через /api/crm/auth/refresh (сервер
 *   ротирует refresh: старый больше не действует) и повторяет запрос;
 * - refresh не удался → токены стираются, подписчики onLogout узнают о выходе.
 */

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const ACCESS_KEY = 'crm.accessToken';
const REFRESH_KEY = 'crm.refreshToken';

export class ApiError extends Error {
  constructor(code, message, status, details) {
    super(message || 'Ошибка запроса');
    this.code = code || 'ERROR';
    this.status = status || 0;
    this.details = details || {};
  }
}

const read = (key) => {
  try { return window.localStorage.getItem(key); } catch (_e) { return null; }
};
const write = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch (_e) { /* приватный режим — живём без сохранения */ }
};

export const tokens = {
  get access() { return read(ACCESS_KEY); },
  get refresh() { return read(REFRESH_KEY); },
  set({ accessToken, refreshToken }) {
    write(ACCESS_KEY, accessToken);
    write(REFRESH_KEY, refreshToken);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

const logoutListeners = new Set();
export const onLogout = (fn) => {
  logoutListeners.add(fn);
  return () => logoutListeners.delete(fn);
};
const emitLogout = (reason) => logoutListeners.forEach((fn) => fn(reason));

async function send(path, { method = 'GET', body, token, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз', 0);
  }

  let json = null;
  try { json = await res.json(); } catch (_e) { json = null; }

  if (res.ok && json && json.success) return json.data;

  const e = (json && json.error) || {};
  const fallback = res.status === 429
    ? 'Слишком много попыток, подождите минуту'
    : `Ошибка сервера (${res.status})`;
  throw new ApiError(e.code || `HTTP_${res.status}`, e.message || fallback, res.status, e.details);
}

// Один refresh на все параллельные запросы этой вкладки. Между вкладками —
// Web Locks: вторая вкладка дождётся первой и возьмёт уже новую пару, а не
// отправит использованный refresh (сервер счёл бы это кражей и сбросил сессии).
let refreshing = null;

async function doRefresh(staleAccess) {
  const run = async () => {
    const current = tokens.access;
    if (current && current !== staleAccess) return current; // другая вкладка уже обновила
    const refreshToken = tokens.refresh;
    if (!refreshToken) throw new ApiError('CRM_REFRESH_EXPIRED', 'Сессия истекла, войдите заново', 401);
    const pair = await send('/api/crm/auth/refresh', { method: 'POST', body: { refreshToken } });
    tokens.set(pair);
    return pair.accessToken;
  };
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request('crm-refresh', run);
  }
  return run();
}

function refreshOnce(staleAccess) {
  if (!refreshing) {
    refreshing = doRefresh(staleAccess).finally(() => { refreshing = null; });
  }
  return refreshing;
}

/**
 * Запрос к API с токеном CRM. path — от корня, например '/api/crm/me'.
 */
export async function api(path, options = {}) {
  const token = tokens.access;
  try {
    return await send(path, { ...options, token });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !tokens.refresh) throw err;
  }

  let fresh;
  try {
    fresh = await refreshOnce(token);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
      tokens.clear();
      emitLogout('expired');
    }
    throw err;
  }
  return send(path, { ...options, token: fresh });
}

// --- вход (CRM-PLAN A2): пароль → код 2FA → пара токенов ------------------

/** → { twoFactor:'required', tempToken } | { twoFactor:'setup', tempToken, secret, otpauthUrl } */
export const login = (email, password) =>
  send('/api/crm/auth/login', { method: 'POST', body: { email, password } });

/** → { accessToken, refreshToken, member } — токены сохраняются здесь же */
export async function verify2fa(tempToken, code) {
  const data = await send('/api/crm/auth/2fa', { method: 'POST', body: { tempToken, code } });
  tokens.set(data);
  return data.member;
}

/** → { id, name, email, role, perms[] } */
export const fetchMe = () => api('/api/crm/me');

/**
 * Выход. Отдельного серверного logout у CRM нет (A2): стираем токены
 * на этом устройстве; refresh истечёт сам или будет вытеснен (храним 5 последних).
 */
export function logout() {
  tokens.clear();
  emitLogout('manual');
}
