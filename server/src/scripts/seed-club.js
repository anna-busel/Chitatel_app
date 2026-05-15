/**
 * Seed-скрипт для тестовых данных клуба (задача 4.5 preparation).
 *
 * Использование:
 *   cd server
 *   npm run seed:club
 *
 * Что делает (идемпотентно):
 * 1. Создаёт/обновляет 4 тестовых юзера:
 *    - anna@chitatel.app (admin) — пароль anna123456
 *    - test-premium@chitatel.app (premium подписка до 2027-12-31) — пароль test123456
 *    - test-basic@chitatel.app (basic подписка до 2027-12-31) — пароль test123456
 *    - test-expired@chitatel.app (истёкшая 2 дня назад, видит только архив) — пароль test123456
 * 2. Создаёт 3 параллельных ClubMonth относительно сегодняшней даты:
 *    - ПРОШЛЫЙ: закончился 1 день назад, archiveUntilDate +20 дней (доступен expired)
 *    - ТЕКУЩИЙ: startsAt 5 дней назад, endsAt через 25 дней, isActive=true
 *    - БУДУЩИЙ: стартует через 25 дней
 * 3. Каждый клуб привязан к существующей книге из БД (берёт первые 3 платные).
 * 4. В текущем клубе:
 *    - 10 сообщений (текст, разные авторы, 2 reply, 1 закреп от Анны)
 *    - 2 Q&A: один отвечен Анной, второй pending
 *    - 1 жалоба pending (на одно из сообщений)
 *
 * Что НЕ делает:
 * - НЕ трогает книги/пакеты (это делает основной seed.js)
 * - НЕ удаляет ничего вне коллекций User/ClubMonth/ChatMessage/QAQuestion/Report
 *
 * Требования: основной `npm run seed` должен быть выполнен ранее (нужны книги).
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const Book = require('../models/Book');
const ClubMonth = require('../models/ClubMonth');
const ChatMessage = require('../models/ChatMessage');
const QAQuestion = require('../models/QAQuestion');
const Report = require('../models/Report');

const BCRYPT_ROUNDS = 12;

// --- Helpers ---

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function genReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

// --- Создание тестовых юзеров ---

async function upsertUser({ email, name, password, role, subscription }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();

  const update = {
    name,
    passwordHash,
    authProvider: 'email',
    role: role || 'user',
    isBanned: false,
    mutedUntil: null,
    isDeleted: false,
  };

  if (subscription) {
    update.subscriptionStatus = subscription.status;
    update.subscriptionPlan = subscription.plan || null;
    update.subscriptionExpiresAt = subscription.expiresAt || null;
  } else {
    update.subscriptionStatus = 'free';
    update.subscriptionPlan = null;
    update.subscriptionExpiresAt = null;
  }

  // upsert: ищем по email, обновляем поля; если нет — создаём с referralCode.
  const existing = await User.findOne({ email });
  if (existing) {
    Object.assign(existing, update);
    await existing.save();
    return existing;
  }

  const created = await User.create({
    email,
    referralCode: genReferralCode(),
    createdAt: now,
    ...update,
  });
  return created;
}

// --- Создание одного ClubMonth ---

async function upsertClubMonth({ month, year, book, startsAt, endsAt, isActive }) {
  const archiveUntilDate = new Date(endsAt);
  archiveUntilDate.setDate(archiveUntilDate.getDate() + 21);

  const update = {
    bookId: book._id,
    title: book.title,
    author: book.author,
    startsAt,
    endsAt,
    archiveUntilDate,
    isActive,
    participantCount: 0,
    messageCount: 0,
    partSchedule: [],
  };

  const existing = await ClubMonth.findOne({ year, month });
  if (existing) {
    Object.assign(existing, update);
    existing.pinnedMessageId = null; // сбросим — закреп проставим ниже после создания сообщений
    await existing.save();
    return existing;
  }

  return ClubMonth.create({ year, month, ...update });
}

// --- Заполнение чата текущего клуба ---

async function seedChatForCurrentClub(club, users) {
  const { anna, premium, basic } = users;

  // Очищаем старые сообщения этого клуба (идемпотентность).
  await ChatMessage.deleteMany({ clubMonthId: club._id });
  await QAQuestion.deleteMany({ clubMonthId: club._id });
  await Report.deleteMany({ clubMonthId: club._id });

  // Создаём сообщения с разбросом во времени (последние 4 дня).
  const baseTime = Date.now() - 4 * 24 * 60 * 60 * 1000;
  const minute = 60 * 1000;
  const hour = 60 * minute;

  // 1. Анна (закрепится позже)
  const m1 = await ChatMessage.create({
    clubMonthId: club._id,
    userId: anna._id,
    type: 'text',
    text:
      `Девочки, добро пожаловать в клуб ${club.title}! Стартуем сегодня. ` +
      'Первая часть уже открыта, расписание остальных в разделе Разборы. По пятницам отвечаю на ваши вопросы в Q&A.',
    createdAt: new Date(baseTime),
  });

  // 2. premium
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: premium._id,
    type: 'text',
    text: 'Анна, спасибо! Уже начала слушать первую часть, до мурашек.',
    createdAt: new Date(baseTime + 30 * minute),
  });

  // 3. basic reply на m1
  const m3 = await ChatMessage.create({
    clubMonthId: club._id,
    userId: basic._id,
    type: 'text',
    text: 'А во сколько по пятницам Q&A? Постараюсь подключиться.',
    replyToId: m1._id,
    createdAt: new Date(baseTime + 1 * hour),
  });

  // 4. Анна reply на m3
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: anna._id,
    type: 'text',
    text: 'Q&A не онлайн — пишите вопросы в раздел Q&A в любое время, отвечаю по пятницам утром.',
    replyToId: m3._id,
    createdAt: new Date(baseTime + 1 * hour + 15 * minute),
  });

  // 5. premium с mention Анны
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: premium._id,
    type: 'text',
    text: 'Поняла, спасибо! @Анна, у меня есть вопрос — запишу в Q&A.',
    mentions: [anna._id],
    createdAt: new Date(baseTime + 2 * hour),
  });

  // 6. basic
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: basic._id,
    type: 'text',
    text: 'Кто уже дослушал первую часть? Какие впечатления?',
    createdAt: new Date(baseTime + 1 * 24 * hour),
  });

  // 7. premium
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: premium._id,
    type: 'text',
    text:
      'Дослушала. Главное что зацепило — мысль про то что мы избегаем свободы потому что она требует ответственности.',
    createdAt: new Date(baseTime + 1 * 24 * hour + 30 * minute),
  });

  // 8. basic с реакциями
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: basic._id,
    type: 'text',
    text: 'Точно! У меня то же самое после первой части.',
    reactions: [
      { emoji: '🔥', userIds: [anna._id, premium._id] },
      { emoji: '❤️', userIds: [premium._id] },
    ],
    createdAt: new Date(baseTime + 1 * 24 * hour + 1 * hour),
  });

  // 9. premium с edit
  await ChatMessage.create({
    clubMonthId: club._id,
    userId: premium._id,
    type: 'text',
    text: 'Перечитала комментарий выше и теперь думаю что свобода это ещё и одиночество в каком-то смысле.',
    editedAt: new Date(baseTime + 2 * 24 * hour + 10 * minute),
    createdAt: new Date(baseTime + 2 * 24 * hour),
  });

  // 10. Спамное сообщение — на него будет жалоба
  const m10 = await ChatMessage.create({
    clubMonthId: club._id,
    userId: basic._id,
    type: 'text',
    text: 'спам спам спам купите курс по ссылке',
    reportCount: 1,
    createdAt: new Date(baseTime + 3 * 24 * hour),
  });

  // Закрепляем первое сообщение Анны.
  m1.isPinned = true;
  await m1.save();
  club.pinnedMessageId = m1._id;

  // Обновляем счётчики на клубе.
  const totalMessages = 10;
  club.messageCount = totalMessages;
  club.participantCount = 3;
  await club.save();

  // Q&A: один отвечен, один pending.
  await QAQuestion.create({
    clubMonthId: club._id,
    userId: premium._id,
    questionText:
      'Анна, как отличить здоровый страх свободы от невротического? И как понять что пора что-то менять?',
    answerText:
      'Хороший вопрос. Здоровый страх — когда мы понимаем риски и осознанно принимаем решение. ' +
      'Невротический — когда страх блокирует даже мысль о выборе. Если ловите себя на втором уже больше года — это сигнал.',
    answeredAt: new Date(baseTime + 2 * 24 * hour),
    answeredByUserId: anna._id,
    createdAt: new Date(baseTime + 1 * 24 * hour),
  });

  await QAQuestion.create({
    clubMonthId: club._id,
    userId: basic._id,
    questionText: 'А как читать эту книгу если ребёнок постоянно отвлекает? Когда находить время?',
    answerText: null,
    answeredAt: null,
    answeredByUserId: null,
    createdAt: new Date(baseTime + 2 * 24 * hour + 5 * hour),
  });

  // 1 жалоба на сообщение m10 от premium.
  await Report.create({
    reporterUserId: premium._id,
    targetType: 'message',
    targetId: m10._id,
    clubMonthId: club._id,
    reason: 'spam',
    comment: '',
    status: 'pending',
    createdAt: new Date(baseTime + 3 * 24 * hour + 30 * minute),
  });

  return { messageCount: totalMessages, qaCount: 2, reportCount: 1 };
}

// --- Сообщения для архивного клуба (read-only тест) ---

async function seedChatForArchiveClub(club, users) {
  const { anna, premium } = users;

  await ChatMessage.deleteMany({ clubMonthId: club._id });

  const baseTime = club.startsAt.getTime();
  const hour = 60 * 60 * 1000;

  await ChatMessage.create({
    clubMonthId: club._id,
    userId: anna._id,
    type: 'text',
    text: `Девочки, стартуем клуб ${club.title}. Хорошего вам месяца!`,
    createdAt: new Date(baseTime),
  });

  await ChatMessage.create({
    clubMonthId: club._id,
    userId: premium._id,
    type: 'text',
    text: 'Спасибо Анна! Уже приготовила любимый плед и чай.',
    createdAt: new Date(baseTime + 2 * hour),
  });

  await ChatMessage.create({
    clubMonthId: club._id,
    userId: premium._id,
    type: 'text',
    text: 'Спасибо за этот месяц, разбор зашёл прямо в сердце.',
    createdAt: new Date(club.endsAt.getTime() - 12 * hour),
  });

  club.messageCount = 3;
  club.participantCount = 2;
  await club.save();
}

// --- Основная функция ---

async function seed() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌱 Seed клуба ЧИТАТЕЛЬ (задача 4.5 prep)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log(`\n📡 Подключение к MongoDB: ${config.mongoUri}`);
  await mongoose.connect(config.mongoUri);
  console.log('✅ Подключено');

  // 1. Проверяем что в БД есть книги.
  const booksCount = await Book.countDocuments({ isPublished: true });
  if (booksCount < 3) {
    throw new Error(
      `В БД меньше 3 опубликованных книг (найдено: ${booksCount}). Сначала выполните 'npm run seed' для заливки каталога.`
    );
  }
  console.log(`\n📚 Книг в БД: ${booksCount}`);

  // Берём первые 3 платные книги для 3 клубов.
  const books = await Book.find({ isPublished: true, isFree: false })
    .sort({ createdAt: 1 })
    .limit(3)
    .lean();
  if (books.length < 3) {
    throw new Error(`Нужно минимум 3 платные книги для трёх клубов (найдено: ${books.length}).`);
  }
  console.log('📖 Будут использованы для клубов:');
  for (const b of books) console.log(`   - ${b.title} (${b.author})`);

  // 2. Создаём 4 юзера.
  console.log('\n👥 Создание тестовых юзеров...');
  const anna = await upsertUser({
    email: 'anna@chitatel.app',
    name: 'Анна Бусел',
    password: 'anna123456',
    role: 'admin',
  });
  console.log(`   ✅ ${anna.email} (admin)`);

  const premium = await upsertUser({
    email: 'test-premium@chitatel.app',
    name: 'Премиум Тестер',
    password: 'test123456',
    subscription: {
      status: 'premium',
      plan: 'annual',
      expiresAt: new Date('2027-12-31T23:59:59Z'),
    },
  });
  console.log(`   ✅ ${premium.email} (premium до 2027-12-31)`);

  const basic = await upsertUser({
    email: 'test-basic@chitatel.app',
    name: 'Базовый Тестер',
    password: 'test123456',
    subscription: {
      status: 'basic',
      plan: 'monthly',
      expiresAt: new Date('2027-12-31T23:59:59Z'),
    },
  });
  console.log(`   ✅ ${basic.email} (basic до 2027-12-31)`);

  const expired = await upsertUser({
    email: 'test-expired@chitatel.app',
    name: 'Истёкший Тестер',
    password: 'test123456',
    subscription: {
      status: 'expired',
      plan: 'monthly',
      expiresAt: daysFromNow(-2),
    },
  });
  console.log(`   ✅ ${expired.email} (expired 2 дня назад — видит архив 21 день)`);

  // 3. Создаём 3 ClubMonth относительно сегодня.
  console.log('\n🗓 Создание 3 параллельных клубов...');
  const now = new Date();

  // Прошлый клуб: endsAt = 1 день назад, archiveUntilDate = +20 дней от сегодня
  const archiveStarts = daysFromNow(-31);
  const archiveEnds = daysFromNow(-1);
  const archiveClub = await upsertClubMonth({
    month: archiveStarts.getMonth() + 1,
    year: archiveStarts.getFullYear(),
    book: books[0],
    startsAt: archiveStarts,
    endsAt: archiveEnds,
    isActive: false,
  });
  console.log(
    `   ✅ Прошлый: "${archiveClub.title}" (закончился вчера, архив до ${archiveClub.archiveUntilDate.toLocaleDateString('ru-RU')})`
  );

  // Текущий клуб: startsAt = 5 дней назад, endsAt = +25 дней
  const currentStarts = daysFromNow(-5);
  const currentEnds = daysFromNow(25);
  const currentClub = await upsertClubMonth({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    book: books[1],
    startsAt: currentStarts,
    endsAt: currentEnds,
    isActive: true,
  });
  console.log(
    `   ✅ Текущий: "${currentClub.title}" (активен ${currentStarts.toLocaleDateString('ru-RU')} — ${currentEnds.toLocaleDateString('ru-RU')})`
  );

  // Будущий клуб: startsAt = +25 дней
  const futureStarts = daysFromNow(25);
  const futureEnds = daysFromNow(55);
  const futureClub = await upsertClubMonth({
    month: futureStarts.getMonth() + 1,
    year: futureStarts.getFullYear(),
    book: books[2],
    startsAt: futureStarts,
    endsAt: futureEnds,
    isActive: false,
  });
  console.log(
    `   ✅ Будущий: "${futureClub.title}" (стартует ${futureStarts.toLocaleDateString('ru-RU')})`
  );

  // 4. Сообщения, Q&A, жалобы в текущем клубе.
  console.log('\n💬 Создание сообщений в текущем клубе...');
  const currentStats = await seedChatForCurrentClub(currentClub, { anna, premium, basic });
  console.log(
    `   ✅ ${currentStats.messageCount} сообщений (1 закреп от Анны, 2 reply, 1 mention, 1 edited), ${currentStats.qaCount} Q&A, ${currentStats.reportCount} жалоба`
  );

  console.log('\n💬 Создание сообщений в прошлом (архивном) клубе...');
  await seedChatForArchiveClub(archiveClub, { anna, premium });
  console.log('   ✅ 3 сообщения (для проверки read-only режима)');

  // 5. Итог.
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Создано:');
  console.log('   Юзеры:');
  console.log('     anna@chitatel.app          / anna123456  (admin)');
  console.log('     test-premium@chitatel.app  / test123456  (premium)');
  console.log('     test-basic@chitatel.app    / test123456  (basic)');
  console.log('     test-expired@chitatel.app  / test123456  (expired, видит архив)');
  console.log('   Клубы:');
  console.log(`     Прошлый  (archive до ${archiveClub.archiveUntilDate.toLocaleDateString('ru-RU')})`);
  console.log(`     Текущий  (активный)`);
  console.log(`     Будущий  (откроется через 25 дней)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
  console.log('\n👋 Отключено от MongoDB');
}

seed()
  .then(() => {
    console.log('\n✅ Seed клуба завершён успешно');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed клуба упал:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
