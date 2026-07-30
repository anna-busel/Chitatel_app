/**
 * Одноразовый БЕЗОПАСНЫЙ бэкфилл поля user.clubMonthsEntitled + ДИАГНОСТИКА.
 *
 * Использование:
 *   cd server
 *   node src/scripts/backfill-club-entitlements.js
 *
 * Зачем: 30.07.2026 доступ к клубу перешёл с ВЫЧИСЛЯЕМОГО набора оплаченных
 * месяцев (из subscriptionExpiresAt) на ХРАНИМЫЙ (user.clubMonthsEntitled),
 * который пополняется в purchase.service при каждой транзакции. У подписчиков,
 * ставших активными через seed или оплативших ДО этого перехода, поле пустое →
 * после деплоя они видят пейвол, хотя подписка активна. Скрипт засевает набор.
 *
 * Что добавляет каждому пользователю:
 *   1) ключ ТЕКУЩЕГО клуба (по окну дат сейчас) — ТОЛЬКО если подписка активна
 *      (basic/premium и не истекла ЛИБО grace). Это гарантирует авто-вход в
 *      текущий клуб после оплаты, не завися от точности дат Apple.
 *   2) ключи, ВЫЧИСЛЕННЫЕ из subscriptionExpiresAt + плана (coveredClubMonthKeys)
 *      — для тех, у кого есть expiresAt (покрывает будущие месяцы сезона).
 * Union добавляется в clubMonthsEntitled (без дублей, только добавляет).
 * Идемпотентно: повторный запуск безопасен.
 *
 * Также ПЕЧАТАЕТ диагностику: текущий клуб и по каждому подписчику его набор
 * до/после — по выводу видно, почему был пейвол и что стало.
 *
 * Что НЕ трогает: сами подписки, покупки, прогресс, чат, клубы.
 * Запускать ОДИН раз сразу после деплоя этой правки.
 */

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const {
  coveredClubMonthKeys,
  clubMonthKey,
} = require('../middleware/subscription');

function iso(d) {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

async function run() {
  console.log('=== Бэкфилл clubMonthsEntitled + диагностика (безопасно) ===');
  await mongoose.connect(config.mongoUri);

  const now = new Date();
  console.log(`Сейчас (сервер): ${iso(now)}`);

  // Текущий клуб по окну дат.
  const currentClub = await ClubMonth.findOne({
    startsAt: { $lte: now },
    endsAt: { $gte: now },
  })
    .sort({ startsAt: -1 })
    .lean();

  // Печатаем ВСЕ клубы для наглядности.
  const allClubs = await ClubMonth.find({}).sort({ year: 1, month: 1 }).lean();
  console.log(`\nКлубы (${allClubs.length}):`);
  for (const c of allClubs) {
    const cur = currentClub && String(c._id) === String(currentClub._id) ? '  [ТЕКУЩИЙ]' : '';
    console.log(
      `  ${clubMonthKey(c)}  ${iso(c.startsAt)} → ${iso(c.endsAt)}${cur}`
    );
  }
  const currentKey = currentClub ? clubMonthKey(currentClub) : null;
  console.log(`\nКлюч текущего клуба: ${currentKey || 'НЕТ ТЕКУЩЕГО КЛУБА'}\n`);

  const users = await User.find({
    $or: [
      { subscriptionExpiresAt: { $ne: null } },
      { subscriptionStatus: { $in: ['basic', 'premium'] } },
    ],
  }).select(
    'email subscriptionStatus subscriptionPlan subscriptionExpiresAt gracePeriodExpiresAt clubMonthsEntitled'
  );

  if (users.length === 0) {
    console.log('Подписчиков не найдено — нечего засевать.');
    await mongoose.disconnect();
    return;
  }

  let touched = 0;
  for (const u of users) {
    const isInGrace = u.gracePeriodExpiresAt && u.gracePeriodExpiresAt > now;
    const isActive =
      (u.subscriptionStatus === 'basic' || u.subscriptionStatus === 'premium') &&
      ((u.subscriptionExpiresAt && u.subscriptionExpiresAt > now) || isInGrace);

    const existing = Array.isArray(u.clubMonthsEntitled) ? u.clubMonthsEntitled : [];
    const set = new Set(existing);

    // 1) Текущий клуб — только активным.
    if (isActive && currentKey) set.add(currentKey);
    // 2) Вычисленные из expiresAt (покрывает сезоны/прошлые месяцы).
    for (const k of coveredClubMonthKeys(u.subscriptionExpiresAt, u.subscriptionPlan)) {
      set.add(k);
    }

    const before = existing.slice().sort();
    const after = Array.from(set).sort();
    const changed = after.length !== before.length;

    console.log(
      `${u.email || u._id} [${u.subscriptionStatus}/${u.subscriptionPlan || '—'}` +
        `, exp ${iso(u.subscriptionExpiresAt)}${isActive ? ', активна' : ''}]\n` +
        `   было:  [${before.join(', ')}]\n` +
        `   стало: [${after.join(', ')}]${changed ? '  ← обновлено' : ''}`
    );

    if (changed) {
      u.clubMonthsEntitled = after;
      await u.save();
      touched += 1;
    }
  }

  console.log(`\nГотово. Обновлено пользователей: ${touched} из ${users.length}.`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Ошибка:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
