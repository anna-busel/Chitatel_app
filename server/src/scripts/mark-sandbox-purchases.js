/**
 * Разовая миграция (26.08.2026): пометить ВСЕ существующие покупки как
 * sandbox — до этой даты реальных продаж не было (сверено с App Store
 * Connect → Продажи и тренды), вся накопленная «выручка» в админке была
 * песочницей: тесты разработчика, TestFlight, ревьюеры Apple.
 *
 * После миграции аналитика (admin-analytics) считает только записи без
 * пометки sandbox, а новые покупки получают окружение автоматически при
 * верификации (purchase.service, поле tx.environment).
 *
 * ⚠️ Запускать ОДИН раз при деплое этой правки. Повторный запуск пометит
 * sandbox'ом и покупки, сделанные после деплоя без пометки, — таких быть
 * не должно, но осторожность не помешает: скрипт трогает только документы
 * БЕЗ поля environment.
 *
 * Запуск: node src/scripts/mark-sandbox-purchases.js
 *         node src/scripts/mark-sandbox-purchases.js --dry-run  (только показать)
 */
const mongoose = require('mongoose');
const config = require('../config');
const Purchase = require('../models/Purchase');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  await mongoose.connect(config.mongoUri);

  const filter = { environment: { $exists: false } };
  const candidates = await Purchase.find(filter)
    .select('appleProductId priceUsd purchasedAt platform')
    .lean();

  console.log('Покупок без пометки окружения: ' + candidates.length);
  let sum = 0;
  for (const p of candidates) {
    sum += p.priceUsd || 0;
    console.log(
      '  ' +
        (p.appleProductId || p.platform) +
        '  $' +
        (p.priceUsd != null ? p.priceUsd : '—') +
        '  ' +
        (p.purchasedAt ? p.purchasedAt.toISOString().slice(0, 10) : '—')
    );
  }
  console.log('Суммарно уйдёт из «выручки»: $' + sum.toFixed(2));

  if (dryRun) {
    console.log('\n--dry-run: ничего не изменено.');
  } else {
    const res = await Purchase.updateMany(filter, {
      $set: { environment: 'sandbox' },
    });
    console.log('\nПомечено sandbox: ' + res.modifiedCount);
  }

  await mongoose.disconnect();
})();
