/**
 * Seed-скрипт каталога Анны (ПРОДАКШН-БЕЗОПАСНЫЙ, idempotent UPSERT).
 *
 * Использование:
 *   cd server
 *   npm run seed
 *
 * ⚠️ 30.07.2026 — ПЕРЕПИСАН НА UPSERT (без delete+insert).
 * Раньше скрипт делал Book.deleteMany()+insertMany() → каждый разбор получал
 * НОВЫЙ _id, из-за чего осиротевал прогресс (Progress.bookId), клубные ссылки
 * и покупки. Теперь книги/пакеты обновляются НА МЕСТЕ по slug — _id сохраняются,
 * пользовательские данные переживают любое обновление каталога.
 *
 * Что делает:
 * 1. Подключается к MongoDB (config.mongoUri).
 * 2. UPSERT каждого разбора по bookSlug и каждого пакета по packageSlug.
 *    - Обновляются ТОЛЬКО каталожные поля (название, автор, описание, цена,
 *      категории, обложка, публикация).
 *    - НЕ трогаются пользовательские/контентные поля существующих книг:
 *      parts (аудио Анны), rating, reviewCount, isPartOfClub, clubMonth,
 *      publishedAt — они ставятся ТОЛЬКО при первом создании ($setOnInsert).
 * 3. Разборы/пакеты, которых больше нет в каталоге, НЕ удаляются, а снимаются
 *    с публикации (isPublished:false) — чтобы не осиротить прогресс.
 *
 * Клуб (месяц, книга, даты), чат, тестовые юзеры — этот скрипт НЕ трогает.
 * Ими управляет админка. seed-club.js — только dev-тестовые данные, на проде
 * запускать НЕЛЬЗЯ (он затирает чат).
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');
const Package = require('../models/Package');

// --- Конвертация цен ---

/**
 * Маппинг BYN → USD по Apple Price Tier (Tier = цена в USD).
 * Источник курса: ~3.1 BYN = $1 (апрель 2026).
 * Округление вниз к ближайшему Tier для юзер-френдли цен.
 */
function bynToUsd(byn) {
  if (byn === 80) return 24.99;   // ~$25.80 → Tier 25
  if (byn === 100) return 29.99;  // ~$32.25 → Tier 30
  if (byn === 150) return 44.99;  // ~$48.38 → Tier 45
  if (byn === 280) return 84.99;  // ~$90.32 → Tier 85 (для пакетов)
  // Фоллбек для нестандартной цены
  const raw = byn / 3.1;
  return Math.floor(raw) + 0.99;
}

// --- Обложки пакетов: slug из JSON → имя файла в app/assets/book-covers/ ---

const packageCoverFilenames = {
  paket_woman: 'paket_woman',
  paket_love_rel: 'paket_love_rel',
  paket_goals_ach: 'paket_goals_ach',
  paket_understand_yourself: 'paket_understand_yourself',
  paket_latypov_frankl: 'paket_latypov_frankl',
  facultativ_dostoevsky: 'facultativ_dostoevsky',
  facultativ_tolstoy: 'facultativ_tolstoy',
  facultativ_foreign: 'facultativ_foreign_classics',
  facultativ_russian: 'facultativ_russian_classics',
};

// --- Маленький принц: 6 частей с реальными аудиофайлами (задача 2.3) ---

const MALENKII_PRINC_PARTS = [
  { number: 1, title: 'Часть 1', duration: 855, audioFilename: 'malenkii_princ/part-1.mp3' },
  { number: 2, title: 'Часть 2', duration: 398, audioFilename: 'malenkii_princ/part-2.mp3' },
  { number: 3, title: 'Часть 3', duration: 700, audioFilename: 'malenkii_princ/part-3.mp3' },
  { number: 4, title: 'Часть 4', duration: 1377, audioFilename: 'malenkii_princ/part-4.mp3' },
  { number: 5, title: 'Часть 5', duration: 1987, audioFilename: 'malenkii_princ/part-5.mp3' },
  { number: 6, title: 'Часть 6', duration: 1896, audioFilename: 'malenkii_princ/part-6.mp3' },
];

// --- Список бесплатных промо-разборов (без цены, isFree: true) ---

const FREE_BOOKS = [
  {
    title: 'Алиса в стране чудес',
    author: 'Льюис Кэрролл',
    description:
      'Классическая детская сказка о путешествии в волшебный мир. ' +
      'Бесплатный разбор — попробуйте формат прежде чем купить платный контент.',
    bookSlug: 'alice_wonderland',
    categories: ['ПОИСК СЕБЯ'],
    tags: ['сказка', 'детская классика', 'Кэрролл', 'бесплатно'],
    parts: [], // аудио пришлёт Анна
  },
  {
    title: 'Ешь, молись, люби',
    author: 'Элизабет Гилберт',
    description:
      'Автобиографический роман о путешествии по Италии, Индии и Индонезии в поисках себя. ' +
      'Бесплатный разбор — попробуйте формат прежде чем купить платный контент.',
    bookSlug: 'eat_pray_love',
    categories: ['Я — ЖЕНЩИНА', 'ПОИСК СЕБЯ'],
    tags: ['путешествие', 'женщина', 'самопознание', 'Гилберт', 'бесплатно'],
    parts: [],
  },
  {
    title: 'Маленький принц',
    author: 'Антуан де Сент-Экзюпери',
    description:
      'Философская сказка о дружбе, любви и одиночестве. ' +
      'Бесплатный разбор — попробуйте формат прежде чем купить платный контент.',
    bookSlug: 'malenkii_princ',
    categories: ['ОДИНОЧЕСТВО', 'ПОИСК СЕБЯ'],
    tags: ['классика', 'философская сказка', 'Сент-Экзюпери', 'бесплатно'],
    parts: MALENKII_PRINC_PARTS,
  },
  {
    title: 'Муму',
    author: 'Иван Тургенев',
    description:
      'О привязанности, потере и немом протесте. Как сохранить любовь и достоинство, когда ты бесправен?',
    bookSlug: 'mumu',
    categories: ['ОБЩЕСТВО'],
    tags: ['классика', 'Тургенев', 'бесплатно'],
    parts: [],
  },
  {
    title: 'Биография Достоевского',
    author: 'Анна Бусел',
    description:
      'Путь Достоевского: от каторги и потерь к великим романам. Как страдание становится источником смысла и творчества.',
    bookSlug: 'biografiya_dostoevskogo',
    categories: ['ПОИСК СЕБЯ'],
    tags: ['биография', 'Достоевский', 'бесплатно'],
    parts: [],
  },
];

// --- Маппинг: каталожные поля, которые ОБНОВЛЯЮТСЯ при каждом сиде ---

// Разборы без аудио — временно скрыты из каталога (isPublished:false), чтобы не
// висели пустыми. Синхронно с scripts/hide-pending-audio.js. Когда появится
// аудио — убрать слаг отсюда (+ import-audio), и разбор снова опубликуется.
const HIDDEN_UNTIL_AUDIO = [
  'ada_ili_otrada',
  'zaschita_luzhina',
  'biografiya_vladimira_nabokova',
  'dar',
  'sobache_serdtse',
];

function paidUpdateFields(src) {
  return {
    title: src.title,
    author: src.author || '',
    description: src.description,
    coverImageUrl: `asset://book-covers/${src.bookSlug}.png`,
    coverGradientColors: ['#1A0E08', '#3A2018'],
    coverLabel: '',
    categories: src.categories || [],
    tags: src.targetThemes || [],
    priceUsd: src.priceUsd != null ? src.priceUsd : bynToUsd(src.priceByn),
    priceRub: null,
    priceByn: src.priceByn,
    isFree: false,
    appleProductId: `book.${src.bookSlug}`,
    purchaseUrl: src.purchaseUrl || '',
    isPublished: !HIDDEN_UNTIL_AUDIO.includes(src.bookSlug),
  };
}

function freeUpdateFields(src) {
  return {
    title: src.title,
    author: src.author,
    description: src.description,
    coverImageUrl: `asset://book-covers/${src.bookSlug}.png`,
    coverGradientColors: ['#1A0E08', '#3A2018'],
    coverLabel: '',
    categories: src.categories || [],
    tags: src.tags || [],
    priceUsd: null,
    priceRub: null,
    priceByn: null,
    isFree: true,
    appleProductId: null,
    purchaseUrl: '',
    isPublished: true,
  };
}

// --- Поля, которые ставятся ТОЛЬКО при создании (не затираем прогресс/аудио/оценки) ---

function paidInsertOnly() {
  return {
    durationTotal: 0,
    isPartOfClub: false,
    clubMonth: null,
    freeChapterIndex: 0,
    rating: 0,
    reviewCount: 0,
    parts: [],
    publishedAt: new Date(),
  };
}

function freeInsertOnly(src) {
  const partsTotal = (src.parts || []).reduce((acc, p) => acc + (p.duration || 0), 0);
  return {
    durationTotal: partsTotal,
    parts: src.parts || [],
    isPartOfClub: false,
    clubMonth: null,
    freeChapterIndex: 0,
    rating: 0,
    reviewCount: 0,
    publishedAt: new Date(),
  };
}

// --- UPSERT одной книги по bookSlug ---

async function upsertBook(slug, updateFields, insertOnly) {
  const res = await Book.updateOne(
    { bookSlug: slug },
    { $set: updateFields, $setOnInsert: insertOnly },
    { upsert: true }
  );
  // upsertedCount=1 → создана; иначе обновлена существующая.
  return res.upsertedCount === 1 ? 'created' : 'updated';
}

// --- Основная функция seed ---

async function seed() {
  console.log('=== Seed каталога ЧИТАТЕЛЬ (UPSERT, без потери данных) ===');

  console.log(`Подключение к MongoDB: ${config.mongoUri}`);
  await mongoose.connect(config.mongoUri);
  console.log('Подключено');

  const jsonPath = path.join(__dirname, 'reader-bot-catalog.json');
  console.log(`Чтение каталога: ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  console.log(`Прочитано: ${data.books.length} книг, ${data.packages.length} пакетов`);

  // 1) Платные разборы — upsert по bookSlug.
  let paidCreated = 0;
  let paidUpdated = 0;
  for (const src of data.books) {
    const r = await upsertBook(src.bookSlug, paidUpdateFields(src), paidInsertOnly());
    if (r === 'created') paidCreated += 1;
    else paidUpdated += 1;
  }
  console.log(`Платные: создано ${paidCreated}, обновлено ${paidUpdated}`);

  // 2) Бесплатные промо-разборы — upsert по bookSlug.
  let freeCreated = 0;
  let freeUpdated = 0;
  for (const src of FREE_BOOKS) {
    const r = await upsertBook(src.bookSlug, freeUpdateFields(src), freeInsertOnly(src));
    if (r === 'created') freeCreated += 1;
    else freeUpdated += 1;
  }
  console.log(`Бесплатные: создано ${freeCreated}, обновлено ${freeUpdated}`);

  // 3) Разборы, которых больше нет в каталоге — снять с публикации (НЕ удалять).
  const allBookSlugs = [
    ...data.books.map((b) => b.bookSlug),
    ...FREE_BOOKS.map((b) => b.bookSlug),
  ];
  const unpubBooks = await Book.updateMany(
    { bookSlug: { $nin: allBookSlugs }, isPublished: true },
    { $set: { isPublished: false } }
  );
  if (unpubBooks.modifiedCount > 0) {
    console.log(`Снято с публикации разборов (нет в каталоге): ${unpubBooks.modifiedCount}`);
  }

  // 4) Пакеты — upsert по packageSlug. books[] пересобираем по slug (id уже стабильны).
  const allBooks = await Book.find({}).select('_id bookSlug').lean();
  const bookSlugToId = new Map(allBooks.map((b) => [b.bookSlug, b._id]));

  let pkgCreated = 0;
  let pkgUpdated = 0;
  for (const p of data.packages) {
    const bookIds = p.booksInPackage
      .map((s) => bookSlugToId.get(s))
      .filter((id) => id != null);
    const missingSlugs = p.booksInPackage.filter((s) => !bookSlugToId.has(s));
    if (missingSlugs.length > 0) {
      console.log(`  ! ${p.title}: нет в каталоге ${missingSlugs.length}/${p.booksInPackage.length} — ${missingSlugs.join(', ')}`);
    }

    const coverFilename = packageCoverFilenames[p.packageSlug];
    const coverImageUrl = coverFilename ? `asset://book-covers/${coverFilename}.png` : '';

    const res = await Package.updateOne(
      { packageSlug: p.packageSlug },
      {
        $set: {
          title: p.title,
          description: p.description,
          coverImageUrl,
          coverGradientColors: ['#1A0E08', '#3A2018'],
          coverLabel: '',
          books: bookIds,
          bookSlugs: p.booksInPackage,
          priceUsd: p.priceUsd != null ? p.priceUsd : bynToUsd(p.priceByn),
          priceRub: p.priceRub || null,
          priceByn: p.priceByn,
          appleProductId: `package.${p.packageSlug}`,
          purchaseUrl: p.purchaseUrl || '',
          isPublished: true,
        },
      },
      { upsert: true }
    );
    if (res.upsertedCount === 1) pkgCreated += 1;
    else pkgUpdated += 1;
  }
  console.log(`Пакеты: создано ${pkgCreated}, обновлено ${pkgUpdated}`);

  // 5) Пакеты, которых больше нет — снять с публикации.
  const pkgSlugs = data.packages.map((p) => p.packageSlug);
  const unpubPkgs = await Package.updateMany(
    { packageSlug: { $nin: pkgSlugs }, isPublished: true },
    { $set: { isPublished: false } }
  );
  if (unpubPkgs.modifiedCount > 0) {
    console.log(`Снято с публикации пакетов (нет в каталоге): ${unpubPkgs.modifiedCount}`);
  }

  const totalBooks = await Book.countDocuments({ isPublished: true });
  const totalPkgs = await Package.countDocuments({ isPublished: true });
  console.log('=== Итого опубликовано ===');
  console.log(`  Книг:    ${totalBooks}`);
  console.log(`  Пакетов: ${totalPkgs}`);

  await mongoose.disconnect();
  console.log('Отключено от MongoDB');
}

seed()
  .then(() => {
    console.log('Seed завершён успешно');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed упал:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
