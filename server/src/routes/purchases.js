const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const purchaseService = require('../services/purchase.service');
const Purchase = require('../models/Purchase');

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
 */
router.get('/history', async (req, res, next) => {
  try {
    const purchases = await Purchase.find({ userId: req.user.userId })
      .sort({ purchasedAt: -1 })
      .select('itemType itemId appleProductId status purchasedAt expiresAt')
      .lean();

    return success(res, { purchases });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
