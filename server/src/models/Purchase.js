const mongoose = require('mongoose');

/**
 * Mongoose-схема Purchase — запись о покупке через Apple IAP.
 *
 * Источник истины — этот файл (как и в Book.js; см. AI-CONTEXT → расхождения
 * с MASTER.md). Базируется на MASTER 7.3 (Purchase) + 6.3 (StoreKit 2).
 *
 * Покрывает оба вида покупок:
 *   - подписка «Клуб» (auto-renewable): itemType='subscription', есть expiresAt,
 *     status меняется по S2S-уведомлениям Apple (renew/expire/refund);
 *   - разовые (non-consumable): отдельный разбор (book), пакет (package),
 *     вечный доступ к архиву (archive) — без expiresAt, status='active' постоянно.
 *
 * Модель PRODUCT-AGNOSTIC: appleProductId хранится как есть. Маппинг
 * productId → тариф/право доступа живёт в сервисе верификации, поэтому смена
 * состава тарифов (добавить премиум, сменить периоды) не требует менять схему.
 *
 * Задача 3.3 (Фаза 3 — Платежи): серверная верификация транзакций Apple
 * и обновление прав пользователя.
 */
const purchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Что куплено
    itemType: {
      type: String,
      enum: ['book', 'package', 'subscription', 'archive'],
      required: true,
    },
    // book_id / package_id (строкой) — для разовых покупок;
    // план подписки ('monthly' | 'season' | ...) — для subscription;
    // для archive.forever — null.
    itemId: { type: String, default: null },

    // Платёжная платформа. На старте только Apple; google/web — задел на будущее.
    platform: {
      type: String,
      enum: ['apple', 'google', 'web'],
      default: 'apple',
    },

    // Apple originalTransactionId — стабильный идентификатор покупки/подписки
    // (через renew остаётся тем же). Уникален, чтобы повторная верификация
    // того же чека обновляла запись, а не плодила дубликаты.
    transactionId: { type: String, index: true, unique: true, sparse: true },
    appleProductId: { type: String, default: null },

    priceUsd: { type: Number, default: null },

    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // только для подписок

    status: {
      type: String,
      enum: ['active', 'expired', 'refunded', 'cancelled'],
      default: 'active',
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Поиск покупок/активной подписки пользователя по типу и статусу.
purchaseSchema.index({ userId: 1, itemType: 1, status: 1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
