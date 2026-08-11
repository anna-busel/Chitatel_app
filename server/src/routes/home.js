const { Router } = require('express');
const { optionalAuth } = require('../middleware/auth');
const { success } = require('../utils/response');
const Book = require('../models/Book');
const ClubMonth = require('../models/ClubMonth');
const Progress = require('../models/Progress');
const dailyThoughts = require('../config/daily-thoughts');

const router = Router();

/**
 * GET /api/home
 * Данные для главной страницы.
 * { clubMonth, dailyQuote, freeBooks, popularBooks, continueListening }
 *
 * ⚠️ ФИКС 11.07.2026: книга клуба берётся через ClubMonth.bookId — тем же путём,
 * что и сам клуб (единый источник истины).
 *
 * ⚠️ ФИКС 13.07.2026 — «ПОПУЛЯРНЫЕ НЕ ГРУЗЯТСЯ С ПЕРВОГО РАЗА».
 * Симптом: после холодного старта (или на свежем аккаунте) блок «Популярные»
 * пуст, а после pull-to-refresh появляется и больше не пропадает.
 * ПРИЧИНА: популярные отдавались ТОЛЬКО авторизованным (`if (req.user)`).
 * При первом запросе access-токен часто уже протух → `optionalAuth` молча не
 * опознаёт юзера (он на то и optional) → popularBooks приходил пустым. После
 * рефреша токен уже обновлён интерцептором → блок появляется.
 * ЛЕЧЕНИЕ: популярные — это обычный каталог, скрывать их от гостя незачем
 * (гость и так видит каталог целиком). Отдаём всем.
 *
 * ⚠️ 13.07.2026 — «ПРОДОЛЖИТЬ СЛУШАТЬ» (continueListening).
 * На главной была мёртвая карточка «Мой прогресс» из Фазы 2: она НИЧЕГО не
 * показывала (всегда «Начните слушать первый разбор») и вела в каталог.
 * Теперь сервер отдаёт последний начатый разбор: книга + часть + позиция.
 * Клиент рисует компактную строку «Продолжить слушать» с кнопкой ▶.
 * Если ничего не начато — поле null, и блок на главной НЕ показывается вовсе
 * (лучше пустота, чем мёртвая карточка).
 * Статистика (минуты/книги/цитаты) на главную НЕ выносится — она в профиле
 * («Мой прогресс», GET /api/progress/stats). Главная должна звать слушать,
 * а не отчитываться.
 */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const bookFields =
      'title author coverImageUrl coverGradientColors coverLabel bookSlug ' +
      'durationTotal rating reviewCount priceUsd priceRub priceByn isFree isPartOfClub ' +
      'categories parts';

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

    // Популярные разборы — ВСЕМ (см. фикс выше).
    const popularBooks = await Book.find({
      isPublished: true,
      isFree: false,
      isPartOfClub: false,
    })
      .select(bookFields)
      .sort({ rating: -1, reviewCount: -1 })
      .limit(4)
      .lean();

    // Продолжить слушать — только для авторизованных (у гостя прогресса нет).
    let continueListening = null;
    if (req.user) {
      const progress = await Progress.findOne({ userId: req.user.userId })
        .sort({ lastListenedAt: -1 })
        .select('bookId currentPartNumber positionSeconds lastListenedAt')
        .lean();

      if (progress && progress.lastListenedAt) {
        const book = await Book.findOne({
          _id: progress.bookId,
          isPublished: true,
        })
          .select(bookFields)
          .lean();

        // Книгу могли снять с публикации — тогда блок не показываем.
        if (book) {
          const part = (book.parts || []).find(
            (p) => p.number === progress.currentPartNumber
          );
          continueListening = {
            book,
            currentPartNumber: progress.currentPartNumber,
            positionSeconds: progress.positionSeconds,
            partTitle: part && part.title ? part.title : null,
            partDuration: part && part.duration ? part.duration : null,
            lastListenedAt: progress.lastListenedAt,
          };
        }
      }
    }

    // Мысль дня — фраза Анны с детерминированной ротацией по дню
    // (config/daily-thoughts). Один и тот же текст у всех участниц в течение
    // суток, каждый день следующий по списку, по кругу. Границу суток берём по
    // Москве (+3ч к UTC — аудитория клуба), чтобы мысль менялась в местную
    // полночь, а не в 3 ночи. Автор — Анна Бусел, книги-источника нет
    // (bookTitle пустой; клиент тогда не показывает часть «, «книга»»).
    // Управление из админки появится позже (6.6).
    const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
    const dayIndex = Math.floor((Date.now() + MSK_OFFSET_MS) / 86400000);
    const dailyQuote = {
      text: dailyThoughts[dayIndex % dailyThoughts.length],
      author: 'Анна Бусел',
      bookTitle: '',
    };

    return success(res, {
      clubMonth: clubBook
        ? { book: clubBook, month: currentMonth }
        : null,
      dailyQuote,
      freeBooks,
      popularBooks,
      continueListening,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
