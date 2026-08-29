/**
 * Разовая чистка (29.08.2026): удалить тестовые аккаунты разработки.
 *
 * Список жёстко зашит — только test*@chitatel.app, заведённые при отладке
 * и записи видео для App Review. НЕ трогает: appreview*@ (нужны Apple при
 * каждом ревью), test-premium/basic/expired@ (Марина Л./Оля/Дарья — их
 * сообщениями наполнен чат клуба), админов и живых пользователей.
 *
 * Повторяет штатное удаление аккаунта (routes/auth.js DELETE /account):
 * личный контент под нож, PII обезличивается, сообщения чата остаются
 * анонимными, Purchase не трогаем (финансовые записи; их выручка уже
 * помечена sandbox отдельным скриптом).
 *
 * Запуск: node src/scripts/delete-test-users.js --dry-run   (посмотреть)
 *         node src/scripts/delete-test-users.js             (удалить)
 */
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const Quote = require('../models/Quote');
const WeeklyReport = require('../models/WeeklyReport');
const Progress = require('../models/Progress');

const EMAILS = [
  'test@chitatel.app',
  'test123@chitatel.app',
  'testuser@chitatel.app',
  'testapp@chitatel.app',
];

const dryRun = process.argv.includes('--dry-run');

(async () => {
  await mongoose.connect(config.mongoUri);

  const users = await User.find({ email: { $in: EMAILS }, isDeleted: false })
    .select('email name subscriptionStatus')
    .lean();

  if (users.length === 0) {
    console.log('Нечего удалять: тестовые аккаунты не найдены или уже удалены.');
    await mongoose.disconnect();
    return;
  }

  console.log('К удалению (' + users.length + '):');
  users.forEach((u) => console.log('  ' + u.email + ' — ' + u.name));

  if (dryRun) {
    console.log('\n--dry-run: ничего не изменено.');
    await mongoose.disconnect();
    return;
  }

  for (const u of users) {
    const userId = u._id;
    await Quote.deleteMany({ userId });
    await WeeklyReport.deleteMany({ userId });
    await Progress.deleteMany({ userId });
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isDeleted: true,
          deletionRequestedAt: new Date(),
          name: 'Удалённый аккаунт',
          avatarUrl: null,
          avatarStoragePath: null,
          passwordHash: null,
          pushToken: null,
          surveyAnswers: null,
          onboardingCompleted: false,
          country: null,
          city: null,
          marketingEmail: null,
          marketingConsent: false,
          aiConsent: false,
          blockedUsers: [],
          refreshTokens: [],
        },
        $unset: {
          email: '',
          appleUserId: '',
          googleUserId: '',
          referralCode: '',
          appleRefreshToken: '',
        },
      }
    );
    console.log('Удалён: ' + u.email);
  }

  console.log('\nГотово. Удалено: ' + users.length);
  await mongoose.disconnect();
})();
