/**
 * Новые цены каталога (13.10.2026) — разборы и пакеты.
 *
 * Источник: таблица Анны, колонка «новая цена в долл». Правило округления
 * под ценовую сетку Apple: до целого доллара минус цент (51,47 → 50,99,
 * 44,12 → 43,99, 73,53 → 73,99, 88,24 → 87,99, 147,06 → 146,99).
 *
 * Что делает:
 *   1. Book.priceUsd / Package.priceUsd в БД — это цена на Android (пока в
 *      Google Play нет товаров) и запасная цена на iPhone, пока StoreKit не
 *      ответил.
 *   2. reader-bot-catalog.json на диске — точечной заменой "priceUsd" в строке
 *      нужного slug (формат файла сохраняется), чтобы `npm run seed` не
 *      откатил цены.
 *
 * Цены в App Store скрипт НЕ трогает. После него:
 *   node src/scripts/create-appstore-products.js --force-price --only book.idiot
 *   (проверить товар в App Store Connect) → затем без --only.
 *
 * Разборы клуба (isPartOfClub) и бесплатные не трогаются никогда. Платные
 * разборы/пакеты из БД, которых нет в списке ниже, выводятся отдельным
 * списком «нет в прайсе» и НЕ меняются.
 *
 * ЗАПУСК:
 *   cd server
 *   node src/scripts/update-prices.js            # только показать «было → станет»
 *   node src/scripts/update-prices.js --apply    # записать в БД и JSON
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');
const Package = require('../models/Package');

const APPLY = process.argv.includes('--apply');

// ── Прайс ──
const BASE = 50.99; // почти все разборы
const BOOK_EXCEPTIONS = {
  // короткие — 44
  igrok: 43.99,
  gospozha_bovari: 43.99,
  nevynosimaya_legkost_bytiya: 43.99,
  geroy_nashego_vremeni: 43.99,
  toshnota: 43.99,
  smert_ivana_ilicha: 43.99,
  // дорогие — 74 / 88
  vremya_dengi: 73.99,
  tysyachelikiy_geroy: 73.99,
  potok: 73.99,
  beguschaya_s_volkami: 87.99,
};

// Все платные разборы каталога (reader-bot-catalog.json). Кого нет в
// исключениях — BASE.
const CATALOG_BOOKS = [
  'tysyachelikiy_geroy', 'grozdya_gneva', 'idiot', 'igrok',
  'vse_dorogi_vedut_k_sebe', 'ya_u_sebya_odna_ili_vereteno_vasilisy',
  'nelyubimaya_doch', 'iskusstvo_lyubit', 'gospozha_bovari',
  'lyudi_kotorye_igrayut_v_igry_igry_v_kotorye_igrayut_lyudi', 'nevernost',
  'nevynosimaya_legkost_bytiya', 'geroy_nashego_vremeni', 'anna_karenina',
  'voyna_i_mir', 'vishnyovyy_sad', 'uyti_chtoby_vyrasti', 'vremya_dengi',
  'sto_let_odinochestva', 'toshnota', 'paradoks_odinochestva', 'vozrast',
  'vglyadyvayas_v_solntse', 'smert_ivana_ilicha', 'vsyo_delo_v_pape',
  'bratya_karamazovy', 'besy', 'ottsy_i_deti', 'vybor', '12_pravil_zhizni',
  'potok', 'atomnye_privychki', '4000_nedel', 'ada_ili_otrada',
  'prestuplenie_i_nakazanie', 'faust', 'gore_ot_uma', 'sobache_serdtse',
  'myortvye_dushi', 'zaschita_luzhina', 'biografiya_vladimira_nabokova',
  'biografiya_lva_tolstogo', 'beguschaya_s_volkami', 'lolita',
  'zhenschiny_kotorye_lyubyat_slishkom_silno', 'telo_ne_vret', 'tanets_gneva',
  'odin_na_odin_s_zhiznyu', 'skazat_zhizni_da',
  'razbory_zhenskaya_druzhba_chehov_i_bunin',
  'razbor_erih_fromm_begstvo_ot_svobody',
  'razbor_dzheyms_hollis_dushevnye_omuty', 'bednye_lyudi', 'protsess', 'dar',
];

const BOOK_PRICES = Object.fromEntries(
  CATALOG_BOOKS.map((s) => [s, BOOK_EXCEPTIONS[s] != null ? BOOK_EXCEPTIONS[s] : BASE])
);

const PACKAGE_PRICES = {
  paket_latypov_frankl: 87.99,
  paket_woman: 310.99,
  paket_love_rel: 184.99,
  paket_goals_ach: 138.99,
  paket_understand_yourself: 158.99,
  facultativ_dostoevsky: 146.99,
  facultativ_tolstoy: 146.99,
  facultativ_foreign: 146.99,
  facultativ_russian: 146.99,
};

function fmt(v) {
  return v == null ? '—' : `$${Number(v).toFixed(2)}`;
}

// Точечная правка JSON: в строке, где есть "<key>":"<slug>", заменить
// значение "priceUsd". Одна запись = одна строка (так устроен файл).
function patchJson(raw, key, slug, price) {
  const lines = raw.split('\n');
  const marker = `"${key}":"${slug}"`;
  let hits = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(marker)) continue;
    const next = lines[i].replace(/"priceUsd":\s*[0-9.]+/, `"priceUsd":${price}`);
    if (next !== lines[i]) hits += 1;
    lines[i] = next;
  }
  return { raw: lines.join('\n'), hits };
}

async function main() {
  console.log(`=== Новые цены каталога  |  режим: ${APPLY ? 'ЗАПИСЬ' : 'только показать'} ===\n`);
  await mongoose.connect(config.mongoUri);

  // ── Разборы ──
  const books = await Book.find({ isFree: false, isPartOfClub: { $ne: true } })
    .select('title bookSlug priceUsd isPublished appleProductId')
    .sort({ title: 1 })
    .lean();

  const bookChanges = [];
  const bookUnknown = [];
  let bookSame = 0;
  for (const b of books) {
    const target = BOOK_PRICES[b.bookSlug];
    if (target == null) {
      bookUnknown.push(b);
    } else if (Number(b.priceUsd) === target) {
      bookSame += 1;
    } else {
      bookChanges.push({ ...b, target });
    }
  }

  console.log(`РАЗБОРЫ: изменится ${bookChanges.length}, уже верно ${bookSame}`);
  for (const b of bookChanges) {
    const pub = b.isPublished ? '' : '  (не опубликован)';
    console.log(`  ${fmt(b.priceUsd).padStart(8)} → ${fmt(b.target).padEnd(8)} ${b.title}${pub}`);
  }

  // ── Пакеты ──
  const pkgs = await Package.find({})
    .select('title packageSlug priceUsd isPublished')
    .sort({ title: 1 })
    .lean();

  const pkgChanges = [];
  const pkgUnknown = [];
  let pkgSame = 0;
  for (const p of pkgs) {
    const target = PACKAGE_PRICES[p.packageSlug];
    if (target == null) {
      pkgUnknown.push(p);
    } else if (Number(p.priceUsd) === target) {
      pkgSame += 1;
    } else {
      pkgChanges.push({ ...p, target });
    }
  }

  console.log(`\nПАКЕТЫ: изменится ${pkgChanges.length}, уже верно ${pkgSame}`);
  for (const p of pkgChanges) {
    const pub = p.isPublished ? '' : '  (не опубликован)';
    console.log(`  ${fmt(p.priceUsd).padStart(8)} → ${fmt(p.target).padEnd(8)} ${p.title}${pub}`);
  }

  // ── Чего нет в прайсе — не трогаем, просто показываем ──
  if (bookUnknown.length || pkgUnknown.length) {
    console.log('\nНЕТ В ПРАЙСЕ (цена не меняется, проверьте глазами):');
    for (const b of bookUnknown) {
      console.log(`  разбор  ${fmt(b.priceUsd).padStart(8)}  ${b.title}  [${b.bookSlug}]`);
    }
    for (const p of pkgUnknown) {
      console.log(`  пакет   ${fmt(p.priceUsd).padStart(8)}  ${p.title}  [${p.packageSlug}]`);
    }
  }

  // Слаги из прайса, которых нет в БД — опечатка или разбор удалён.
  const dbBookSlugs = new Set(books.map((b) => b.bookSlug));
  const dbPkgSlugs = new Set(pkgs.map((p) => p.packageSlug));
  const missing = [
    ...Object.keys(BOOK_PRICES).filter((s) => !dbBookSlugs.has(s)),
    ...Object.keys(PACKAGE_PRICES).filter((s) => !dbPkgSlugs.has(s)),
  ];
  if (missing.length) {
    console.log(`\n! В прайсе есть, в БД нет: ${missing.join(', ')}`);
  }

  if (!APPLY) {
    console.log('\nНичего не записано. Для записи: --apply');
    return;
  }

  // ── Запись в БД ──
  for (const b of bookChanges) {
    await Book.updateOne({ _id: b._id }, { $set: { priceUsd: b.target } });
  }
  for (const p of pkgChanges) {
    await Package.updateOne({ _id: p._id }, { $set: { priceUsd: p.target } });
  }
  console.log(`\nБД: разборов ${bookChanges.length}, пакетов ${pkgChanges.length}`);

  // ── Запись в JSON-источник сида ──
  const jsonPath = path.join(__dirname, 'reader-bot-catalog.json');
  let raw = fs.readFileSync(jsonPath, 'utf8');
  let jsonHits = 0;
  for (const [slug, price] of Object.entries(BOOK_PRICES)) {
    const r = patchJson(raw, 'bookSlug', slug, price);
    raw = r.raw;
    jsonHits += r.hits;
  }
  for (const [slug, price] of Object.entries(PACKAGE_PRICES)) {
    const r = patchJson(raw, 'packageSlug', slug, price);
    raw = r.raw;
    jsonHits += r.hits;
  }
  fs.writeFileSync(jsonPath, raw, 'utf8');
  console.log(`JSON-источник сида: обновлено цен ${jsonHits}`);

  console.log(
    '\nДальше — цены в App Store:\n' +
      '  node src/scripts/create-appstore-products.js --force-price --only book.idiot\n' +
      '  (проверить товар в App Store Connect: цена, регионы, описание)\n' +
      '  node src/scripts/create-appstore-products.js --force-price'
  );
}

main()
  .catch((err) => {
    console.error('\nОШИБКА:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
