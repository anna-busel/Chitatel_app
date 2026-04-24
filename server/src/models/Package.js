const mongoose = require('mongoose');

/**
 * Mongoose-схема Package.
 *
 * ВАЖНО: источник истины для схемы — этот файл, НЕ MASTER.md секция 7.3.
 * Схема приведена к реальности каталога Анны (g1orgi89/reader-bot):
 * - три валюты (priceUsd для Apple IAP, priceRub/priceByn — оригинал Анны)
 * - bookSlugs — список slug'ов для reference (оригинальные данные из JSON)
 * - books — массив ObjectId (заполняется seed'ом после вставки книг)
 * - добавлено coverImageUrl, packageSlug, purchaseUrl
 *
 * Пакет = набор книг со скидкой. Non-Consumable IAP.
 */
const packageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },

    // Обложка (аналогично Book)
    coverImageUrl: { type: String, default: '' },
    coverGradientColors: { type: [String], default: ['#1A0E08', '#3A2018'] },
    coverLabel: { type: String, default: '' },

    // Идентификатор для UTM/ссылок
    packageSlug: { type: String, default: '', index: true },

    // Книги пакета (заполняется seed'ом по bookSlugs)
    books: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
      },
    ],
    // Оригинальные slug'и книг из JSON Анны (для reference и повторного seed'а)
    bookSlugs: { type: [String], default: [] },

    // Ценообразование (три валюты; USD — для Apple IAP)
    priceUsd: { type: Number, default: null },
    priceRub: { type: Number, default: null },
    priceByn: { type: Number, default: null },

    // Apple IAP
    appleProductId: { type: String, default: null }, // 'package.{slug}'

    // Ссылка на покупку на внешнем сайте (anna-busel.com)
    purchaseUrl: { type: String, default: '' },

    isPublished: { type: Boolean, default: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

packageSchema.index({ isPublished: 1 });

module.exports = mongoose.model('Package', packageSchema);
