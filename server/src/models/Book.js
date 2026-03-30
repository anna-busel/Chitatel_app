const mongoose = require('mongoose');

/**
 * Mongoose-схема Book.
 * Источник: MASTER.md секция 7.3
 *
 * Книга = аудиоразбор. Может быть бесплатной, платной (one-time),
 * или частью клуба месяца (подписка).
 */
const partSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    title: { type: String, required: true },
    duration: { type: Number, required: true }, // секунды
    audioFilename: { type: String, required: true }, // 'book-123-part-1.mp3'
    isPreviewAvailable: { type: Boolean, default: false }, // true для 1-й части платных
  },
  { _id: false }
);

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    coverGradientColors: { type: [String], default: ['#1A0E08', '#3A2018'] }, // ['#hex1', '#hex2']
    coverLabel: { type: String, default: '' }, // 'МП' (2 буквы)
    durationTotal: { type: Number, default: 0 }, // секунды
    category: {
      type: String,
      enum: ['classic', 'psychology'],
      required: true,
    },

    // Ценообразование
    price: { type: Number, default: null }, // null для бесплатных (USD)
    isFree: { type: Boolean, default: false },
    appleProductId: { type: String, default: null }, // 'book.{id}' для IAP

    // Клуб
    isPartOfClub: { type: Boolean, default: false },
    clubMonth: { type: String, default: null }, // '2026-03' (YYYY-MM)
    freeChapterIndex: { type: Number, default: 0 }, // индекс бесплатной части для превью

    // Рейтинг
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },

    // Части
    parts: [partSchema],

    // Публикация
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Текстовый индекс для поиска (MASTER 7.4: GET /api/books/search?q=)
bookSchema.index({ title: 'text', author: 'text', description: 'text' });

// Индексы для фильтрации
bookSchema.index({ category: 1, isPublished: 1 });
bookSchema.index({ isFree: 1, isPublished: 1 });
bookSchema.index({ isPartOfClub: 1, clubMonth: 1 });

module.exports = mongoose.model('Book', bookSchema);
