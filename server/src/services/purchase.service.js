const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../middleware/error');
const { clubMonthKeysForPurchase } = require('../middleware/subscription');
const User = require('../models/User');
const Book = require('../models/Book');
const Package = require('../models/Package');
const Purchase = require('../models/Purchase');

/**
 * Сервис верификации покупок Apple (задачи 3.3 + 3.4).
 *
 * verifyPurchase — для POST /api/purchases/verify (покупка из приложения).
 * applyTransaction — общая логика (upsert Purchase + обновление прав User),
 *   переиспользуется webhook-сервисом (S2S-уведомления Apple).
 * getVerifier — общий SignedDataVerifier (тоже нужен webhook-сервису).
 * userIdFromAppAccountToken — обратное преобразование appAccountToken → userId
 *   (нужно и verify, и webhook-сервису).
 *
 * Маппинг productId → право живёт в mapProduct() — единственное место, где
 * «знают» про конкретные тарифы. Смена состава тарифов меняет только его.
 *
 * ⚠️ Для реальной работы нужны (Фаза 7 / деплой): корневые сертификаты Apple
 * PKI (config.apple.rootCertsPath) и верный bundleId/environment. Без них
 * getVerifier бросает PURCHASE_VERIFICATION_UNAVAILABLE (503).
 */

// @apple/app-store-server-library — CommonJS (main: dist/index.js), require ок.
// Грузим лениво: сервер стартует даже без npm install — ошибка прилетит
// только при первом вызове верификации.
let appleLib = null;
function getAppleLib() {
  if (!appleLib) {
    // eslint-disable-next-line global-require
    appleLib = require('@apple/app-store-server-library');
  }
  return appleLib;
}

const SUBSCRIPTION_TIER_ENUM = ['basic', 'premium'];
// Периоды, которые допускает enum User.subscriptionPlan.
// 'season' добавлен фиксом B4 аудита 07.07.2026 (сезонный тариф 3 мес,
// club.basic.season) — синхронно с enum в models/User.js.
const SUBSCRIPTION_PLAN_ENUM = ['monthly', 'season', 'semiannual', 'annual'];

/**
 * Обратное преобразование appAccountToken (UUID) → userId (Mongo ObjectId).
 *
 * Формат токена задаёт клиент (PurchaseService.appAccountTokenFromUserId):
 * ObjectId — это 24 hex-символа (12 байт), UUID требует 32 hex (16 байт).
 * Клиент дополняет ObjectId восемью нулями справа и форматирует как
 * канонический UUID 8-4-4-4-12. Здесь снимаем дефисы, проверяем нулевой
 * хвост (наш формат, не чужой случайный UUID) и возвращаем первые 24 hex.
 *
 * Используется:
 * - verifyPurchase — сверить, что чек принадлежит именно текущему юзеру;
 * - webhook.service — найти юзера по S2S-уведомлению, когда записи Purchase нет.
 *
 * @param {string|undefined} token — tx.appAccountToken из декодированной транзакции
 * @returns {string|null} hex-строка ObjectId (24 lowercase hex) или null, если
 *   формат не наш
 */
function userIdFromAppAccountToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const hex = token.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  // Хвост должен быть нашим нулевым паддингом — иначе это не наш токен.
  if (hex.slice(24) !== '00000000') return null;
  return hex.slice(0, 24);
}

/**
 * productId → { itemType, tier?, period?, itemId }.
 * Форматы: club.{tier}.{period} | book.{slug} | package.{slug} | archive.forever
 */
function mapProduct(productId) {
  if (productId === 'archive.forever') {
    return { itemType: 'archive', itemId: null };
  }
  if (productId.startsWith('club.')) {
    const [, tier, period] = productId.split('.');
    return {
      itemType: 'subscription',
      tier: tier || null,
      period: period || null,
      itemId: period || null,
    };
  }
  if (productId.startsWith('book.')) {
    return { itemType: 'book', itemId: productId.slice('book.'.length) };
  }
  if (productId.startsWith('package.')) {
    return { itemType: 'package', itemId: productId.slice('package.'.length) };
  }
  throw new AppError('PURCHASE_UNKNOWN_PRODUCT', `Неизвестный продукт: ${productId}`, 400);
}

// --- Корневые сертификаты Apple PKI (кэш) ---
let cachedRootCerts = null;
function loadRootCerts() {
  if (cachedRootCerts) return cachedRootCerts;
  const dir = config.apple.rootCertsPath;
  if (!dir || !fs.existsSync(dir)) {
    throw new AppError(
      'PURCHASE_VERIFICATION_UNAVAILABLE',
      'Верификация покупок не настроена на сервере',
      503
    );
  }
  const files = fs.readdirSync(dir).filter((f) => /\.(cer|pem|der|crt)$/i.test(f));
  if (files.length === 0) {
    throw new AppError(
      'PURCHASE_VERIFICATION_UNAVAILABLE',
      'Корневые сертификаты Apple не найдены',
      503
    );
  }
  cachedRootCerts = files.map((f) => fs.readFileSync(path.join(dir, f)));
  return cachedRootCerts;
}

// --- SignedDataVerifier (кэш) ---
// P1 (аудит 08.2026): ДВА верификатора — PRODUCTION и SANDBOX. Apple Review
// тестирует покупки в sandbox даже на production-билде (чеки подписаны
// sandbox-окружением), а у нас environment один по config → status 5
// (INVALID_ENVIRONMENT) и ревью падает. Поэтому сначала пробуем окружение из
// config, при status === 5 — повторяем другим (см. verifySignedData).
const cachedVerifiers = {}; // { production?: SignedDataVerifier, sandbox?: SignedDataVerifier }
function getVerifierFor(envName) {
  if (cachedVerifiers[envName]) return cachedVerifiers[envName];
  const { SignedDataVerifier, Environment } = getAppleLib();
  const env = envName === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
  const certs = loadRootCerts();
  cachedVerifiers[envName] = new SignedDataVerifier(
    certs,
    true, // enableOnlineChecks — проверка отзыва/срока сертификата
    env,
    config.apple.bundleId,
    config.apple.appAppleId || undefined
  );
  return cachedVerifiers[envName];
}

function primaryEnvName() {
  return config.apple.environment === 'production' ? 'production' : 'sandbox';
}

// Верификатор для окружения из config (обратная совместимость экспорта).
function getVerifier() {
  return getVerifierFor(primaryEnvName());
}

let envFallbackWarned = false;
/**
 * Верифицирует JWS методом SignedDataVerifier с fallback по окружению:
 * сначала config-окружение; если бросило status === 5 (INVALID_ENVIRONMENT) —
 * повторяем другим окружением. Warn о fallback логируем один раз.
 * @param {'verifyAndDecodeTransaction'|'verifyAndDecodeNotification'|'verifyAndDecodeRenewalInfo'} method
 * @param {string} jws
 */
async function verifySignedData(method, jws) {
  const primary = primaryEnvName();
  const secondary = primary === 'production' ? 'sandbox' : 'production';
  try {
    return await getVerifierFor(primary)[method](jws);
  } catch (err) {
    if (!err || err.status !== 5) throw err;
    if (!envFallbackWarned) {
      envFallbackWarned = true;
      logger.warn('Apple verify: INVALID_ENVIRONMENT, fallback на другое окружение', {
        method,
        primary,
        fallback: secondary,
      });
    }
    return getVerifierFor(secondary)[method](jws);
  }
}

function verifyTransactionJWS(jws) {
  return verifySignedData('verifyAndDecodeTransaction', jws);
}

/**
 * priceUsd для записи Purchase (M6). StoreKit 2 JWS отдаёт price в
 * миллиединицах валюты (price/1000) + currency. Если валюта USD — берём из
 * транзакции, иначе — из каталога (Book.priceUsd / Package.priceUsd). Для
 * подписок без каталога — null. Любая ошибка → null, verify не роняем.
 */
async function resolvePriceUsd(tx, mapped) {
  try {
    if (tx.price != null && tx.currency === 'USD') {
      const usd = Number(tx.price) / 1000;
      if (Number.isFinite(usd)) return usd;
    }
    if (mapped.itemType === 'book') {
      const book = await Book.findOne({ bookSlug: mapped.itemId }).select('priceUsd').lean();
      return book && book.priceUsd != null ? book.priceUsd : null;
    }
    if (mapped.itemType === 'package') {
      const pkg = await Package.findOne({ packageSlug: mapped.itemId }).select('priceUsd').lean();
      return pkg && pkg.priceUsd != null ? pkg.priceUsd : null;
    }
    return null;
  } catch (err) {
    logger.warn('Purchase: не удалось определить priceUsd', { message: err.message });
    return null;
  }
}

/**
 * Применяет декодированную транзакцию Apple к пользователю:
 * upsert Purchase + обновление прав. Используется и при покупке (verify),
 * и при S2S-уведомлениях (webhook).
 *
 * @param {{
 *   userId: string,
 *   decodedTransaction: object,
 *   statusOverride?: string|null,
 *   gracePeriodExpiresAt?: Date|null|undefined,
 * }} args
 *   statusOverride — форсит статус ('active' | 'expired' | 'refunded' |
 *     'cancelled') для webhook. 'active' используется при billing retry с
 *     grace period (DID_FAIL_TO_RENEW): expiresDate уже в прошлом, но доступ
 *     сохраняется до gracePeriodExpiresAt.
 *   gracePeriodExpiresAt — управление льготным периодом (фикс B3 аудита
 *     07.07.2026). Семантика:
 *       undefined — НЕ трогать поле (например, verify при покупке);
 *       null      — снять льготный период (оплата прошла / подписка истекла
 *                   окончательно / refund);
 *       Date      — выставить (Apple дал grace при неудачном списании).
 *     Применяется только к itemType='subscription'.
 * @returns {Promise<object>} обновлённый документ User
 */
async function applyTransaction({
  userId,
  decodedTransaction,
  statusOverride = null,
  gracePeriodExpiresAt = undefined,
}) {
  const tx = decodedTransaction;
  const productId = tx.productId;
  const originalTransactionId = tx.originalTransactionId || tx.transactionId;
  if (!productId || !originalTransactionId) {
    throw new AppError('PURCHASE_INVALID', 'Некорректные данные транзакции', 400);
  }

  const mapped = mapProduct(productId);
  const expiresAt = tx.expiresDate ? new Date(tx.expiresDate) : null;
  const activeByDate = expiresAt ? expiresAt.getTime() > Date.now() : true;
  let status = statusOverride || (activeByDate ? 'active' : 'expired');
  // P10(a): revocationDate в транзакции — Apple отозвала/вернула деньги.
  // Доступ не даём независимо от expiresDate.
  if (tx.revocationDate) {
    status = 'refunded';
  }

  // Существующая запись — для защиты от привязки чужого чека (P10b) и от
  // даунгрейда refunded/cancelled → active повторным verify того же JWS (P10c).
  const existing = await Purchase.findOne({ transactionId: originalTransactionId })
    .select('userId status')
    .lean();
  if (existing) {
    if (String(existing.userId) !== String(userId)) {
      const tokenUserId = userIdFromAppAccountToken(tx.appAccountToken);
      const owner = await User.findById(existing.userId).select('isDeleted').lean();
      if (owner && !owner.isDeleted && tokenUserId !== String(userId).toLowerCase()) {
        // Purchase уже привязан к другому живому аккаунту, и токен не наш —
        // не переносим.
        throw new AppError('FORBIDDEN', 'Покупка принадлежит другому аккаунту', 403);
      }
      // M3: прежний владелец удалил аккаунт (isDeleted) либо токен указывает
      // на текущего юзера — переносим Purchase на него (одноразово).
      logger.info('Purchase: перенос на другой аккаунт', {
        transactionId: originalTransactionId,
        fromUserId: String(existing.userId),
        toUserId: String(userId),
      });
    }
    if (
      !statusOverride &&
      (existing.status === 'refunded' || existing.status === 'cancelled')
    ) {
      status = existing.status;
    }
  }
  const revoked = status === 'refunded' || status === 'cancelled';
  const active = status === 'active';

  const priceUsd = await resolvePriceUsd(tx, mapped);

  await Purchase.findOneAndUpdate(
    { transactionId: originalTransactionId },
    {
      $set: {
        userId,
        itemType: mapped.itemType,
        itemId: mapped.itemId,
        platform: 'apple',
        appleProductId: productId,
        expiresAt,
        status,
        ...(priceUsd != null ? { priceUsd } : {}),
      },
      $setOnInsert: {
        purchasedAt: tx.purchaseDate ? new Date(tx.purchaseDate) : new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'Пользователь не найден', 404);
  }

  if (mapped.itemType === 'subscription') {
    // M8: при expire/refund/billing retry не укорачивать дату, если текущая
    // позже (ручной абонемент из админки не затираем). Если оставили более
    // позднюю дату и она ещё не истекла — subscriptionStatus тоже НЕ
    // даунгрейдим в 'expired' (ручной абонемент действует).
    const keepLaterExpiry =
      !active &&
      user.subscriptionExpiresAt &&
      expiresAt &&
      user.subscriptionExpiresAt.getTime() > expiresAt.getTime();
    if (!keepLaterExpiry) {
      user.subscriptionExpiresAt = expiresAt;
    }
    const manualStillValid =
      keepLaterExpiry && user.subscriptionExpiresAt.getTime() > Date.now();
    if (active) {
      user.subscriptionStatus = SUBSCRIPTION_TIER_ENUM.includes(mapped.tier)
        ? mapped.tier
        : 'basic';
    } else if (!manualStillValid) {
      user.subscriptionStatus = 'expired';
    }
    user.subscriptionPlan = SUBSCRIPTION_PLAN_ENUM.includes(mapped.period)
      ? mapped.period
      : null;
    user.subscriptionOriginalTransactionId = originalTransactionId;

    // Льготный период (B3): undefined = не трогать, null = снять, Date = выставить.
    if (gracePeriodExpiresAt !== undefined) {
      user.gracePeriodExpiresAt = gracePeriodExpiresAt;
    }

    // Хранимый оплаченный набор клубных месяцев (30.07.2026). Фиксируем ИМЕННО
    // в момент платежа: какие клубы оплатила ЭТА транзакция (дата покупки +
    // план). Доступ к клубу сверяется с этим набором, а не пересчитывается из
    // expiresAt — см. resolveClubAccess, userHasBookAccess.
    const grantedKeys = clubMonthKeysForPurchase(
      tx.purchaseDate ? new Date(tx.purchaseDate) : new Date(),
      user.subscriptionPlan
    );
    if (!Array.isArray(user.clubMonthsEntitled)) {
      user.clubMonthsEntitled = [];
    }
    if (status === 'refunded') {
      // Возврат денег — снять оплаченные этой транзакцией месяцы.
      user.clubMonthsEntitled = user.clubMonthsEntitled.filter(
        (k) => !grantedKeys.includes(k)
      );
    } else if (active) {
      // Успешная оплата/продление — добавить без дублей.
      grantedKeys.forEach((k) => {
        if (!user.clubMonthsEntitled.includes(k)) {
          user.clubMonthsEntitled.push(k);
        }
      });
      // S8: grace period — доступ к клубу месяца, следующего за expiresDate
      // (формат ключа как clubMonthKey: `${year}-${month}` без padStart).
      if (gracePeriodExpiresAt instanceof Date && expiresAt) {
        const abs = expiresAt.getFullYear() * 12 + expiresAt.getMonth() + 1;
        const graceKey = `${Math.floor(abs / 12)}-${(abs % 12) + 1}`;
        if (!user.clubMonthsEntitled.includes(graceKey)) {
          user.clubMonthsEntitled.push(graceKey);
        }
      }
    }
    // status 'expired'/'cancelled' — набор НЕ трогаем: оплаченный месяц
    // остаётся за человеком, а ограничивает доступ уже временное окно клуба
    // (текущий/архив). Отмена авто-продления не должна отбирать оплаченный клуб.
  } else if (mapped.itemType === 'archive') {
    user.hasArchiveAccess = !revoked;
  } else if (mapped.itemType === 'book') {
    const book = await Book.findOne({ bookSlug: mapped.itemId }).select('_id').lean();
    if (book) {
      const has = user.purchasedBooks.some((id) => id.equals(book._id));
      if (revoked && has) {
        user.purchasedBooks = user.purchasedBooks.filter((id) => !id.equals(book._id));
      } else if (!revoked && !has) {
        user.purchasedBooks.push(book._id);
      }
    }
  } else if (mapped.itemType === 'package') {
    const pkg = await Package.findOne({ packageSlug: mapped.itemId }).select('_id').lean();
    if (pkg) {
      const has = user.purchasedPackages.some((id) => id.equals(pkg._id));
      if (revoked && has) {
        user.purchasedPackages = user.purchasedPackages.filter((id) => !id.equals(pkg._id));
      } else if (!revoked && !has) {
        user.purchasedPackages.push(pkg._id);
      }
    }
  }

  await user.save();
  return user;
}

/**
 * Верифицирует подписанную транзакцию Apple (JWS) и обновляет права юзера.
 * @param {{ userId: string, signedTransaction: string }} args
 * @returns {Promise<object>} сводка по подписке/покупкам пользователя
 */
async function verifyPurchase({ userId, signedTransaction }) {
  let tx;
  try {
    tx = await verifyTransactionJWS(signedTransaction);
  } catch (err) {
    // VerificationException из @apple/app-store-server-library кладёт причину
    // не в message (он часто пустой), а в числовое поле status. Логируем всё,
    // чтобы видеть точный код: 1=INVALID_APP_IDENTIFIER/подпись,
    // 2=INVALID_CERTIFICATE (цепочка/корневые), 3=INVALID_CHAIN_LENGTH,
    // 4=INVALID_CHAIN, 5=INVALID_ENVIRONMENT (sandbox/prod). Диагностика
    // добавлена 10.07.2026 — verifyAndDecodeTransaction падал, а err.message
    // был пустой, причина не читалась.
    logger.warn('Apple transaction verification failed', {
      message: err.message,
      status: err.status,
      name: err.name,
      reason: err.reason,
    });
    throw new AppError('PURCHASE_INVALID', 'Не удалось проверить покупку', 400);
  }

  // Защита от привязки чужого чека (02.08.2026, «вариант 2»). Клиент кладёт в
  // транзакцию appAccountToken, детерминированно построенный из userId. Если
  // токен есть и он НАШ, но указывает на другого юзера — значит кто-то подсунул
  // чужой подписанный чек на свой аккаунт. Отклоняем. Токена нет / не наш формат
  // (гостевые покупки старого формата) — пропускаем как раньше, привязка идёт по
  // залогиненному userId из JWT.
  // M3: если токен указывает на УДАЛЁННЫЙ аккаунт (isDeleted) — человек удалил
  // аккаунт и вошёл снова тем же Apple ID; разрешаем привязку к текущему userId
  // (Purchase.userId переносится в applyTransaction).
  const tokenUserId = userIdFromAppAccountToken(tx.appAccountToken);
  if (tokenUserId && tokenUserId !== String(userId).toLowerCase()) {
    const tokenUser = await User.findById(tokenUserId).select('isDeleted').lean();
    if (!(tokenUser && tokenUser.isDeleted)) {
      logger.warn('Purchase verify: appAccountToken не совпадает с юзером', {
        userId: String(userId),
        originalTransactionId: tx.originalTransactionId || tx.transactionId,
      });
      throw new AppError(
        'PURCHASE_INVALID',
        'Покупка принадлежит другому аккаунту',
        403
      );
    }
    logger.info('Purchase verify: appAccountToken удалённого аккаунта, привязываем к текущему', {
      userId: String(userId),
      deletedUserId: tokenUserId,
    });
  }

  const user = await applyTransaction({ userId, decodedTransaction: tx });

  return {
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    hasArchiveAccess: user.hasArchiveAccess,
    purchasedBooks: user.purchasedBooks,
    purchasedPackages: user.purchasedPackages,
  };
}

module.exports = {
  verifyPurchase,
  applyTransaction,
  getVerifier,
  verifySignedData,
  verifyTransactionJWS,
  mapProduct,
  userIdFromAppAccountToken,
};
