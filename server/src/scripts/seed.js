/**
 * Seed-скрипт для заливки каталога Анны в MongoDB.
 *
 * Использование:
 *   cd server
 *   npm run seed
 *
 * Что делает:
 * 1. Подключается к MongoDB (config.mongoUri)
 * 2. Очищает коллекции Book и Package (скрипт идемпотентный — можно гонять повторно)
 * 3. Читает reader-bot-catalog.json (54 разбора + 10 пакетов)
 * 4. Вставляет 54 платных разбора + 3 бесплатных (Alice/EatPrayLove/Маленький принц)
 *    — Маленький принц получает 6 частей с реальными аудиофайлами (задача 2.3)
 * 5. Вставляет 10 пакетов, сопоставляя bookSlugs → ObjectId уже вставленных книг
 *
 * Цены: priceUsd берётся из каталога (округлён под ценовые точки Apple .99); bynToUsd — фоллбек.
 * coverImageUrl указывает на Flutter-ассеты (app/assets/book-covers/{slug}.png).
 * audioFilename у большинства книг пустой — аудио пришлёт Анна позже.
 *
 * Шаг 2.3.5-c из AI-CONTEXT + задача 2.3 (заполнение Маленького принца).
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
  facultativ_dostoevsky: 'facultativ_dostoevsky',
  facultativ_nabokov: 'facultativ_nabokov',
  facultativ_children: 'facultativ_children_classics',
  facultativ_tolstoy: null, // обложки нет — будет fallback на градиент
  facultativ_foreign: 'facultativ_foreign_classics',
  facultativ_russian: 'facultativ_russian_classics',
};

// --- Маленький принц: 6 частей с реальными аудиофайлами (задача 2.3) ---
//
// Файлы лежат в AUDIO_BASE_PATH/malenkii_princ/part-{N}.mp3.
// В разработке: ~/Chitatel_app/audio-storage/malenkii_princ/part-N.mp3
// В продакшене: /var/audio/chitatel/malenkii_princ/part-N.mp3
//
// duration — точные значения из ffprobe на реальных MP3 (192 kbps).
// audioFilename — относительный путь от AUDIO_BASE_PATH.
//
// Книга бесплатная (isFree: true) — все части доступны без покупки.
// isPreviewAvailable не нужно (актуально только для платных).

const MALENKII_PRINC_PARTS = [
  { number: 1, title: 'Часть 1', duration: 855, audioFilename: 'malenkii_princ/part-1.mp3' },
  { number: 2, title: 'Часть 2', duration: 398, audioFilename: 'malenkii_princ/part-2.mp3' },
  { number: 3, title: 'Часть 3', duration: 700, audioFilename: 'malenkii_princ/part-3.mp3' },
  { number: 4, title: 'Часть 4', duration: 1377, audioFilename: 'malenkii_princ/part-4.mp3' },
  { number: 5, title: 'Часть 5', duration: 1987, audioFilename: 'malenkii_princ/part-5.mp3' },
  { number: 6, title: 'Часть 6', duration: 1896, audioFilename: 'malenkii_princ/part-6.mp3' },
];

// --- Список бесплатных промо-разборов (без цены, isFree: true) ---
// См. g1orgi89/reader-bot/mini-app/assets/audio-covers/ — у этих 3 есть обложки плеера.

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
];

// --- Маппинг одной записи из JSON в документ Book ---

function mapPaidBook(src) {
  return {
    title: src.title,
    author: src.author || '',
    description: src.description,

    coverImageUrl: `asset://book-covers/${src.bookSlug}.png`,
    coverGradientColors: ['#1A0E08', '#3A2018'],
    coverLabel: '',

    durationTotal: 0,

    categories: src.categories || [],
    tags: src.targetThemes || [],

    priceUsd: src.priceUsd != null ? src.priceUsd : bynToUsd(src.priceByn),
    priceRub: null,
    priceByn: src.priceByn,
    isFree: false,
    appleProductId: `book.${src.bookSlug}`,

    bookSlug: src.bookSlug,
    purchaseUrl: src.purchaseUrl || '',

    isPartOfClub: false,
    clubMonth: null,
    freeChapterIndex: 0,

    rating: 0,
    reviewCount: 0,

    parts: [],

    isPublished: true,
    publishedAt: new Date(),
  };
}

function mapFreeBook(src) {
  const partsTotal = (src.parts || []).reduce((acc, p) => acc + (p.duration || 0), 0);
  return {
    title: src.title,
    author: src.author,
    description: src.description,

    coverImageUrl: `asset://book-covers/${src.bookSlug}.png`,
    coverGradientColors: ['#1A0E08', '#3A2018'],
    coverLabel: '',

    durationTotal: partsTotal,

    categories: src.categories,
    tags: src.tags,

    priceUsd: null,
    priceRub: null,
    priceByn: null,
    isFree: true,
    appleProductId: null,

    bookSlug: src.bookSlug,
    purchaseUrl: '',

    isPartOfClub: false,
    clubMonth: null,
    freeChapterIndex: 0,

    rating: 0,
    reviewCount: 0,

    parts: src.parts || [],

    isPublished: true,
    publishedAt: new Date(),
  };
}

async function mapPackage(src, bookSlugToId) {
  const bookIds = src.booksInPackage
    .map((slug) => bookSlugToId.get(slug))
    .filter((id) => id != null);

  const coverFilename = packageCoverFilenames[src.packageSlug];
  const coverImageUrl = coverFilename ? `asset://book-covers/${coverFilename}.png` : '';

  return {
    title: src.title,
    description: src.description,

    coverImageUrl,
    coverGradientColors: ['#1A0E08', '#3A2018'],
    coverLabel: '',

    packageSlug: src.packageSlug,

    books: bookIds,
    bookSlugs: src.booksInPackage,

    priceUsd: src.priceUsd != null ? src.priceUsd : bynToUsd(src.priceByn),
    priceRub: src.priceRub || null,
    priceByn: src.priceByn,

    appleProductId: `package.${src.packageSlug}`,

    purchaseUrl: src.purchaseUrl || '',

    isPublished: true,
  };
}

// --- Основная функция seed ---

async function seed() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌱 Seed каталога ЧИТАТЕЛЬ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log(`\n📡 Подключение к MongoDB: ${config.mongoUri}`);
  await mongoose.connect(config.mongoUri);
  console.log('✅ Подключено');

  const jsonPath = path.join(__dirname, 'reader-bot-catalog.json');
  console.log(`\n📖 Чтение каталога: ${jsonPath}`);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);
  console.log(`✅ Прочитано: ${data.books.length} книг, ${data.packages.length} пакетов`);

  console.log('\n🧹 Очистка коллекций Book и Package...');
  await Book.deleteMany({});
  await Package.deleteMany({});
  console.log('✅ Коллекции очищены');

  console.log(`\n📚 Вставка ${data.books.length} платных разборов...`);
  const paidBookDocs = data.books.map(mapPaidBook);
  const insertedPaid = await Book.insertMany(paidBookDocs);
  console.log(`✅ Вставлено: ${insertedPaid.length} платных`);

  console.log(`\n🎁 Вставка ${FREE_BOOKS.length} бесплатных промо-разборов...`);
  const freeBookDocs = FREE_BOOKS.map(mapFreeBook);
  const insertedFree = await Book.insertMany(freeBookDocs);
  console.log(`✅ Вставлено: ${insertedFree.length} бесплатных`);

  // Логируем какие бесплатные с реальным аудио
  const withAudio = insertedFree.filter((b) => b.parts.length > 0);
  if (withAudio.length > 0) {
    console.log(`   🎧 С аудиофайлами:`);
    for (const b of withAudio) {
      const minutes = Math.round(b.durationTotal / 60);
      console.log(`      ${b.title}: ${b.parts.length} частей, ~${minutes} мин`);
    }
  }

  const bookSlugToId = new Map();
  for (const book of [...insertedPaid, ...insertedFree]) {
    bookSlugToId.set(book.bookSlug, book._id);
  }

  console.log(`\n📦 Вставка ${data.packages.length} пакетов...`);
  const packageDocs = await Promise.all(data.packages.map((p) => mapPackage(p, bookSlugToId)));
  const insertedPackages = await Package.insertMany(packageDocs);

  for (let i = 0; i < data.packages.length; i++) {
    const src = data.packages[i];
    const inserted = insertedPackages[i];
    const missingSlugs = src.booksInPackage.filter((s) => !bookSlugToId.has(s));
    if (missingSlugs.length > 0) {
      console.log(
        `   ⚠️  ${src.title}: отсутствует в каталоге ${missingSlugs.length}/${src.booksInPackage.length} — ${missingSlugs.join(', ')}`
      );
    }
    if (!inserted.coverImageUrl) {
      console.log(`   ⚠️  ${src.title}: нет обложки (packageSlug=${src.packageSlug})`);
    }
  }
  console.log(`✅ Вставлено: ${insertedPackages.length} пакетов`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Итого в БД:');
  console.log(`   Книг платных:     ${insertedPaid.length}`);
  console.log(`   Книг бесплатных:  ${insertedFree.length}`);
  console.log(`   Пакетов:          ${insertedPackages.length}`);
  console.log(`   ВСЕГО книг:       ${insertedPaid.length + insertedFree.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.disconnect();
  console.log('\n👋 Отключено от MongoDB');
}

seed()
  .then(() => {
    console.log('\n✅ Seed завершён успешно');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed упал:', err);
    mongoose.disconnect().finally(() => process.exit(1));
  });
