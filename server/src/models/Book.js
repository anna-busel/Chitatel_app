const mongoose = require('mongoose');

/**
 * Mongoose-схема Book.
 *
 * ВАЖНО: источник истины для схемы — этот файл, НЕ MASTER.md секция 7.3.
 * MASTER описывает общую архитектуру приложения, схема Book расширена после
 * изучения реального контента Анны (repo g1orgi89/reader-bot, 24.04.2026).
 * См. docs/AI-CONTEXT.md → «РАСХОЖДЕНИЯ С MASTER.md» для деталей.
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
    author: { type: String, default: '' },
    description: { type: String, required: true },

    // Обложка
    coverImageUrl: { type: String, default: '' }, // основной способ: URL реальной обложки
    coverGradientColors: { type: [String], default: ['#1A0E08', '#3A2018'] }, // fallback + фон плеера
    coverLabel: { type: String, default: '' }, // fallback: 'МП' (2 буквы) если нет coverImageUrl

    durationTotal: { type: Number, default: 0 }, // секунды

    // Категоризация (14 категорий Анны, одна книга в нескольких)
    categories: { type: [String], default: [] },
    // Темы для поиска и AI-рекомендаций (не видны юзеру напрямую)
    tags: { type: [String], default: [] },

    // Ценообразование (три валюты; USD — для Apple IAP)
    priceUsd: { type: Number, default: null }, // null для бесплатных
    priceRub: { type: Number, default: null },
    priceByn: { type: Number, default: null }, // оригинал Анны
    isFree: { type: Boolean, default: false },
    appleProductId: { type: String, default: null }, // 'book.{slug}' для IAP

    // Идентификатор для ссылок/обложек (совпадает с именем файла обложки)
    bookSlug: { type: String, default: '', index: true },
    // Ссылка на покупку на внешнем сайте (anna-busel.com) — для фоллбека/админки
    purchaseUrl: { type: String, default: '' },

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
bookSchema.index({ categories: 1, isPublished: 1 });
bookSchema.index({ tags: 1, isPublished: 1 });
bookSchema.index({ isFree: 1, isPublished: 1 });
bookSchema.index({ isPartOfClub: 1, clubMonth: 1 });

module.exports = mongoose.model('Book', bookSchema);
