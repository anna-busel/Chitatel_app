const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const WeeklyReport = require('../models/WeeklyReport');
const MonthlyReport = require('../models/MonthlyReport');

const router = Router();

// Отчёты личные — только для владельца.
router.use(requireAuth);

/**
 * GET /api/reports/weekly/latest
 * Последний отчёт пользователя (кнопка «Еженедельный отчёт» в дневнике, 4.24 → 4.26).
 * Если отчётов ещё нет — возвращает { report: null } (клиент прячет кнопку).
 */
router.get('/weekly/latest', async (req, res, next) => {
  try {
    const report = await WeeklyReport.findOne({ userId: req.user.userId })
      .sort({ year: -1, weekNumber: -1 })
      .populate('quotes', 'text author bookTitle aiStatus aiAnalysis createdAt')
      .lean();

    return success(res, { report: report || null });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/reports/weekly/list
 * Все недельные отчёты пользователя (метаданные для архива/переключателя, 4.26).
 * Полный текст не тянем — он грузится при выборе конкретного отчёта.
 * Новые сверху.
 */
router.get('/weekly/list', async (req, res, next) => {
  try {
    const reports = await WeeklyReport.find({ userId: req.user.userId })
      .sort({ year: -1, weekNumber: -1 })
      .select('weekNumber year startDate endDate stats')
      .lean();

    return success(res, { reports });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/reports/weekly?week=&year=
 * Конкретный отчёт по номеру недели (экран 4.26).
 */
const weeklySchema = z.object({
  week: z.coerce.number().int().min(1).max(53),
  year: z.coerce.number().int().min(2026).max(2100),
});

router.get('/weekly', validate(weeklySchema, 'query'), async (req, res, next) => {
  try {
    const { week, year } = req.query;

    const report = await WeeklyReport.findOne({
      userId: req.user.userId,
      weekNumber: week,
      year,
    })
      .populate('quotes', 'text author bookTitle aiStatus aiAnalysis createdAt')
      .lean();

    if (!report) {
      throw new AppError('NOT_FOUND', 'Отчёт не найден', 404);
    }

    return success(res, { report });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/reports/monthly/latest
 * Последний месячный отчёт пользователя (экран 4.26).
 * Рекомендации вложены в сам документ (populate не нужен).
 */
router.get('/monthly/latest', async (req, res, next) => {
  try {
    const report = await MonthlyReport.findOne({ userId: req.user.userId })
      .sort({ year: -1, month: -1 })
      .lean();

    return success(res, { report: report || null });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/reports/monthly/list
 * Все месячные отчёты пользователя (метаданные для архива/переключателя, 4.26).
 * Новые сверху.
 */
router.get('/monthly/list', async (req, res, next) => {
  try {
    const reports = await MonthlyReport.find({ userId: req.user.userId })
      .sort({ year: -1, month: -1 })
      .select('month year startDate endDate stats')
      .lean();

    return success(res, { reports });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/reports/monthly?month=&year=
 * Конкретный месячный отчёт.
 */
const monthlySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2026).max(2100),
});

router.get('/monthly', validate(monthlySchema, 'query'), async (req, res, next) => {
  try {
    const { month, year } = req.query;

    const report = await MonthlyReport.findOne({
      userId: req.user.userId,
      month,
      year,
    }).lean();

    if (!report) {
      throw new AppError('NOT_FOUND', 'Отчёт не найден', 404);
    }

    return success(res, { report });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
