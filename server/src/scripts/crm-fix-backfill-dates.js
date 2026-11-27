/**
 * Даты перенесённых заказов (CRM-PLAN C3, правка 27.11.2026).
 *
 * Перенос 27.11 (crm-backfill-store.js) поставил заказам дату переноса вместо
 * даты покупки. Скрипт ставит дату покупки: оплата App Store / Google Play —
 * дата оплаты в заказе, ручная выдача — дата выдачи в админке. Повторный
 * запуск ничего не меняет. Доступы и суммы не трогает.
 *
 * Использование (на сервере):
 *   cd server && node src/scripts/crm-fix-backfill-dates.js            # сухой прогон
 *   cd server && node src/scripts/crm-fix-backfill-dates.js --apply    # запись
 */
const mongoose = require('mongoose');
const config = require('../config');
const { fixBackfillDates } = require('../crm/services/store-ingest.service');

async function run() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(config.mongoUri);

  const s = await fixBackfillDates({ apply });

  console.log(`=== Даты перенесённых заказов (${apply ? 'ЗАПИСЬ' : 'сухой прогон, запись — с --apply'}) ===`);
  console.log(`Заказов с покупкой: ${s.total}`);
  console.log(`${apply ? 'Исправлено' : 'Будет исправлено'}: ${s.fixed}`);
  console.log(`Дата уже верная: ${s.ok}`);
  console.log(`Нет даты покупки: ${s.noDate}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
