const mongoose = require('mongoose');

/**
 * Настройки CRM — один документ (CRM-PLAN §2, задача A7).
 *
 * key всегда 'main' (уникальный) — так документ один и upsert идемпотентен.
 * Начальные значения ставит crm/services/settings.service.ensureCrmSettings()
 * при старте сервера. Экрана настроек пока нет (блок M) — значения правятся
 * разработчиком по просьбе команды.
 *
 * rates — курс к BYN (сколько BYN за 1 единицу валюты); null = не задан.
 */
const crmSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main' },
    // «Анна подтверждает переводы».
    requireTransferConfirm: { type: Boolean, default: false },
    // Карты/счета для переводов: 'Карта Анны · BYN'.
    accounts: { type: [String], default: [] },
    rates: {
      USD: { type: Number, default: null },
      RUB: { type: Number, default: null },
      EUR: { type: Number, default: null },
      GEL: { type: Number, default: null },
    },
    storeFeePct: { type: Number, default: 15 },
    senderEmail: { type: String, default: null },
    balanceReminder: {
      monthlyDay: { type: Number, default: null },
      daysBeforeClub: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

crmSettingsSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('CrmSettings', crmSettingsSchema);
