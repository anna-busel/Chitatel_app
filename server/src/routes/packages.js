const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Package = require('../models/Package');
const User = require('../models/User');

const router = Router();

/**
 * GET /api/packages
 * MASTER 7.4: список пакетов
 */
router.get('/', async (_req, res, next) => {
  try {
    const packages = await Package.find({ isPublished: true })
      .populate('books', 'title author coverImageUrl coverGradientColors coverLabel durationTotal rating reviewCount')
      .sort({ createdAt: -1 })
      .lean();

    return success(res, { packages });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/packages/:id
 * MASTER 7.4: детали пакета.
 *
 * optionalAuth: если юзер авторизован — в объект пакета добавляется
 * ВЫЧИСЛЯЕМОЕ поле hasAccess (true = пакет куплен как Non-Consumable IAP ИЛИ
 * админ). Клиент (package_screen) по нему прячет кнопку «Купить пакет» после
 * покупки. Без авторизации hasAccess = false.
 *
 * Семантика намеренно простая: пакет — отдельный товар, поэтому доступ = факт
 * покупки ИМЕННО пакета (user.purchasedPackages). Наличие всех входящих
 * разборов по отдельности/подписке пакет «купленным» НЕ делает (доступ к самим
 * разборам при этом всё равно открыт — это считает GET /books/:id.hasAccess).
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const pkg = await Package.findOne({
      _id: req.params.id,
      isPublished: true,
    })
      .populate('books', 'title author description coverImageUrl coverGradientColors coverLabel durationTotal categories priceUsd priceRub priceByn isFree rating reviewCount parts bookSlug')
      .lean();

    if (!pkg) {
      throw new AppError('NOT_FOUND', 'Пакет не найден', 404);
    }

    let hasAccess = false;
    if (req.user && req.user.userId) {
      const user = await User.findById(req.user.userId)
        .select('purchasedPackages role')
        .lean();
      if (user) {
        hasAccess = user.role === 'admin' ||
          (Array.isArray(user.purchasedPackages) &&
            user.purchasedPackages.some(
              (id) => id.toString() === pkg._id.toString()
            ));
      }
    }

    return success(res, { package: { ...pkg, hasAccess } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
