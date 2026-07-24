const mongoose = require('mongoose');

/**
 * Прогресс прослушивания аудиоразбора.
 *
 * Одна запись на пару (userId, bookId) — обновляется upsert'ом
 * каждые 30 секунд во время воспроизведения (задача 2.7).
 *
 * Используется:
 * - На экране книги (4.14 купленная) — карточка прогресса с прогресс-баром
 * - В списке частей — галочка ✅ на прослушанных частях
 * - В плеере — автоматическая перемотка на сохранённую позицию при открытии
 * - В Профиле → «Мой прогресс» (4.45) — общая статистика (Фаза 6)
 */
const progressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
      index: true,
    },

    // Текущая часть на которой остановился юзер (1-based номер).
    currentPartNumber: { type: Number, default: 1 },

    // Позиция в текущей части (секунды от начала).
    positionSeconds: { type: Number, default: 0 },

    // Прослушанные части (массив номеров) — для галочек в UI.
    listenedPartNumbers: { type: [Number], default: [] },

    // Сколько секунд всего прослушано по этой книге (для статистики).
    totalListenedSeconds: { type: Number, default: 0 },

    // Максимально дошедшая позиция по каждой части (номер части → секунды).
    // По ней считается прирост totalListenedSeconds: добавляем только НОВУЮ
    // пройденную «землю», а не разницу с последней позицией. Иначе
    // переслушивание уже пройденного накручивало бы «всего прослушано».
    maxPositionByPart: { type: Map, of: Number, default: {} },

    // Когда юзер слушал в последний раз.
    lastListenedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Уникальная пара userId+bookId — один прогресс на одну книгу у юзера.
progressSchema.index({ userId: 1, bookId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
