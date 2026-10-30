const CrmSettings = require('../models/CrmSettings');

/**
 * Начальные настройки CRM (CRM-PLAN A7).
 *
 * ensureCrmSettings() вызывается при старте сервера (server.js). Идемпотентна:
 * $setOnInsert срабатывает только при создании документа, уже заданные
 * значения не перезаписываются.
 *
 * Значения по умолчанию:
 * - «Анна подтверждает переводы» — выкл;
 * - карты для переводов — пусто (команда пришлёт список, впишу вручную);
 * - курсы валют к BYN — не заданы (null), до экрана настроек (блок M)
 *   правятся вручную.
 */
const DEFAULTS = Object.freeze({
  requireTransferConfirm: false,
  accounts: [],
  rates: { USD: null, RUB: null, EUR: null, GEL: null },
  storeFeePct: 15,
  senderEmail: null,
  balanceReminder: { monthlyDay: null, daysBeforeClub: null },
});

const ensureCrmSettings = () =>
  CrmSettings.findOneAndUpdate(
    { key: 'main' },
    { $setOnInsert: { key: 'main', ...DEFAULTS } },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  ).lean();

const getCrmSettings = async () => {
  const doc = await CrmSettings.findOne({ key: 'main' }).lean();
  return doc || ensureCrmSettings();
};

module.exports = { DEFAULTS, ensureCrmSettings, getCrmSettings };
