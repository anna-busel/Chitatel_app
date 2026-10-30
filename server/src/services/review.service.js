const mongoose = require('mongoose');
const Review = require('../models/Review');
const Book = require('../models/Book');

/**
 * Отзывы на разборы (UPDATES-PLAN C1/C2).
 *
 * Book.rating / Book.reviewCount — производные от видимых отзывов (isHidden=false).
 * Пересчитываем целиком агрегацией, а не инкрементом: так скрытие, правка
 * оценки и удаление аккаунта не накапливают расхождений.
 */

function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(String(id));
}

/**
 * Пересчитать рейтинг разбора по видимым отзывам.
 * rating — среднее, округлённое до 0,1; без отзывов — 0.
 * Возвращает { rating, reviewCount }.
 */
async function recomputeBookRating(bookId) {
  const [agg] = await Review.aggregate([
    { $match: { bookId: toObjectId(bookId), isHidden: false } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const reviewCount = agg ? agg.count : 0;
  const rating = agg && agg.count > 0 ? Math.round(agg.avg * 10) / 10 : 0;

  await Book.updateOne({ _id: bookId }, { $set: { rating, reviewCount } });
  return { rating, reviewCount };
}

/**
 * Скрыть отзыв (Анна / модератор) и пересчитать рейтинг книги.
 * Возвращает отзыв или null, если не найден.
 */
async function hideReview(reviewId) {
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { $set: { isHidden: true } },
    { new: true }
  ).lean();
  if (!review) {
    return null;
  }
  await recomputeBookRating(review.bookId);
  return review;
}

/**
 * Удаление аккаунта (UPDATES-PLAN A4 для R1): стереть все отзывы участницы
 * и пересчитать рейтинг затронутых разборов.
 */
async function deleteUserReviews(userId) {
  const bookIds = await Review.distinct('bookId', { userId });
  if (!bookIds.length) {
    return 0;
  }
  await Review.deleteMany({ userId });
  for (const bookId of bookIds) {
    await recomputeBookRating(bookId);
  }
  return bookIds.length;
}

module.exports = { recomputeBookRating, hideReview, deleteUserReviews };
