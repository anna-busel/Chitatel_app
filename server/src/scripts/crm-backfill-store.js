/**
 * Перенос прошлых покупок в CRM (CRM-PLAN C3, 13.11.2026).
 *
 *   - Purchase platform apple|google (кроме environment 'sandbox') → заказы
 *     App Store / Google Play («Оплачен», возвраты — «Возврат»), тем же
 *     ingestStorePurchase, что и новые покупки (C1);
 *   - Purchase platform 'web' (ручные выдачи админки) → заказы source 'admin',
 *     status 'free'; записи, созданные самой CRM (transactionId crm-…), пропускаются.
 *
 * Идемпотентный: покупка, по которой уже есть заказ (purchaseId), пропускается.
 * Доступы по покупкам стора НЕ меняет. Если клиентка CRM находится по почте и
 * ещё не связана с аккаунтом — связывает и выдаёт оплаченное на сайте, как при входе (B5).
 *
 * Использование (на сервере):
 *   cd server && node src/scripts/crm-backfill-store.js            # сухой прогон
 *   cd server && node src/scripts/crm-backfill-store.js --apply    # запись
 */
const mongoose = require('mongoose');
const config = require('../config');
const { backfillStorePurchases } = require('../crm/services/store-ingest.service');

async function run() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(config.mongoUri);

  const s = await backfillStorePurchases({ apply });

  console.log(`=== Перенос покупок в CRM (${apply ? 'ЗАПИСЬ' : 'сухой прогон, запись — с --apply'}) ===`);
  console.log(`Покупок просмотрено: ${s.total}`);
  console.log(`${apply ? 'Создано' : 'Будет создано'} заказов App Store / Google Play: ${s.store}`);
  console.log(`${apply ? 'Создано' : 'Будет создано'} заказов «ручная выдача» (admin, free): ${s.admin}`);
  console.log(`Уже есть в CRM: ${s.exists}`);
  console.log(`Пропущено sandbox: ${s.sandbox}`);
  console.log(`Пропущено записей самой CRM: ${s.crm}`);
  console.log(`Нет пользователя: ${s.noUser}`);
  if (s.errors) {console.log(`Ошибок (см. лог): ${s.errors}`);}

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Ошибка переноса:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
