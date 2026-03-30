const mongoose = require('mongoose');

/**
 * Mongoose-схема Package.
 * Источник: MASTER.md секция 7.3
 *
 * Пакет = набор книг со скидкой. Non-Consumable IAP.
 */
const packageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    theme: { type: String, required: true }, // 'Отношения', 'Саморазвитие'
    description: { type: String, default: '' },
    books: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Book',
      },
    ],
    price: { type: Number, required: true }, // USD
    originalPrice: { type: Number, required: true }, // USD (без скидки)
    discountPercent: { type: Number, default: 0 },
    appleProductId: { type: String, required: true }, // 'package.{id}'
    isPublished: { type: Boolean, default: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

packageSchema.index({ isPublished: 1 });

module.exports = mongoose.model('Package', packageSchema);
