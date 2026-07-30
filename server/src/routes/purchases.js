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
 * GET /api/purchases/history
 * История покупок пользователя (экран «Мои покупки», 4.44, задача 6.2).
 *
 * Отдаём и подписки, и разовые покупки (разборы, пакеты) — как есть, новые
 * сверху. Цену НЕ храним и не показываем: она живёт в App Store и зависит от
 * страны покупателя (правило проекта — цена только из StoreKit).
 *
 * Для разборов и пакетов резолвим itemId (slug) → конкретное название (title)
 * и targetId (_id книги/пакета), чтобы клиент показал реальное имя и дал
 * переход на экран разбора/пакета. Для subscription/archive title/targetId
 * = null (клиент подписывает их сам по типу).
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
            .select('_id bookSlug title')
            .lean()
        : [],
      pkgSlugs.length
        ? Package.find({ packageSlug: { $in: pkgSlugs } })
            .select('_id packageSlug title')
            .lean()
        : [],
    ]);

    const bookBySlug = new Map(books.map((b) => [b.bookSlug, b]));
    const pkgBySlug = new Map(packages.map((p) => [p.packageSlug, p]));

    const enriched = purchases.map((p) => {
      let title = null;
      let targetId = null;
      if (p.itemType === 'book') {
        const b = bookBySlug.get(p.itemId);
        if (b) {
          title = b.title;
          targetId = String(b._id);
        }
      } else if (p.itemType === 'package') {
        const pkg = pkgBySlug.get(p.itemId);
        if (pkg) {
          title = pkg.title;
          targetId = String(pkg._id);
        }
      }
      return { ...p, title, targetId };
    });

    return success(res, { purchases: enriched });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
