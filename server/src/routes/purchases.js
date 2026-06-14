const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const purchaseService = require('../services/purchase.service');

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

module.exports = router;
