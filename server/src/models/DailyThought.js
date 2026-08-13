const mongoose = require('mongoose');

/**
 * Мысль дня — фраза для карточки на главной (routes/home.js) и ежедневного
 * push (jobs/push-scheduler.js).
 *
 * ИСТОРИЯ: изначально список жил статикой в config/daily-thoughts.js. Задача
 * 6.6 (админка) перенесла его в БД, чтобы Анна могла добавлять/править/убирать
 * фразы без пересборки и перезапуска сервера. Ротация осталась прежней —
 * детерминированная по дню (МСК), по кругу через все активные фразы (см.
 * services/thought.service.js). config/daily-thoughts.js сохранён как СИД и
 * фолбэк: если коллекция пуста, показывается статический список.
 *
 * Поля:
 * - text     — сама фраза (обязательно);
 * - author   — автор подписи. По умолчанию «Анна Бусел» (её высказывания);
 *              для чужих цитат (напр. Ницше) указывается явно;
 * - order    — порядок в ротации (по возрастанию). При добавлении новой
 *              фразы обычно = максимум+1;
 * - isActive — выключенные фразы не участвуют в ротации (мягкое скрытие вместо
 *              удаления).
 */
const dailyThoughtSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    author: { type: String, default: 'Анна Бусел', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Ротация читает активные фразы в стабильном порядке (order, затем _id).
dailyThoughtSchema.index({ isActive: 1, order: 1 });

module.exports = mongoose.model('DailyThought', dailyThoughtSchema);
