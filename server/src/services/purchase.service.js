const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../config/logger');
const { AppError } = require('../middleware/error');
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
// Периоды, которые допускает enum User.subscriptionPlan. Неизвестный период
// (например 'season') в это поле не пишем — полный период хранится в Purchase.
const SUBSCRIPTION_PLAN_ENUM = ['monthly', 'semiannual', 'annual'];

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
 * @param {{ userId: string, decodedTransaction: object, statusOverride?: string|null }} args
 *   statusOverride — форсит статус ('expired' | 'refunded' | 'cancelled') для webhook.
 * @returns {Promise<object>} обновлённый документ User
 */
async function applyTransaction({ userId, decodedTransaction, statusOverride = null }) {
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
    logger.warn('Apple transaction verification failed', { message: err.message });
    throw new AppError('PURCHASE_INVALID', 'Не удалось проверить покупку', 400);
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

module.exports = { verifyPurchase, applyTransaction, getVerifier, mapProduct };
