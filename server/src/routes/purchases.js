const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const purchaseService = require('../services/purchase.service');
const Purchase = require('../models/Purchase');
const Book = require('../models/Book');
const Package = require('../models/Package');

const router = Router();

// Покупки привязаны к юзеру — авторизация обязательна.
router.use(requireAuth);

/**
 * POST /api/purchases/verify
 * Принимает подписанную транзакцию Apple (JWS), верифицирует, обновляет права.
 * Body: { signedTransaction: string }
 */
const verifySchema = z.object({
  signedTransaction: z.string().min(1),
});

router.post('/verify', validate(verifySchema), async (req, res, next) => {
  try {
    const result = await purchaseService.verifyPurchase({
      userId: req.user.userId,
      signedTransaction: req.body.signedTransaction,
    });
    return success(res, result);
  } catch (err) {
    return next(err);
  }
});

/**
 * Обложка для карточки «Мои покупки» — минимальный набор полей, который
 * рисует клиентский BookCoverImage (реальный ассет/сеть, иначе градиент+label).
 */
function coverOf(doc) {
  return {
    coverImageUrl: doc.coverImageUrl || '',
    coverGradientColors: doc.coverGradientColors || [],
    coverLabel: doc.coverLabel || '',
  };
}

/**
 * GET /api/purchases/history
 * История покупок пользователя (экран «Мои покупки», 4.44, задача 6.2).
 *
 * Отдаём и подписки, и разовые покупки (разборы, пакеты) — как есть, новые
 * сверху. Цену НЕ храним и не показываем: она живёт в App Store и зависит от
 * страны покупателя (правило проекта — цена только из StoreKit).
 *
 * Для разборов и пакетов резолвим itemId (slug) → название (title), targetId
 * (_id для перехода) + данные для оформления карточки:
 *   - book: author + cover = обложка разбора;
 *   - package: bookCount (всего разборов) + cover = СОБСТВЕННАЯ обложка пакета.
 * Для subscription/archive title/cover пустые (клиент рисует эмблему).
 */
router.get('/history', async (req, res, next) => {
  try {
    const purchases = await Purchase.find({ userId: req.user.userId })
      .sort({ purchasedAt: -1 })
      .select('itemType itemId appleProductId status purchasedAt expiresAt')
      .lean();

    const bookSlugs = purchases
      .filter((p) => p.itemType === 'book' && p.itemId)
      .map((p) => p.itemId);
    const pkgSlugs = purchases
      .filter((p) => p.itemType === 'package' && p.itemId)
      .map((p) => p.itemId);

    const [books, packages] = await Promise.all([
      bookSlugs.length
        ? Book.find({ bookSlug: { $in: bookSlugs } })
            .select('_id bookSlug title author coverImageUrl coverGradientColors coverLabel')
            .lean()
        : [],
      pkgSlugs.length
        ? Package.find({ packageSlug: { $in: pkgSlugs } })
            .select('_id packageSlug title coverImageUrl coverGradientColors coverLabel books')
            .lean()
        : [],
    ]);

    const bookBySlug = new Map(books.map((b) => [b.bookSlug, b]));
    const pkgBySlug = new Map(packages.map((p) => [p.packageSlug, p]));

    const enriched = purchases.map((p) => {
      let title = null;
      let targetId = null;
      let author = null;
      let bookCount = null;
      let cover = null;

      if (p.itemType === 'book') {
        const b = bookBySlug.get(p.itemId);
        if (b) {
          title = b.title;
          targetId = String(b._id);
          author = b.author || null;
          cover = coverOf(b);
        }
      } else if (p.itemType === 'package') {
        const pkg = pkgBySlug.get(p.itemId);
        if (pkg) {
          title = pkg.title;
          targetId = String(pkg._id);
          bookCount = Array.isArray(pkg.books) ? pkg.books.length : null;
          cover = coverOf(pkg);
        }
      }

      return { ...p, title, targetId, author, bookCount, cover };
    });

    return success(res, { purchases: enriched });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
