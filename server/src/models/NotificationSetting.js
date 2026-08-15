const mongoose = require('mongoose');

/**
 * Настройка отдельного типа уведомления (задача 6.6, редактор уведомлений).
 *
 * Раньше заголовки/тексты системных пушей были зашиты в коде (jobs/*,
 * services/ai.service). Вынесены в БД, чтобы Анна из админки могла менять текст,
 * включать/выключать тип, а для типов с расписанием — задавать время. Один
 * документ на тип (singleton по `type`). Отсутствие документа = используются
 * дефолты из notification-setting.service (поэтому существующее поведение не
 * ломается, пока Анна ничего не трогала).
 *
 * Напоминание «Запишите цитату» здесь НЕ живёт — у него свой ReminderSetting и
 * свой редактор (не дублируем).
 *
 * Поля:
 * - type    — идентификатор типа ('daily_quote', 'ai_ready', ...), уникальный;
 * - title   — заголовок пуша;
 * - body    — текст пуша (для типов, где тело статично; у daily_quote тело —
 *             сама мысль дня и не редактируется);
 * - enabled — глобальный тумблер «слать всем / не слать вообще»;
 * - hour    — час отправки (только для типов с расписанием, напр. daily_quote);
 * - minute  — минута отправки (только для типов с расписанием).
 */
const notificationSettingSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true },
    title: { type: String, default: '', trim: true },
    body: { type: String, default: '', trim: true },
    enabled: { type: Boolean, default: true },
    hour: { type: Number, default: 10, min: 0, max: 23 },
    minute: { type: Number, default: 0, min: 0, max: 59 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('NotificationSetting', notificationSettingSchema);
