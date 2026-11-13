const logger = require('../../config/logger');
const User = require('../../models/User');
const Book = require('../../models/Book');
const Package = require('../../models/Package');
const Purchase = require('../../models/Purchase');
const CrmClient = require('../models/CrmClient');
const CrmOrder = require('../models/CrmOrder');
const CrmProduct = require('../models/CrmProduct');
const CrmCounter = require('../models/CrmCounter');
const CrmEvent = require('../models/CrmEvent');

/**
 * Покупки App Store / Google Play → заказы CRM (CRM-PLAN C1, C2, C3; 13.11.2026).
 *
 * ingestStorePurchase({user, purchase, status, tx, platform}) вызывается в конце
 * purchase.service.applyTransaction, ПОСЛЕ того как права уже применены.
 * CRM здесь только записывает выручку: доступ выдаёт/снимает applyTransaction,
 * applyOrder для этих заказов не вызывается (и сам их пропускает — purchaseId),
 * иначе права задвоятся (L6).
 *
 *   - одна оплата = один заказ: ключ storeTxId (Apple transactionId — у
 *     продления свой; Google — токен + срок периода, токен при продлении тот же);
 *     повтор той же оплаты обновляет заказ, а не создаёт новый;
 *   - status 'active' → заказ «Оплачен», source app_store|google_play
 *     (в интерфейсе — «Выдано автоматически»);
 *   - 'refunded'/'cancelled' → заказ этой оплаты (или последний по purchaseId)
 *     в «Возврат»; нет заказа — создаётся сразу возвратом;
 *   - 'expired' новый заказ не создаёт (отмена продления, отложенный платёж
 *     Google) — кроме переноса старых покупок (backfill);
 *   - sandbox (TestFlight, ревьюеры, тестировщики Google) в CRM не пишется;
 *   - продукт: CrmProduct.appleProductId / googleProductId; не нашли —
 *     storeUnmatched: true + productTitle из productId (C2);
 *   - club.premium.* — «Тариф 2 (клуб + встречи)».
 */

const STORE = {
  apple: { source: 'app_store', method: 'app_store', who: 'App Store' },
  google: { source: 'google_play', method: 'google_play', who: 'Google Play' },
};
const REVOKED = ['refunded', 'cancelled'];
const PERIOD_RU = {
  monthly: 'месяц',
  season: 'сезон',
  semiannual: 'полгода',
  annual: 'год',
};

const normEmail = (e) => (typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null);

/** Название заказа по productId стора, когда продукт CRM не сопоставлен. */
function titleFromProductId(productId) {
  const pid = String(productId || '');
  if (pid.startsWith('club.')) {
    const [, tier, period] = pid.split('.');
    const p = PERIOD_RU[period] || period || '';
    const base = tier === 'premium' ? 'Тариф 2 (клуб + встречи)' : 'Клуб';
    return p ? `${base} · ${p}` : base;
  }
  if (pid.startsWith('book.')) {return `Разбор ${pid.slice(5)}`;}
  if (pid.startsWith('package.')) {return `Пакет ${pid.slice(8)}`;}
  if (pid === 'archive.forever') {return 'Архив навсегда';}
  return pid || 'Покупка в приложении';
}

/** Ключ одной оплаты (storeTxId). */
function paymentKey({ purchase, tx, platform }) {
  const id = String(
    (tx && (tx.transactionId || tx.originalTransactionId)) || purchase.transactionId || purchase._id
  );
  // У Google токен подписки не меняется при продлении — различаем периоды по сроку.
  if (platform === 'google' && purchase.itemType === 'subscription' && tx && tx.expiresDate) {
    return `${id}:${Number(new Date(tx.expiresDate))}`;
  }
  return id;
}

/** CrmProduct по productId стора (C2). У Google сначала googleProductId, потом общий. */
async function matchProduct(productId, platform) {
  if (!productId) {return null;}
  if (platform === 'google') {
    const g = await CrmProduct.findOne({ googleProductId: productId }).select('_id name').lean();
    if (g) {return g;}
  }
  return CrmProduct.findOne({ appleProductId: productId }).select('_id name').lean();
}

/**
 * Клиентка CRM для аккаунта приложения: уже связанная → по почте (и сразу
 * связываем) → новая с appUserId.
 */
async function clientForUser(user) {
  const linked = await CrmClient.findOne({ appUserId: user._id, mergedInto: null });
  if (linked) {return linked;}

  const email = normEmail(user.email);
  if (email) {
    const byEmail =
      (await CrmClient.findOne({ 'emails.email': email, mergedInto: null })) ||
      (await CrmClient.findOne({ primaryEmail: email, mergedInto: null }));
    if (byEmail && !byEmail.appUserId) {
      // Как при входе (B5): связать и выдать то, что оплачено на сайте.
      // Ошибка выдачи заказ стора не отменяет — повторит следующий вход.
      const access = require('./access.service');
      await access.attachClient(byEmail, user, { how: 'покупка в приложении' });
      try {
        await access.applyClientOrders(byEmail._id);
      } catch (err) {
        logger.error('CRM ingest: applyClientOrders error', {
          clientId: String(byEmail._id),
          message: err.message,
        });
      }
      return byEmail;
    }
    if (byEmail) {
      // Клиентка с этой почтой связана с другим аккаунтом — не трогаем, заводим отдельную.
      logger.warn('CRM ingest: клиентка с почтой связана с другим аккаунтом', {
        clientId: String(byEmail._id),
        userId: String(user._id),
      });
    }
  }
  return CrmClient.create({
    name: user.name || '',
    emails: email ? [{ email, source: 'app' }] : [],
    primaryEmail: email,
    appUserId: user._id,
  });
}

async function logEvent(clientId, orderId, who, text, type) {
  try {
    await CrmEvent.create({ clientId, orderId, who, text, type });
  } catch (err) {
    logger.warn('CRM event не записан', { message: err.message });
  }
}

function markRefund(order, who, at = new Date()) {
  order.status = 'refund';
  order.refund = {
    amount: order.price || 0,
    mode: 'money',
    reason: `Возврат через ${who}`,
    at,
    by: null,
  };
  order.history.push({ at, who, text: `Возврат через ${who}. Доступ снят приложением автоматически` });
}

async function createOrder({ client, purchase, tx, platform, key, revoked, product, who }) {
  const productId = purchase.appleProductId;
  const amount = purchase.priceUsd !== null && purchase.priceUsd !== undefined ? purchase.priceUsd : 0;
  const at = tx && tx.purchaseDate ? new Date(tx.purchaseDate) : purchase.purchasedAt || new Date();
  const title = product ? product.name : titleFromProductId(productId);
  const order = new CrmOrder({
    num: await CrmCounter.nextOrderNum(),
    clientId: client._id,
    productId: product ? product._id : null,
    productTitle: title,
    storeProductId: productId || null,
    storeUnmatched: !product,
    price: amount,
    cur: 'USD',
    status: 'paid',
    source: STORE[platform].source,
    purchaseId: purchase._id,
    storeTxId: key,
    payments: [{ amount, cur: 'USD', method: STORE[platform].method, at, extId: key }],
    history: [{ at: new Date(), who, text: `Оплачено в ${who}, доступ выдан автоматически` }],
  });
  if (revoked) {markRefund(order, who);}
  try {
    await order.save();
  } catch (err) {
    if (err && err.code === 11000) {
      // Параллельный вызов (verify + вебхук) уже создал заказ этой оплаты.
      return { order: await CrmOrder.findOne({ storeTxId: key }), created: false };
    }
    throw err;
  }
  const text = `Заказ №${order.num}: ${title} — ${revoked ? 'возврат' : 'оплата'} в ${who}${
    amount ? ` (${amount} USD)` : ''
  }${product ? '' : '. Продукт стора не сопоставлен с продуктом CRM'}`;
  await logEvent(client._id, order._id, who, text, 'order');
  return { order, created: true };
}

/**
 * C1. Покупка/продление/возврат стора → заказ CRM.
 * Возвращает { action: 'created'|'updated'|'refunded'|'exists'|'skip', order?, reason? }.
 * Ошибки пробрасывает — ловит вызывающий (applyTransaction, бэкфилл).
 */
async function ingestStorePurchase({ user, purchase, status, tx = null, platform, backfill = false }) {
  if (!purchase || !purchase._id || !user || !user._id) {return { action: 'skip', reason: 'no_purchase' };}
  const plat = platform || purchase.platform;
  if (!STORE[plat]) {return { action: 'skip', reason: 'not_store' };}
  if (purchase.environment === 'sandbox') {return { action: 'skip', reason: 'sandbox' };}

  const st = status || purchase.status;
  const revoked = REVOKED.includes(st);
  const { who } = STORE[plat];
  const key = paymentKey({ purchase, tx, platform: plat });

  let order = await CrmOrder.findOne({ storeTxId: key });
  if (!order && revoked) {
    order = await CrmOrder.findOne({ purchaseId: purchase._id, status: { $ne: 'refund' } }).sort({
      createdAt: -1,
    });
  }

  if (order) {
    let changed = false;
    if (revoked && order.status !== 'refund') {
      markRefund(order, who);
      changed = true;
    }
    if (order.storeUnmatched) {
      const product = await matchProduct(purchase.appleProductId, plat);
      if (product) {
        order.productId = product._id;
        order.productTitle = product.name;
        order.storeUnmatched = false;
        changed = true;
      }
    }
    if (changed) {
      await order.save();
      if (revoked) {
        await logEvent(order.clientId, order._id, who, `Заказ №${order.num}: возврат в ${who}`, 'order');
      }
    }
    return { action: revoked && changed ? 'refunded' : changed ? 'updated' : 'exists', order };
  }

  if (!revoked && st !== 'active' && !backfill) {return { action: 'skip', reason: 'not_paid' };}

  const client = await clientForUser(user);
  const product = await matchProduct(purchase.appleProductId, plat);
  const res = await createOrder({ client, purchase, tx, platform: plat, key, revoked, product, who });
  if (!res.created && res.order && revoked && res.order.status !== 'refund') {
    markRefund(res.order, who);
    await res.order.save();
  }
  return { action: res.created ? 'created' : 'exists', order: res.order };
}

/**
 * C3. Ручная выдача админки (Purchase platform 'web') → заказ «Бесплатно»,
 * source 'admin'. Записи, созданные самой CRM (transactionId crm-…), — уже
 * заказы, пропускаем. Доступ не трогаем.
 */
async function ingestManualPurchase({ user, purchase }) {
  if (!purchase || !purchase._id || !user || !user._id) {return { action: 'skip', reason: 'no_purchase' };}
  if (String(purchase.transactionId || '').startsWith('crm-')) {return { action: 'skip', reason: 'crm' };}
  const existing = await CrmOrder.findOne({ purchaseId: purchase._id });
  if (existing) {return { action: 'exists', order: existing };}

  const client = await clientForUser(user);
  const what =
    purchase.itemType === 'subscription'
      ? `клуб (${PERIOD_RU[purchase.itemId] || purchase.itemId || '—'})`
      : purchase.itemType === 'book'
        ? `разбор ${purchase.itemId}`
        : purchase.itemType === 'package'
          ? `пакет ${purchase.itemId}`
          : purchase.itemType;
  const title = `Ручная выдача: ${what}`;
  const order = new CrmOrder({
    num: await CrmCounter.nextOrderNum(),
    clientId: client._id,
    productTitle: title,
    price: 0,
    status: 'free',
    source: 'admin',
    purchaseId: purchase._id,
    note: purchase.status === 'cancelled' ? 'Выдача снята в админке' : null,
    history: [{ at: new Date(), who: 'Импорт', text: `Перенесено из админки: ${what}` }],
  });
  await order.save();
  await logEvent(client._id, order._id, 'Импорт', `Заказ №${order.num}: ${title}`, 'order');
  return { action: 'created', order };
}

/**
 * C3. Перенос всех существующих покупок в CRM. Идемпотентно: покупка, по
 * которой уже есть заказ (purchaseId), пропускается.
 * apply=false — только посчитать.
 */
async function backfillStorePurchases({ apply = false } = {}) {
  const stats = {
    total: 0,
    sandbox: 0,
    crm: 0,
    exists: 0,
    noUser: 0,
    store: 0,
    admin: 0,
    errors: 0,
  };
  const purchases = await Purchase.find({ platform: { $in: ['apple', 'google', 'web'] } })
    .sort({ createdAt: 1 })
    .lean();
  for (const purchase of purchases) {
    stats.total += 1;
    try {
      if (purchase.environment === 'sandbox') {
        stats.sandbox += 1;
        continue;
      }
      if (purchase.platform === 'web' && String(purchase.transactionId || '').startsWith('crm-')) {
        stats.crm += 1;
        continue;
      }
      if (await CrmOrder.findOne({ purchaseId: purchase._id }).select('_id').lean()) {
        stats.exists += 1;
        continue;
      }
      const user = await User.findById(purchase.userId);
      if (!user) {
        stats.noUser += 1;
        continue;
      }
      const kind = purchase.platform === 'web' ? 'admin' : 'store';
      if (apply) {
        const r =
          kind === 'admin'
            ? await ingestManualPurchase({ user, purchase })
            : await ingestStorePurchase({
                user,
                purchase,
                status: purchase.status,
                platform: purchase.platform,
                backfill: true,
              });
        if (r.action !== 'created') {
          stats.exists += 1;
          continue;
        }
      }
      stats[kind] += 1;
    } catch (err) {
      stats.errors += 1;
      logger.error('CRM backfill: покупка не перенесена', {
        purchaseId: String(purchase._id),
        message: err.message,
      });
    }
  }
  return stats;
}

/* ------------------------------------------------------------------ *
 *          L8: разбор/пакет продукта не заведён в App Store            *
 * ------------------------------------------------------------------ */

/**
 * Предупреждения продукта CRM (C2/L8): продукт с grant book/pack указывает
 * разборы/пакет, у которых нет appleProductId, — купленное на сайте не
 * откроется в iOS-приложении (Apple 3.1.3(b)). Продажу не блокирует.
 * Для карточки продукта (E1) и «Сегодня».
 */
async function storeWarnings(product) {
  const g = (product && product.grant) || {};
  const out = [];
  if (g.type === 'book') {
    const slugs = g.bookSlugs || [];
    if (!slugs.length) {return out;}
    const books = await Book.find({ bookSlug: { $in: slugs } })
      .select('bookSlug title appleProductId')
      .lean();
    const bySlug = new Map(books.map((b) => [b.bookSlug, b]));
    slugs.forEach((slug) => {
      const b = bySlug.get(slug);
      if (!b || !b.appleProductId) {
        out.push({
          code: 'not_in_app_store',
          kind: 'book',
          slug,
          text: `Разбор «${b ? b.title : slug}» не заведён в App Store — в iOS-приложении не откроется. Заведите товар в App Store Connect.`,
        });
      }
    });
  } else if (g.type === 'pack' && g.packageSlug) {
    const pkg = await Package.findOne({ packageSlug: g.packageSlug })
      .select('packageSlug title appleProductId')
      .lean();
    if (!pkg || !pkg.appleProductId) {
      out.push({
        code: 'not_in_app_store',
        kind: 'pack',
        slug: g.packageSlug,
        text: `Пакет «${pkg ? pkg.title : g.packageSlug}» не заведён в App Store — в iOS-приложении не откроется. Заведите товар в App Store Connect.`,
      });
    }
  }
  return out;
}

/** Для «Сегодня»: действующие продукты с предупреждением L8. */
async function productsWithStoreWarnings() {
  const products = await CrmProduct.find({
    active: true,
    archivedAt: null,
    'grant.type': { $in: ['book', 'pack'] },
  })
    .select('name grant')
    .lean();
  const out = [];
  for (const p of products) {
    const warnings = await storeWarnings(p);
    if (warnings.length) {out.push({ productId: p._id, name: p.name, warnings });}
  }
  return out;
}

module.exports = {
  ingestStorePurchase,
  ingestManualPurchase,
  backfillStorePurchases,
  storeWarnings,
  productsWithStoreWarnings,
  // для тестов
  paymentKey,
  titleFromProductId,
};
