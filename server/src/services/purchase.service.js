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
let cachedVerifier = null;
function getVerifier() {
  if (cachedVerifier) return cachedVerifier;
  const { SignedDataVerifier, Environment } = getAppleLib();
  const env =
    config.apple.environment === 'production'
      ? Environment.PRODUCTION
      : Environment.SANDBOX;
  const certs = loadRootCerts();
  cachedVerifier = new SignedDataVerifier(
    certs,
    true, // enableOnlineChecks — проверка отзыва/срока сертификата
    env,
    config.apple.bundleId,
    config.apple.appAppleId || undefined
  );
  return cachedVerifier;
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
  const status = statusOverride || (activeByDate ? 'active' : 'expired');
  const revoked = status === 'refunded' || status === 'cancelled';
  const active = status === 'active';

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
    user.subscriptionStatus = active
      ? (SUBSCRIPTION_TIER_ENUM.includes(mapped.tier) ? mapped.tier : 'basic')
      : 'expired';
    user.subscriptionPlan = SUBSCRIPTION_PLAN_ENUM.includes(mapped.period)
      ? mapped.period
      : null;
    user.subscriptionExpiresAt = expiresAt;
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
  const verifier = getVerifier();

  let tx;
  try {
    tx = await verifier.verifyAndDecodeTransaction(signedTransaction);
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
  const tokenUserId = userIdFromAppAccountToken(tx.appAccountToken);
  if (tokenUserId && tokenUserId !== String(userId).toLowerCase()) {
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
  mapProduct,
  userIdFromAppAccountToken,
};
