const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const Book = require('../models/Book');
const ClubMonth = require('../models/ClubMonth');

const router = Router();

/**
 * GET /api/home
 * MASTER 7.4: данные для главной страницы
 * { clubMonth, dailyQuote, freeBooks, popularBooks }
 *
 * Поля `.select()` соответствуют расширенной схеме Book (см. AI-CONTEXT →
 * РАСХОЖДЕНИЯ С MASTER.md): coverImageUrl, bookSlug, priceUsd/Rub/Byn, isFree.
 *
 * ⚠️ ФИКС 11.07.2026: книга клуба берётся через ClubMonth.bookId — тем же
 * путём, что и сам клуб (единый источник истины). Раньше главная искала по
 * дублирующим полям книги (isPartOfClub + Book.clubMonth), которые seed:club
 * не проставляет → рассинхрон, карточка клуба на главной без книги/обложки.
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const bookFields =
      'title author coverImageUrl coverGradientColors coverLabel bookSlug ' +
      'durationTotal rating reviewCount priceUsd priceRub priceByn isFree isPartOfClub ' +
      'categories';

    // Бесплатные разборы
    const freeBooks = await Book.find({ isPublished: true, isFree: true })
      .select(bookFields)
      .sort({ publishedAt: -1 })
      .limit(6)
      .lean();

    // Книга клуба текущего месяца — через ClubMonth.bookId (как в самом клубе)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let clubBook = null;
    const currentClub = await ClubMonth.findOne({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    })
      .select('bookId')
      .lean();
    if (currentClub && currentClub.bookId) {
      clubBook = await Book.findOne({ _id: currentClub.bookId, isPublished: true })
        .select(bookFields)
        .lean();
    }

    // Популярные разборы (для авторизованных)
    let popularBooks = [];
    if (req.user) {
      popularBooks = await Book.find({
        isPublished: true,
        isFree: false,
        isPartOfClub: false,
      })
        .select(bookFields)
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
