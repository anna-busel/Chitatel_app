/**
 * Одноразовый БЕЗОПАСНЫЙ бэкфилл поля user.clubMonthsEntitled.
 *
 * Использование:
 *   cd server
 *   node src/scripts/backfill-club-entitlements.js
 *
 * Зачем: 30.07.2026 доступ к клубу перешёл с ВЫЧИСЛЯЕМОГО набора оплаченных
 * месяцев (из subscriptionExpiresAt) на ХРАНИМЫЙ (user.clubMonthsEntitled),
 * который пополняется в purchase.service при каждой транзакции. У подписчиков,
 * оформившихся ДО этого перехода, поле пустое → без бэкфилла они потеряли бы
 * доступ к текущему клубу до следующего продления. Скрипт засевает им набор,
 * вычислив его из текущих subscriptionExpiresAt + subscriptionPlan (та же
 * формула, что была в рантайме до перехода — coveredClubMonthKeys).
 *
 * Что делает: у КАЖДОГО пользователя с непустым subscriptionExpiresAt
 * добавляет вычисленные ключи месяцев в clubMonthsEntitled (без дублей, только
 * добавляет — ничего не удаляет). Идемпотентно: повторный запуск безопасен.
 *
 * Что НЕ трогает: сами подписки, покупки, прогресс, чат, клубы.
 * Запускать ОДИН раз сразу после деплоя этой правки.
 */

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const { coveredClubMonthKeys } = require('../middleware/subscription');

async function run() {
  console.log('=== Бэкфилл clubMonthsEntitled (только добавляет, безопасно) ===');
  await mongoose.connect(config.mongoUri);

  const users = await User.find({
    subscriptionExpiresAt: { $ne: null },
  }).select('subscriptionExpiresAt subscriptionPlan clubMonthsEntitled subscriptionStatus');

  if (users.length === 0) {
    console.log('Пользователей с подпиской не найдено — нечего засевать.');
    await mongoose.disconnect();
    return;
  }

  let touched = 0;
  for (const u of users) {
    const derived = coveredClubMonthKeys(u.subscriptionExpiresAt, u.subscriptionPlan);
    if (derived.length === 0) continue;

    const existing = Array.isArray(u.clubMonthsEntitled) ? u.clubMonthsEntitled : [];
    const set = new Set(existing);
    let added = 0;
    for (const k of derived) {
      if (!set.has(k)) {
        set.add(k);
        added += 1;
      }
    }
    if (added > 0) {
      u.clubMonthsEntitled = Array.from(set);
      await u.save();
      touched += 1;
      console.log(
        `${u._id} (${u.subscriptionStatus}/${u.subscriptionPlan || '—'}): ` +
          `+${added} → [${u.clubMonthsEntitled.join(', ')}]`
      );
    }
  }

  console.log(`Готово. Обновлено пользователей: ${touched} из ${users.length}.`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
