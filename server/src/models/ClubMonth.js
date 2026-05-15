const mongoose = require('mongoose');

/**
 * Клуб месяца — главная сущность Фазы 4.
 *
 * Один месяц = одна книга. Каждое 1-е число стартует новый клуб,
 * предыдущий уходит в архив. Доступ к архивному клубу — 21 день
 * после endsAt для пользователей чья подписка истекла (см. MASTER 4.37).
 *
 * Связь с Book:
 * - bookId — ссылка на конкретный аудиоразбор (4 части)
 * - Book.isPartOfClub=true и Book.clubMonth='YYYY-MM' дают обратную связь
 *
 * Расписание открытия частей:
 * - partSchedule — массив дат открытия для каждой части (1..N)
 * - При запросе клуба фронтенд сравнивает с текущей датой и решает
 *   доступна часть или показывать «Откроется DD числа»
 *
 * Закреплённое сообщение (только Анна, 1 шт на клуб — см. AI-CONTEXT v5):
 * - pinnedMessageId — ссылка на ChatMessage с isPinned=true
 *
 * Параллельные клубы:
 * - Активный клуб определяется по isActive=true (выставляется cron-задачей
 *   ежедневно в 00:00) или фильтром startsAt <= now < endsAt
 * - В момент перехода с месяца на месяц предыдущий имеет archiveUntilDate
 *   в будущем — это используется в middleware requireSubscription для решения
 *   допускать ли истёкшую подписку к старому клубу
 */
const partScheduleSchema = new mongoose.Schema(
  {
    partNumber: { type: Number, required: true },
    opensAt: { type: Date, required: true },
  },
  { _id: false }
);

const clubMonthSchema = new mongoose.Schema(
  {
    // Идентификация месяца
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },

    // Книга разбора
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },

    // Дублирование данных из Book для скорости (denormalization).
    // Заполняется при создании клуба, обновляется если книга меняется.
    title: { type: String, required: true }, // 'Бегство от свободы'
    author: { type: String, default: '' },

    // Расписание клуба
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    archiveUntilDate: { type: Date, required: true }, // endsAt + 21 день

    // Расписание открытия частей (если пусто — все части доступны со старта)
    partSchedule: { type: [partScheduleSchema], default: [] },

    // Состояние
    isActive: { type: Boolean, default: false, index: true },

    // Статистика (обновляется триггерами в сервисах)
    participantCount: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },

    // Закреплённое сообщение (1 шт, может закрепить только Анна)
    pinnedMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Уникальная пара (month, year) — один клуб на один месяц.
clubMonthSchema.index({ year: 1, month: 1 }, { unique: true });

// Быстрый поиск активного клуба.
clubMonthSchema.index({ isActive: 1, startsAt: -1 });

// Для определения архивного доступа в middleware (4.2).
clubMonthSchema.index({ endsAt: 1, archiveUntilDate: 1 });

module.exports = mongoose.model('ClubMonth', clubMonthSchema);
