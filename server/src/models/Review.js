const mongoose = require('mongoose');

/**
 * Отзыв на разбор (UPDATES-PLAN C1, релиз R1).
 *
 * Звёзды 1–5 + текст до 1000 знаков. Один отзыв от участницы на разбор —
 * уникальный индекс {bookId, userId}; повторная отправка правит тот же отзыв.
 * Публикуется сразу, модерация постфактум (P6): Анна скрывает (isHidden),
 * участницы жалуются (Report targetType='review', счётчик reportCount).
 *
 * Book.rating / Book.reviewCount считаются только по видимым отзывам —
 * пересчёт в services/review.service.js (recomputeBookRating) после каждого
 * создания, правки, скрытия и удаления.
 */
const reviewSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: '', trim: true, maxlength: 1000 },
    isHidden: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Один отзыв на разбор от одной участницы.
reviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });

// Лента отзывов разбора: видимые, новые сверху.
reviewSchema.index({ bookId: 1, isHidden: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
