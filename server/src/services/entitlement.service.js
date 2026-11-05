const { AppError } = require('../middleware/error');
const logger = require('../config/logger');
const {
  planDurationMonths,
  clubMonthKeysForPurchase,
} = require('../middleware/subscription');
const User = require('../models/User');
const Purchase = require('../models/Purchase');

/**
 * ЕДИНАЯ выдача и снятие прав в приложении (CRM-PLAN B1, 05.11.2026).
 *
 * Права живут в денормализованных полях User (clubMonthsEntitled,
 * tier2MonthsEntitled, clubChatForever, subscription*, purchasedBooks,
 * purchasedPackages). Раньше их писали руками роуты админки
 * (routes/admin-users.js) — CRM продублировала бы это в третий раз. Теперь и
 * админка, и CRM (crm/services/access.service.js) ходят сюда.
 *
 * Покупки из App Store / Google Play сюда НЕ ходят — у них своя точка
 * purchase.service.applyTransaction (её правила другие: возвраты стора,
 * grace, keepLaterExpiry), её не трогаем.
 *
 * Источник выдачи (opts.source):
 *   'admin' — ручная выдача из админки. Поведение как до 05.11: Purchase
 *     (platform 'web') пишется «в фоне» с синтетическим manualTxId, ошибка
 *     записи — только в лог;
 *   'crm'   — выдача по заказу CRM. Purchase пишется с ДЕТЕРМИНИРОВАННЫМ
 *     transactionId `crm-<orderId>-…` (повтор не плодит дублей, при возврате
 *     отменяются ровно записи этого заказа).
 * Запись Purchase нужна для «Профиль → Мои покупки» (GET /api/purchases/history
 * строится только по Purchase) и для «Оплат» в админке; доступ от неё не зависит.
 */

const MANUAL = 'admin';
const CRM = 'crm';

/* ------------------------------------------------------------------ *
 *                          МЕСЯЦЫ И СРОКИ                             *
 * ------------------------------------------------------------------ */

// Синтетический transactionId ручной операции админки (как было в
// admin-users.js; Purchase.transactionId уникален и sparse).
function manualTxId(prefix, userId, tail) {
  return `manual-${prefix}-${userId}-${tail}-${Date.now()}`;
}

// transactionId записи Purchase для заказа CRM.
function crmTxId(orderId, kind, tail) {
  return `crm-${orderId}-${kind}${tail ? `-${tail}` : ''}`;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ключ 'YYYY-M' → {year, month}. Принимает и '2026-01' (с нулём) — CRM-продукт
 * могли завести с ведущим нулём; в User всегда пишем без нуля (L1).
 */
function parseMonthKey(key) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(key || '').trim());
  if (!m) {return null;}
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {return null;}
  return { year, month };
}

function normalizeMonthKey(key) {
  const p = parseMonthKey(key);
  return p ? `${p.year}-${p.month}` : null;
}

/**
 * Конец клубного месяца по ключу 'YYYY-M' — последний день 23:59:59.999 UTC.
 *
 * ⛔️ 05.11.2026: считаем от КЛЮЧА в UTC, без getMonth()/setMonth() —
 * от пояса сервера не зависит (та же беда, что чинили в archiveWindowEnd).
 * Почему конец по UTC, а не по Москве (как у архивного окна): срок подписки
 * должен накрыть ТЕКУЩИЙ клуб целиком, а админка (admin-club.js monthBounds)
 * пишет ClubMonth.endsAt = последний день 23:59:59.999 UTC. Конец по Москве
 * (20:59 UTC) закрыл бы клуб пейволом на последние 3 часа месяца: клуб ещё
 * «текущий», а подписка уже истекла. UTC-конец позже московского, поэтому
 * накрывает и старые клубы, заведённые по МСК.
 */
function monthKeyEnd(key) {
  const p = parseMonthKey(key);
  if (!p) {return null;}
  // День 0 месяца (month+1) = последний день month; Date.UTC берёт месяц 0..11.
  return new Date(Date.UTC(p.year, p.month, 0, 23, 59, 59, 999));
}

/** Конец ПОСЛЕДНЕГО из месяцев набора (или null для пустого). */
function lastMonthEnd(keys) {
  let max = null;
  (keys || []).forEach((k) => {
    const end = monthKeyEnd(k);
    if (end && (!max || end > max)) {max = end;}
  });
  return max;
}

/**
 * Ключи 'YYYY-M' от from до to включительно (UTC). Перенесено из
 * admin-users.js без изменений: выдача подписки с произвольной датой окончания.
 */
function clubMonthKeysBetween(from, to) {
  const keys = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const ey = to.getUTCFullYear();
  const em = to.getUTCMonth();
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${m + 1}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

/* ------------------------------------------------------------------ *
 *                        МЕЛКИЕ ПОМОЩНИКИ                             *
 * ------------------------------------------------------------------ */

const asList = (arr) => (Array.isArray(arr) ? [...arr] : arr ? [...arr] : []);
const sameId = (a, b) => String(a) === String(b);
const hasId = (arr, id) => asList(arr).some((x) => sameId(x, id));

/** Добавить без дублей. Возвращает {list, added}. */
function addAll(current, items, eq = (a, b) => a === b) {
  const list = asList(current);
  const added = [];
  items.forEach((it) => {
    if (!list.some((x) => eq(x, it))) {
      list.push(it);
      added.push(it);
    }
  });
  return { list, added };
}

function isActiveSub(user, now = new Date()) {
  return (
    (user.subscriptionStatus === 'basic' || user.subscriptionStatus === 'premium') &&
    user.subscriptionExpiresAt instanceof Date &&
    user.subscriptionExpiresAt > now
  );
}

/** Запись Purchase: админка — в фоне (как раньше), CRM — upsert с ожиданием. */
async function recordPurchase(source, doc) {
  if (source === CRM) {
    try {
      await Purchase.findOneAndUpdate(
        { transactionId: doc.transactionId },
        { $set: { ...doc, status: 'active' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (e) {
      logger.warn('CRM Purchase не записан', {
        transactionId: doc.transactionId,
        message: e.message,
      });
    }
    return;
  }
  Purchase.create({ ...doc, status: 'active' }).catch((e) =>
    logger.warn(`manual ${doc.itemType} Purchase не записан`, { message: e.message })
  );
}

/* ------------------------------------------------------------------ *
 *                              КЛУБ                                   *
 * ------------------------------------------------------------------ */

/**
 * Выдать клубные месяцы.
 *
 * user — документ User (mongoose; сохраняется здесь).
 * keys — ключи 'YYYY-M'.
 * opts:
 *   plan       — subscriptionPlan ('monthly'|'season'|'semiannual'|'annual');
 *   status     — 'basic'|'premium' (только с expiresAt — режим админки);
 *   expiresAt  — ТОЧНЫЙ срок (админка: «план от сейчас» или дата из формы).
 *                Не задан → срок = max(текущий, конец последнего месяца) (L2):
 *                клуб открывается только при «месяц + активная подписка», и
 *                зимний сезон, выданный в октябре, должен держать подписку до
 *                конца февраля;
 *   tier2      — те же месяцы в tier2MonthsEntitled (админка, status=premium);
 *   chatForever — те же месяцы в clubChatForever (CRM, «Чат остаётся», B4);
 *   source, orderId, purchasedAt — для записи Purchase.
 *
 * Возвращает снимок выданного — CRM кладёт его в CrmOrder.granted, чтобы при
 * возврате снять ровно это:
 *   { months, tier2Months, chatMonths, preexisting: {months, tier2Months,
 *     chatMonths}, subscription: {prev: {...}, set: {...}|null} }
 */
async function grantClubMonths(user, keys, opts = {}) {
  const {
    plan = 'monthly',
    status = 'basic',
    expiresAt = null,
    tier2 = false,
    chatForever = false,
    source = MANUAL,
    orderId = null,
    purchasedAt = new Date(),
  } = opts;
  const months = keys.map(normalizeMonthKey).filter(Boolean);

  const prev = {
    status: user.subscriptionStatus || null,
    plan: user.subscriptionPlan || null,
    expiresAt: user.subscriptionExpiresAt || null,
  };

  const club = addAll(user.clubMonthsEntitled, months);
  user.clubMonthsEntitled = club.list;

  let tier2Res = { added: [] };
  if (tier2) {
    tier2Res = addAll(user.tier2MonthsEntitled, months);
    user.tier2MonthsEntitled = tier2Res.list;
  }
  let chatRes = { added: [] };
  if (chatForever) {
    chatRes = addAll(user.clubChatForever, months);
    user.clubChatForever = chatRes.list;
  }

  let set = null;
  if (expiresAt) {
    // Админка: срок и статус ставятся ровно как выбрали (поведение до 05.11).
    user.subscriptionStatus = status;
    user.subscriptionPlan = plan;
    user.subscriptionExpiresAt = expiresAt;
    set = { status, plan, expiresAt };
  } else {
    // CRM (L2): срок не укорачиваем; статус premium не понижаем.
    const end = lastMonthEnd(months);
    const cur = user.subscriptionExpiresAt instanceof Date ? user.subscriptionExpiresAt : null;
    const extend = end && (!cur || end > cur);
    const newExpires = extend ? end : cur;
    const keepPremium = user.subscriptionStatus === 'premium' && isActiveSub(user);
    const newStatus = keepPremium ? 'premium' : 'basic';
    if (extend || user.subscriptionStatus !== newStatus) {
      user.subscriptionStatus = newStatus;
      user.subscriptionExpiresAt = newExpires;
      if (extend) {user.subscriptionPlan = plan;}
      set = {
        status: newStatus,
        plan: user.subscriptionPlan || null,
        expiresAt: newExpires,
      };
    }
  }

  await user.save();

  const finalExpires = user.subscriptionExpiresAt || null;
  await recordPurchase(source, {
    userId: user._id,
    itemType: 'subscription',
    itemId: plan,
    platform: 'web',
    appleProductId: null,
    transactionId:
      source === CRM ? crmTxId(orderId, 'sub') : manualTxId('sub', user._id, plan),
    purchasedAt,
    expiresAt: finalExpires,
  });

  return {
    months,
    tier2Months: tier2 ? months : [],
    chatMonths: chatForever ? months : [],
    preexisting: {
      months: months.filter((k) => !club.added.includes(k)),
      tier2Months: tier2 ? months.filter((k) => !tier2Res.added.includes(k)) : [],
      chatMonths: chatForever ? months.filter((k) => !chatRes.added.includes(k)) : [],
    },
    subscription: { prev, set },
  };
}

/**
 * Ручная выдача подписки из админки (POST /api/admin/users/:id/subscription).
 * Логика перенесена из admin-users.js 05.11.2026 без изменений:
 *   - expiresAt задан (перенос абонементов) → срок = он, месяцы = от сейчас
 *     до даты включительно (UTC);
 *   - иначе срок = длительность плана от сейчас, месяцы — по плану
 *     (clubMonthKeysForPurchase);
 *   - status=premium → те же месяцы в Тариф 2.
 * Возвращает итоговый срок.
 */
async function grantManualSubscription(user, { status, plan, expiresAt: explicit }) {
  const now = new Date();
  let expiresAt;
  if (explicit) {
    expiresAt = explicit;
    if (expiresAt.getTime() <= now.getTime()) {
      throw new AppError('VALIDATION_ERROR', 'Дата окончания должна быть в будущем', 400);
    }
  } else {
    const months = planDurationMonths(plan);
    expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + months);
  }
  const keys = explicit ? clubMonthKeysBetween(now, expiresAt) : clubMonthKeysForPurchase(now, plan);
  await grantClubMonths(user, keys, {
    plan,
    status,
    expiresAt,
    tier2: status === 'premium',
    source: MANUAL,
    purchasedAt: now,
  });
  return { expiresAt };
}

/** Снять подписку (status=free в админке). Месяцы НЕ трогает — как раньше. */
async function clearSubscription(user) {
  user.subscriptionStatus = 'free';
  user.subscriptionPlan = null;
  user.subscriptionExpiresAt = null;
  await user.save();
}

/**
 * Снять один клубный месяц (админка /revoke-club-month). Тариф 2 и «чат
 * остаётся» без клуба не бывают — снимаются вместе с ним.
 * Возвращает обновлённый lean-набор или null, если пользователя нет.
 */
async function revokeClubMonth(userId, key) {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $pull: {
        clubMonthsEntitled: key,
        tier2MonthsEntitled: key,
        clubChatForever: key,
      },
    },
    { new: true }
  ).select('clubMonthsEntitled');
  return user;
}

/**
 * Тариф 2 на месяц (админка /grant-tier2-month): только к уже выданному клубу.
 * Возвращает user (документ) или бросает AppError.
 */
async function grantTier2Month(userId, key) {
  const user = await User.findById(userId).select('clubMonthsEntitled tier2MonthsEntitled');
  if (!user) {
    throw new AppError('NOT_FOUND', 'Пользователь не найден', 404);
  }
  if (!asList(user.clubMonthsEntitled).includes(key)) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Клуба за ${key} у участницы нет. Сначала выдайте подписку (можно сразу «Тариф 2»)`,
      400
    );
  }
  if (!asList(user.tier2MonthsEntitled).includes(key)) {
    user.tier2MonthsEntitled = [...asList(user.tier2MonthsEntitled), key];
    await user.save();
  }
  await recordPurchase(MANUAL, {
    userId: user._id,
    itemType: 'subscription',
    itemId: 'tier2',
    platform: 'web',
    appleProductId: null,
    transactionId: manualTxId('tier2', user._id, key),
    purchasedAt: new Date(),
  });
  return user;
}

async function revokeTier2Month(userId, key) {
  return User.findByIdAndUpdate(
    userId,
    { $pull: { tier2MonthsEntitled: key } },
    { new: true }
  ).select('tier2MonthsEntitled');
}

/* ------------------------------------------------------------------ *
 *                        РАЗБОРЫ И ПАКЕТЫ                             *
 * ------------------------------------------------------------------ */

/**
 * Открыть разборы. books — lean Book с _id, bookSlug, priceUsd.
 * Возвращает {bookIds, preexisting: {bookIds}}.
 */
async function grantBooks(user, books, opts = {}) {
  const { source = MANUAL, orderId = null, purchasedAt = new Date() } = opts;
  const ids = books.map((b) => b._id);
  const res = addAll(user.purchasedBooks, ids, sameId);
  user.purchasedBooks = res.list;
  await user.save();
  for (const book of books) {
    await recordPurchase(source, {
      userId: user._id,
      itemType: 'book',
      itemId: book.bookSlug,
      platform: 'web',
      appleProductId: `book.${book.bookSlug}`,
      transactionId:
        source === CRM
          ? crmTxId(orderId, 'book', book.bookSlug)
          : manualTxId('book', user._id, book.bookSlug),
      priceUsd: book.priceUsd || 0,
      purchasedAt,
    });
  }
  return {
    bookIds: ids,
    preexisting: { bookIds: ids.filter((id) => !hasId(res.added, id)) },
  };
}

/**
 * Открыть пакет. pkg — lean Package с _id, packageSlug, priceUsd.
 */
async function grantPackage(user, pkg, opts = {}) {
  const { source = MANUAL, orderId = null, purchasedAt = new Date() } = opts;
  const res = addAll(user.purchasedPackages, [pkg._id], sameId);
  user.purchasedPackages = res.list;
  await user.save();
  await recordPurchase(source, {
    userId: user._id,
    itemType: 'package',
    itemId: pkg.packageSlug,
    platform: 'web',
    appleProductId: `package.${pkg.packageSlug}`,
    transactionId:
      source === CRM
        ? crmTxId(orderId, 'pkg', pkg.packageSlug)
        : manualTxId('pkg', user._id, pkg.packageSlug),
    priceUsd: pkg.priceUsd || 0,
    purchasedAt,
  });
  return {
    packageIds: [pkg._id],
    preexisting: { packageIds: res.added.length ? [] : [pkg._id] },
  };
}

/**
 * Снять разбор (админка /revoke-book): из purchasedBooks + все ручные
 * Purchase (platform web, active) этого разбора → cancelled, чтобы он ушёл
 * из «Моих покупок» и «Оплат» (03.11.2026). Покупки стора не трогаем.
 */
async function revokeBook(userId, book) {
  await User.findByIdAndUpdate(userId, { $pull: { purchasedBooks: book._id } });
  await Purchase.updateMany(
    { userId, itemType: 'book', itemId: book.bookSlug, platform: 'web', status: 'active' },
    { $set: { status: 'cancelled' } }
  );
}

/** Снять пакет (админка /revoke-package) — как revokeBook. */
async function revokePackage(userId, pkg) {
  await User.findByIdAndUpdate(userId, { $pull: { purchasedPackages: pkg._id } });
  await Purchase.updateMany(
    { userId, itemType: 'package', itemId: pkg.packageSlug, platform: 'web', status: 'active' },
    { $set: { status: 'cancelled' } }
  );
}

/* ------------------------------------------------------------------ *
 *                   СНЯТИЕ ВЫДАННОГО ПО ЗАКАЗУ CRM                    *
 * ------------------------------------------------------------------ */

/**
 * Снять ровно выданное заказом (возврат, «ложный», отвязка, конец срока).
 *
 * user — документ User. granted — снимок CrmOrder.granted:
 *   { months, bookIds, packageIds, subscriptionSet: { tier2Months, chatMonths,
 *     preexisting: {months, tier2Months, chatMonths, bookIds, packageIds},
 *     subscription: {prev, set} } }
 * opts.keep — что выдано ДРУГИМИ действующими заказами этой участницы
 *   ({months, bookIds, packageIds, chatMonths, expiresAt}) — это не снимаем.
 * opts.only — 'content' снимает только разборы и пакеты (конец срока term).
 * opts.orderId — отменить записи Purchase этого заказа.
 *
 * Не снимается: то, что было у участницы ДО заказа (preexisting — оплата в
 * App Store, ручная выдача), и то, что держат другие заказы.
 */
async function revokeGranted(user, granted, opts = {}) {
  const { keep = {}, only = null, orderId = null } = opts;
  const ss = (granted && granted.subscriptionSet) || {};
  const pre = ss.preexisting || {};
  const keepMonths = new Set(asList(keep.months));
  const keepChat = new Set(asList(keep.chatMonths));
  const removed = { months: [], bookIds: [], packageIds: [], chatMonths: [] };

  const drop = (list, items, eq) => {
    const out = asList(list).filter((x) => !items.some((i) => eq(i, x)));
    return out;
  };

  if (only !== 'content') {
    const months = asList(granted.months).filter(
      (k) => !asList(pre.months).includes(k) && !keepMonths.has(k)
    );
    if (months.length) {
      user.clubMonthsEntitled = drop(user.clubMonthsEntitled, months, (a, b) => a === b);
      // Тариф 2 без клуба не бывает (как в /revoke-club-month).
      user.tier2MonthsEntitled = drop(user.tier2MonthsEntitled, months, (a, b) => a === b);
      removed.months = months;
    }
    const chat = asList(ss.chatMonths).filter(
      (k) => !asList(pre.chatMonths).includes(k) && !keepChat.has(k)
    );
    const chatAll = [...new Set([...chat, ...months])];
    if (chatAll.length) {
      user.clubChatForever = drop(user.clubChatForever, chatAll, (a, b) => a === b);
      removed.chatMonths = chatAll;
    }

    // Срок подписки: откатываем, только если он всё ещё наш (никто — App
    // Store, админка, другой заказ — его после нас не менял).
    const set = ss.subscription && ss.subscription.set;
    const prev = (ss.subscription && ss.subscription.prev) || {};
    const cur = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : null;
    if (set && set.expiresAt && cur === new Date(set.expiresAt).getTime()) {
      const prevExp = prev.expiresAt ? new Date(prev.expiresAt) : null;
      const keepExp = keep.expiresAt ? new Date(keep.expiresAt) : null;
      if (keepExp && (!prevExp || keepExp > prevExp)) {
        user.subscriptionExpiresAt = keepExp;
      } else {
        user.subscriptionExpiresAt = prevExp;
        user.subscriptionStatus = prev.status || 'free';
        user.subscriptionPlan = prev.plan || null;
      }
    }
  }

  const keepBooks = asList(keep.bookIds);
  const books = asList(granted.bookIds).filter(
    (id) => !hasId(pre.bookIds, id) && !hasId(keepBooks, id)
  );
  if (books.length) {
    user.purchasedBooks = drop(user.purchasedBooks, books, sameId);
    removed.bookIds = books;
  }
  const keepPkgs = asList(keep.packageIds);
  const pkgs = asList(granted.packageIds).filter(
    (id) => !hasId(pre.packageIds, id) && !hasId(keepPkgs, id)
  );
  if (pkgs.length) {
    user.purchasedPackages = drop(user.purchasedPackages, pkgs, sameId);
    removed.packageIds = pkgs;
  }

  await user.save();

  if (orderId) {
    const filter = {
      userId: user._id,
      platform: 'web',
      status: 'active',
      transactionId: { $regex: `^${escapeRegex(`crm-${orderId}-`)}` },
    };
    if (only === 'content') {
      filter.itemType = { $in: ['book', 'package'] };
    }
    await Purchase.updateMany(filter, { $set: { status: 'cancelled' } });
  }

  return removed;
}

module.exports = {
  // клуб
  grantClubMonths,
  grantManualSubscription,
  clearSubscription,
  revokeClubMonth,
  grantTier2Month,
  revokeTier2Month,
  // контент
  grantBooks,
  grantPackage,
  revokeBook,
  revokePackage,
  // CRM
  revokeGranted,
  // помощники (и для тестов)
  monthKeyEnd,
  lastMonthEnd,
  normalizeMonthKey,
  parseMonthKey,
  clubMonthKeysBetween,
  manualTxId,
  crmTxId,
};
