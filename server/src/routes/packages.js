const { Router } = require('express');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Package = require('../models/Package');

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
 * MASTER 7.4: детали пакета
 */
router.get('/:id', async (req, res, next) => {
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

    return success(res, { package: pkg });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
