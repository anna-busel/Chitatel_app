const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../middleware/error');

/**
 * Доступ к Google Play Developer API (задача E4 ANDROID-PLAN).
 *
 * Отвечает ровно за одно: спросить у Google состояние покупки по её токену и
 * привести ответ к ТОМУ ЖЕ виду, в котором приходит декодированная транзакция
 * Apple. Благодаря этому вся логика выдачи прав (applyTransaction: клубные
 * месяцы, книги, пакеты, возвраты) остаётся общей на две платформы, а не
 * раздваивается.
 *
 * ⚠️ Отступление от ANDROID-PLAN (E4): план предлагал пакет `googleapis`.
 * Используется уже установленный `google-auth-library` (он и так в проекте
 * ради входа через Google) + прямой REST-запрос. Причина: `googleapis` тянет
 * клиенты ко всем API Google (сотни мегабайт), а нам нужны два GET-запроса.
 * Новых зависимостей не требуется — на VPS достаточно git pull.
 *
 * Нужен сервисный аккаунт с доступом в Play Console:
 *   GOOGLE_PLAY_KEY_PATH  — путь к JSON-ключу сервисного аккаунта (вне репо!)
 *   GOOGLE_PLAY_PACKAGE   — applicationId приложения (app.chitatel)
 * Без них любой вызов бросает PURCHASE_VERIFICATION_UNAVAILABLE (503) —
 * ровно так же, как ведёт себя ненастроенная верификация Apple.
 */

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

let cachedClient = null;

/** Авторизованный HTTP-клиент сервисного аккаунта (ленивая инициализация). */
async function getClient() {
  if (cachedClient) return cachedClient;

  const keyFile = config.googlePlay.keyPath;
  if (!keyFile) {
    throw new AppError(
      'PURCHASE_VERIFICATION_UNAVAILABLE',
      'Верификация покупок Google не настроена на сервере',
      503
    );
  }

  let GoogleAuth;
  try {
    // eslint-disable-next-line global-require
    ({ GoogleAuth } = require('google-auth-library'));
  } catch (err) {
    throw new AppError(
      'PURCHASE_VERIFICATION_UNAVAILABLE',
      'Пакет google-auth-library не установлен',
      503
    );
  }

  const auth = new GoogleAuth({ keyFile, scopes: [SCOPE] });
  cachedClient = await auth.getClient();
  return cachedClient;
}

/** Пакет приложения: из аргумента (пришёл с клиента) либо из конфига. */
function resolvePackageName(packageName) {
  const name = packageName || config.googlePlay.packageName;
  if (!name) {
    throw new AppError(
      'PURCHASE_VERIFICATION_UNAVAILABLE',
      'Не задан packageName приложения',
      503
    );
  }
  // Клиент присылает packageName сам — не даём ему указать чужое приложение.
  if (config.googlePlay.packageName && name !== config.googlePlay.packageName) {
    throw new AppError('PURCHASE_INVALID', 'Некорректные данные покупки', 400);
  }
  return name;
}

async function apiGet(url) {
  const client = await getClient();
  try {
    const res = await client.request({ url, method: 'GET' });
    return res.data;
  } catch (err) {
    const status = (err.response && err.response.status) || null;
    logger.warn('Google Play API: запрос не удался', {
      status,
      message: err.message,
      url: url.replace(/tokens\/[^/?]+/, 'tokens/…'),
    });
    // 400/404 — токен не тот, покупки не существует; 401/403 — доступ
    // сервисного аккаунта не выдан (это уже наша проблема, а не клиента).
    if (status === 400 || status === 404) {
      throw new AppError('PURCHASE_INVALID', 'Не удалось проверить покупку', 400);
    }
    throw new AppError(
      'PURCHASE_VERIFICATION_UNAVAILABLE',
      'Сервис проверки покупок Google недоступен',
      503
    );
  }
}

const toMs = (value) => {
  if (value == null) return undefined;
  const ms = typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};

/**
 * Подписка: purchases.subscriptionsv2.get.
 * Возвращает { tx, statusOverride, gracePeriodExpiresAt } — те же аргументы,
 * которые ждёт applyTransaction.
 */
async function fetchSubscription({ packageName, purchaseToken }) {
  const pkg = resolvePackageName(packageName);
  const data = await apiGet(
    `${API_BASE}/${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
  );
  return normalizeSubscription(data, purchaseToken);
}

/** Чистое преобразование ответа subscriptionsv2 (вынесено ради тестов). */
function normalizeSubscription(data, purchaseToken) {
  const line = Array.isArray(data.lineItems) && data.lineItems.length > 0
    ? data.lineItems[0]
    : {};
  const state = data.subscriptionState;
  const expiresDate = toMs(line.expiryTime);

  // Соответствие состояний Google статусам, которые понимает applyTransaction.
  // gracePeriodExpiresAt: undefined = не трогать, null = снять, Date = выставить.
  let statusOverride = null;
  let gracePeriodExpiresAt;

  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      // Статус посчитается по дате окончания, льготный период снимаем.
      gracePeriodExpiresAt = null;
      break;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      // Списание не прошло, Google ещё пытается — доступ сохраняем.
      // ⚠️ Точную дату конца льготного периода v2 отдельным полем не отдаёт,
      // берём expiryTime как «доступ до». Проверить на песочнице (E8).
      statusOverride = 'active';
      gracePeriodExpiresAt = expiresDate ? new Date(expiresDate) : null;
      break;
    case 'SUBSCRIPTION_STATE_CANCELED':
      // ВАЖНО: это отказ от автопродления, а НЕ возврат денег. Доступ живёт
      // до конца оплаченного периода — статус считается по дате.
      break;
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
    case 'SUBSCRIPTION_STATE_EXPIRED':
      statusOverride = 'expired';
      gracePeriodExpiresAt = null;
      break;
    case 'SUBSCRIPTION_STATE_PENDING':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      // Оплата ещё не прошла (отложенный платёж) — доступа нет.
      statusOverride = 'expired';
      gracePeriodExpiresAt = null;
      break;
    default:
      logger.warn('Google Play: неизвестное состояние подписки', { state });
      statusOverride = 'expired';
      gracePeriodExpiresAt = null;
  }

  const tx = {
    productId: line.productId,
    // Токен покупки живёт всё время подписки и не меняется при продлении —
    // это аналог originalTransactionId у Apple.
    transactionId: purchaseToken,
    originalTransactionId: purchaseToken,
    purchaseDate: toMs(data.startTime),
    expiresDate,
    // testPurchase присутствует только у покупок лицензионных тестировщиков.
    environment: data.testPurchase ? 'Sandbox' : 'Production',
    appAccountToken:
      (data.externalAccountIdentifiers &&
        data.externalAccountIdentifiers.obfuscatedExternalAccountId) ||
      undefined,
  };

  return { tx, statusOverride, gracePeriodExpiresAt, subscriptionState: state };
}

/**
 * Разовая покупка (разбор, пакет): purchases.products.get.
 */
async function fetchProduct({ packageName, productId, purchaseToken }) {
  const pkg = resolvePackageName(packageName);
  const data = await apiGet(
    `${API_BASE}/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`
  );
  return normalizeProduct(data, productId, purchaseToken);
}

/** Чистое преобразование ответа purchases.products (вынесено ради тестов). */
function normalizeProduct(data, productId, purchaseToken) {
  // purchaseState: 0 куплено, 1 отменено/возврат, 2 ожидает оплаты.
  let statusOverride = null;
  if (data.purchaseState === 1) {
    statusOverride = 'refunded';
  } else if (data.purchaseState === 2) {
    statusOverride = 'expired';
  }

  const tx = {
    productId,
    transactionId: purchaseToken,
    originalTransactionId: purchaseToken,
    purchaseDate: toMs(data.purchaseTimeMillis),
    // Разовая покупка не истекает — поля expiresDate нет, как и у Apple.
    expiresDate: undefined,
    // purchaseType 0 — покупка лицензионного тестировщика.
    environment: data.purchaseType === 0 ? 'Sandbox' : 'Production',
    appAccountToken: data.obfuscatedExternalAccountId || undefined,
  };

  return { tx, statusOverride, gracePeriodExpiresAt: undefined };
}

/**
 * Единая точка: сама решает, подписка это или разовая покупка.
 * Подписки — единственные продукты с префиксом club. (см. mapProduct).
 */
async function fetchPurchase({ packageName, productId, purchaseToken }) {
  if (typeof productId === 'string' && productId.startsWith('club.')) {
    return fetchSubscription({ packageName, purchaseToken });
  }
  return fetchProduct({ packageName, productId, purchaseToken });
}

module.exports = {
  fetchPurchase,
  fetchSubscription,
  fetchProduct,
  normalizeSubscription,
  normalizeProduct,
};
