const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Package = require('../models/Package');
const User = require('../models/User');

const router = Router();

/**
 * Набор id купленных пакетов (строками) для текущего юзера, ЛИБО 'admin'
 * (полный доступ), ЛИБО null (гость / не найден). Один запрос User на весь
 * список — не дёргаем БД на каждый пакет.
 */
async function ownedPackagesFor(req) {
  if (!req.user || !req.user.userId) return null;
  const user = await User.findById(req.user.userId)
    .select('purchasedPackages role')
    .lean();
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  return new Set((user.purchasedPackages || []).map((id) => id.toString()));
}

function computeHasAccess(owned, pkgId) {
  if (owned === 'admin') return true;
  if (owned instanceof Set) return owned.has(pkgId.toString());
  return false;
}

/**
 * GET /api/packages
 * MASTER 7.4: список пакетов.
 *
 * optionalAuth: авторизованному добавляем вычисляемое hasAccess по каждому
 * пакету (куплен / админ) — каталог показывает «Куплено» вместо цены.
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const packages = await Package.find({ isPublished: true })
      .populate('books', 'title author coverImageUrl coverGradientColors coverLabel durationTotal rating reviewCount')
      .sort({ createdAt: -1 })
      .lean();

    const owned = await ownedPackagesFor(req);
    const withAccess = packages.map((p) => ({
      ...p,
      hasAccess: computeHasAccess(owned, p._id),
    }));

    return success(res, { packages: withAccess });
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

    const owned = await ownedPackagesFor(req);
    const hasAccess = computeHasAccess(owned, pkg._id);

    return success(res, { package: { ...pkg, hasAccess } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
