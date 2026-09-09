/**
 * Разовая миграция (09.09.2026, задача C1 ANDROID-PLAN): перенести
 * существующие APNs-токены из устаревшего User.pushToken в список
 * User.devices [{token, platform, updatedAt}].
 *
 * Зачем: одно поле хранило один токен без платформы. Под Android нужен и
 * второй токен, и знание, куда его слать — APNs или FCM.
 *
 * ⚠️ Скрипт НИЧЕГО НЕ УДАЛЯЕТ: pushToken остаётся на месте. push.service
 * читает его как запасной источник, поэтому пуши на iPhone работают в любой
 * момент — и до миграции, и после, и если код откатят назад. Порядок деплоя
 * значения не имеет.
 *
 * Идемпотентен: если такой токен уже записан в devices, пользователь
 * пропускается. Можно запускать повторно.
 *
 * Запуск (ОБЯЗАТЕЛЬНО из папки server — там лежит .env):
 *   cd server && node src/scripts/migrate-push-devices.js --dry-run
 *   cd server && node src/scripts/migrate-push-devices.js
 */
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  await mongoose.connect(config.mongoUri);

  const candidates = await User.find({
    pushToken: { $exists: true, $nin: [null, ''] },
  })
    .select('email pushToken devices')
    .lean();

  console.log('Пользователей с устаревшим pushToken: ' + candidates.length);

  const toMigrate = candidates.filter((u) => {
    const devices = Array.isArray(u.devices) ? u.devices : [];
    return !devices.some((d) => d && d.token === u.pushToken);
  });

  console.log('Из них токен ещё не перенесён: ' + toMigrate.length);
  for (const user of toMigrate) {
    console.log(
      '  ' + (user.email || String(user._id)) + '  ' + user.pushToken.slice(0, 12) + '…'
    );
  }

  if (dryRun) {
    console.log('\n--dry-run: ничего не изменено.');
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  const now = new Date();
  for (const user of toMigrate) {
    // eslint-disable-next-line no-await-in-loop
    const res = await User.updateOne(
      { _id: user._id, 'devices.token': { $ne: user.pushToken } },
      {
        $push: {
          devices: { token: user.pushToken, platform: 'ios', updatedAt: now },
        },
      }
    );
    const modified = res.modifiedCount != null ? res.modifiedCount : res.nModified;
    if (modified) migrated += 1;
  }

  console.log('\nПеренесено токенов в devices: ' + migrated);
  console.log('Поле pushToken НЕ удалялось — это страховка, см. шапку файла.');

  await mongoose.disconnect();
})();
