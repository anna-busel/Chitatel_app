const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const Book = require('../models/Book');

const router = Router();

/**
 * GET /api/home
 * MASTER 7.4: данные для главной страницы
 * { clubMonth, dailyQuote, freeBooks, progress }
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    // Бесплатные разборы
    const freeBooks = await Book.find({ isPublished: true, isFree: true })
      .select('title author coverGradientColors coverLabel durationTotal rating')
      .sort({ publishedAt: -1 })
      .limit(6)
      .lean();

    // Книга клуба текущего месяца
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const clubBook = await Book.findOne({
      isPublished: true,
      isPartOfClub: true,
      clubMonth: currentMonth,
    })
      .select('title author coverGradientColors coverLabel durationTotal')
      .lean();

    // Популярные разборы (для авторизованных)
    let popularBooks = [];
    if (req.user) {
      popularBooks = await Book.find({
        isPublished: true,
        isFree: false,
        isPartOfClub: false,
      })
        .select('title author coverGradientColors coverLabel durationTotal price rating reviewCount')
        .sort({ rating: -1, reviewCount: -1 })
        .limit(4)
        .lean();
    }

    // Мысль дня (пока статичная, задача 6.6 — из админки)
    const dailyQuote = {
      text: 'Все счастливые семьи похожи друг на друга, каждая несчастливая семья несчастлива по-своему.',
      author: 'Лев Толстой',
      bookTitle: 'Анна Каренина',
    };

    return success(res, {
      clubMonth: clubBook
        ? { book: clubBook, month: currentMonth }
        : null,
      dailyQuote,
      freeBooks,
      popularBooks,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
