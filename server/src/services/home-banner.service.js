const HomeBanner = require('../models/HomeBanner');
const Book = require('../models/Book');
const { generateImageSignedUrl } = require('./image.service');

/**
 * Баннеры на главной (UPDATES-PLAN T, 05.11.2026).
 *
 * Логика отбора вынесена сюда из роута, чтобы её можно было проверить
 * без БД (tests/home-banners.test.js).
 */

// Поля книги для карточки — те же, что отдаёт GET /api/home (карточки
// «Популярного»/каталога: обложка, цена из StoreKit по appleProductId).
const BOOK_CARD_FIELDS =
  'title author coverImageUrl coverGradientColors coverLabel bookSlug ' +
  'durationTotal rating reviewCount priceUsd priceRub priceByn isFree isPartOfClub ' +
  'appleProductId categories parts';

const PLATFORMS = ['ios', 'android'];

/** 'ios' | 'android' | null (неизвестная или пустая — старый клиент). */
function normalizePlatform(p) {
  const v = String(p || '').trim().toLowerCase();
  return PLATFORMS.includes(v) ? v : null;
}

/** Показывать ли баннер на платформе в момент now. */
function isBannerVisible(banner, platform, now) {
  if (!banner || !banner.isActive) return false;
  const platforms =
    Array.isArray(banner.platforms) && banner.platforms.length
      ? banner.platforms
      : ['ios'];
  if (!platforms.includes(platform)) return false;
  const t = now.getTime();
  const start = new Date(banner.startsAt).getTime();
  const end = new Date(banner.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start <= t && t < end;
}

function byOrder(a, b) {
  const d = (a.order || 0) - (b.order || 0);
  if (d !== 0) return d;
  return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
}

/**
 * Активные баннеры для платформы, уже с подписанной картинкой и действием.
 *
 * @param {string} platformRaw — ?platform= из запроса
 * @param {{now?: Date, markOwned?: (books: object[]) => Promise<object[]>}} opts
 * @returns {Promise<Array<{id, imageUrl, action}>>}
 */
async function listActiveBanners(platformRaw, opts = {}) {
  const platform = normalizePlatform(platformRaw);
  // Старые клиенты платформу не шлют — им баннеров нет (и рисовать нечем).
  if (!platform) return [];

  const now = opts.now || new Date();
  const candidates = await HomeBanner.find({
    isActive: true,
    platforms: platform,
    endsAt: { $gt: now },
  }).lean();

  const banners = (candidates || [])
    .filter((b) => isBannerVisible(b, platform, now))
    .sort(byOrder);
  if (!banners.length) return [];

  // Все разборы из действий — одним запросом, только опубликованные.
  const ids = new Set();
  banners.forEach((b) => {
    const a = b.action || {};
    if (a.kind === 'book' && a.bookId) ids.add(String(a.bookId));
    if (a.kind === 'books') (a.bookIds || []).forEach((id) => ids.add(String(id)));
  });
  let booksById = new Map();
  if (ids.size) {
    let books = await Book.find({ _id: { $in: [...ids] }, isPublished: true })
      .select(BOOK_CARD_FIELDS)
      .lean();
    if (opts.markOwned) books = await opts.markOwned(books || []);
    booksById = new Map((books || []).map((bk) => [String(bk._id), bk]));
  }

  return banners.map((b) => ({
    id: String(b._id),
    imageUrl: generateImageSignedUrl(b.imageStoragePath),
    action: publicAction(b.action, booksById),
  }));
}

/**
 * Действие для клиента. Снятый с публикации разбор → «ничего» (баннер
 * остаётся, просто не ведёт в пустоту).
 */
function publicAction(action, booksById) {
  const a = action || {};
  if (a.kind === 'book' && a.bookId && booksById.has(String(a.bookId))) {
    return { kind: 'book', bookId: String(a.bookId) };
  }
  if (a.kind === 'books') {
    const books = (a.bookIds || [])
      .map((id) => booksById.get(String(id)))
      .filter(Boolean);
    if (books.length) {
      return { kind: 'books', listTitle: a.listTitle || '', books };
    }
  }
  return { kind: 'none' };
}

module.exports = {
  BOOK_CARD_FIELDS,
  normalizePlatform,
  isBannerVisible,
  listActiveBanners,
};
