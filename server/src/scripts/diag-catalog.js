/**
 * ЧИСТО ДИАГНОСТИКА (только чтение, ничего не пишет).
 * Отвечает: почему Идиот разблокирован, почему Дар не виден, у кого нет аудио.
 *   cd server && node src/scripts/diag-catalog.js
 */
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');
const Package = require('../models/Package');
const ClubMonth = require('../models/ClubMonth');
const User = require('../models/User');

function mask(e) {
  if (!e) return '(нет email)';
  const [a, b] = e.split('@');
  return a.slice(0, 2) + '***@' + (b || '');
}

async function run() {
  await mongoose.connect(config.mongoUri);

  console.log('=== КАТАЛОГ: сводка ===');
  const total = await Book.countDocuments({});
  const pub = await Book.countDocuments({ isPublished: true });
  const pubFree = await Book.countDocuments({ isPublished: true, isFree: true });
  const pubPaid = await Book.countDocuments({ isPublished: true, isFree: false });
  console.log(`Книг всего: ${total} | опубликовано: ${pub} (платных ${pubPaid}, бесплатных ${pubFree})`);

  console.log('\n=== ОПУБЛИКОВАННЫЕ БЕЗ АУДИО (parts=0) — «не дозагрузили» ===');
  const noAudio = await Book.find({
    isPublished: true,
    $or: [{ parts: { $size: 0 } }, { parts: { $exists: false } }],
  }).select('bookSlug title isFree').lean();
  if (!noAudio.length) console.log('  нет — у всех опубликованных есть части');
  else noAudio.forEach((b) => console.log(`  ${b.bookSlug} — ${b.title}${b.isFree ? ' (бесплатный)' : ''}`));

  console.log('\n=== ДАР ===');
  const dar = await Book.findOne({ bookSlug: 'dar' })
    .select('title isPublished isFree parts appleProductId').lean();
  if (!dar) console.log('  НЕТ в базе (bookSlug=dar не найден) → значит npm run seed не запускали после добавления Дара');
  else console.log(`  title=${dar.title} | isPublished=${dar.isPublished} | isFree=${dar.isFree} | частей=${(dar.parts || []).length} | ${dar.appleProductId}`);

  console.log('\n=== ИДИОТ: почему разблокирован ===');
  const idiot = await Book.findOne({ bookSlug: 'idiot' })
    .select('title isPublished isFree isPartOfClub parts').lean();
  if (!idiot) {
    console.log('  НЕТ в базе');
  } else {
    console.log(`  title=${idiot.title} | isFree=${idiot.isFree} | isPartOfClub=${idiot.isPartOfClub} | частей=${(idiot.parts || []).length}`);
    const pkgs = await Package.find({ books: idiot._id }).select('title packageSlug isPublished').lean();
    console.log(`  входит в пакеты: ${pkgs.length ? pkgs.map((p) => p.title + (p.isPublished ? '' : ' (не опубл.)')).join('; ') : 'нет'}`);
    const clubs = await ClubMonth.find({ bookId: idiot._id }).select('month year').lean();
    console.log(`  клубные месяцы (подписка откроет): ${clubs.length ? clubs.map((c) => `${c.month}/${c.year}`).join(', ') : 'нет'}`);
    const buyers = await User.find({ purchasedBooks: idiot._id }).select('email').lean();
    console.log(`  купили Идиота отдельно: ${buyers.length ? buyers.map((u) => mask(u.email)).join(', ') : 'никто'}`);
    const pkgIds = pkgs.map((p) => p._id);
    const pkgBuyers = pkgIds.length
      ? await User.find({ purchasedPackages: { $in: pkgIds } }).select('email').lean()
      : [];
    console.log(`  имеют пакет с Идиотом: ${pkgBuyers.length ? pkgBuyers.map((u) => mask(u.email)).join(', ') : 'никто'}`);
  }

  console.log('\n=== ЮЗЕРЫ: источники доступа ===');
  const admins = await User.find({ role: 'admin' }).select('email').lean();
  console.log(`  админы (доступ ко ВСЕМУ каталогу): ${admins.length ? admins.map((u) => mask(u.email)).join(', ') : 'нет'}`);
  const withBooks = await User.find({ 'purchasedBooks.0': { $exists: true } }).select('email purchasedBooks').lean();
  console.log(`  с купленными разборами: ${withBooks.length}`);
  withBooks.forEach((u) => console.log(`     ${mask(u.email)} — ${u.purchasedBooks.length} шт`));
  const withPkgs = await User.find({ 'purchasedPackages.0': { $exists: true } }).select('email purchasedPackages').lean();
  console.log(`  с купленными пакетами: ${withPkgs.length}`);
  withPkgs.forEach((u) => console.log(`     ${mask(u.email)} — ${u.purchasedPackages.length} шт`));
  const now = new Date();
  const subs = await User.find({
    subscriptionStatus: { $in: ['basic', 'premium'] },
    subscriptionExpiresAt: { $gt: now },
  }).select('email subscriptionStatus').lean();
  console.log(`  с активной подпиской: ${subs.length ? subs.map((u) => mask(u.email) + '/' + u.subscriptionStatus).join(', ') : 'нет'}`);

  await mongoose.disconnect();
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  mongoose.disconnect().finally(() => process.exit(1));
});
