/**
 * Создание Apple IAP-продуктов (non-consumable) из каталога — App Store Connect API.
 *
 * Кладётся в server/src/scripts/. Запускается С СЕРВЕРА (где лежит .p8 и есть
 * доступ к Mongo). Из локальной песочницы Apple API недоступен.
 *
 * ЧТО ДЕЛАЕТ:
 *   - читает из Mongo платные разборы (Book: isFree=false, priceUsd!=null) и
 *     пакеты (Package: priceUsd!=null);
 *   - для каждого создаёт non-consumable IAP с productId = appleProductId
 *     (book.<slug> / package.<slug>) — ровно то, что ждёт mapProduct() в
 *     purchase.service.js;
 *   - ставит БАЗОВУЮ цену в USD (ближайший price point), Apple сам раскидывает
 *     её по всем 175 витринам/валютам;
 *   - заливает локализации ru + en-US;
 *   - идемпотентно: если продукт с таким productId уже есть — пропускает
 *     (цену перезаписывает только с флагом --force-price).
 *
 * ПОДПИСКИ КЛУБА НЕ ТРОГАЕТ (они уже созданы). Флаг --audit печатает текущие
 * подписки и их группы — чтобы понять, лежат ли club.* в одной группе.
 *
 * ЧЕГО СКРИПТ НЕ ДЕЛАЕТ (только руками в App Store Connect):
 *   - Paid Apps Agreement + банк/налоги (без активного договора продукты не
 *     продаются);
 *   - скриншот ревью для каждого IAP (обязателен перед отправкой);
 *   - первую отправку продуктов на ревью ВМЕСТЕ со сборкой приложения
 *     (до этого висят в статусе Missing Metadata / Ready to Submit).
 *
 * ENV (добавить в server/.env):
 *   ASC_API_ISSUER_ID   = ef8fc656-...            (один на аккаунт)
 *   ASC_API_KEY_ID      = UN4ZB8T93H              (Team key, роль Admin/App Manager)
 *   ASC_API_P8_PATH     = /etc/chitatel/AuthKey_UN4ZB8T93H.p8
 *   APPLE_BUNDLE_ID     = app.chitatel.ios        (уже есть в конфиге)
 *
 * ЗАПУСК:
 *   cd server
 *   node src/scripts/create-appstore-products.js --audit       # показать app, продукты, подписки/группы
 *   node src/scripts/create-appstore-products.js --dry-run      # что будет создано, без записи
 *   node src/scripts/create-appstore-products.js                # создать/досоздать продукты
 *   node src/scripts/create-appstore-products.js --force-price   # + перезаписать цену у существующих
 */

const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config');
const Book = require('../models/Book');
const Package = require('../models/Package');

// ── Аргументы ──
const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has('--dry-run');
const AUDIT = ARGS.has('--audit');
const FORCE_PRICE = ARGS.has('--force-price');

// ── Настройки ──
const BASE_URL = 'https://api.appstoreconnect.apple.com';
const BASE_TERRITORY = 'USA'; // базовая витрина для цены (USD)
const LOCALES = ['en-US', 'ru']; // локализации; первая — «дефолт»
const ISSUER_ID = process.env.ASC_API_ISSUER_ID || '';
const KEY_ID = process.env.ASC_API_KEY_ID || '';
const P8_PATH = process.env.ASC_API_P8_PATH || '';
const BUNDLE_ID = config.apple.bundleId;

// Лимиты полей Apple (символы).
const LIM_REF_NAME = 64; // внутреннее имя IAP
const LIM_DISP_NAME = 30; // отображаемое имя (локализация)
const LIM_DESC = 45; // описание (локализация)

function trunc(s, n) {
  s = (s || '').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trim() + '…';
}

// Apple не принимает переносы строк/управляющие символы в имени и описании
// локализации. Схлопываем любые пробельные (вкл. \n, \t) в один пробел.
function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

// ── JWT для App Store Connect API ──
function makeToken() {
  if (!ISSUER_ID || !KEY_ID || !P8_PATH) {
    throw new Error(
      'Не заданы ASC_API_ISSUER_ID / ASC_API_KEY_ID / ASC_API_P8_PATH в .env'
    );
  }
  const key = fs.readFileSync(P8_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' },
    key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: KEY_ID, typ: 'JWT' } }
  );
}

// ── HTTP-хелпер (JSON:API) ──
let TOKEN = null;
async function api(method, path, body) {
  if (!TOKEN) TOKEN = makeToken();
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = (json.errors || [])
      .map((e) => `${e.status} ${e.title}: ${e.detail}`)
      .join(' | ');
    throw new Error(`${method} ${path} → ${res.status} ${detail || text}`);
  }
  return json;
}

// ── App id по bundleId ──
async function getAppId() {
  const r = await api(
    'GET',
    `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`
  );
  if (!r.data || !r.data.length) {
    throw new Error(`Приложение с bundleId=${BUNDLE_ID} не найдено под этим ключом`);
  }
  return r.data[0].id;
}

// ── Существующий IAP по productId ──
async function findIap(appId, productId) {
  const r = await api(
    'GET',
    `/v1/apps/${appId}/inAppPurchasesV2?filter[productId]=${encodeURIComponent(
      productId
    )}&limit=1`
  );
  return r.data && r.data.length ? r.data[0] : null;
}

async function createIap(appId, { productId, refName }) {
  const r = await api('POST', '/v2/inAppPurchases', {
    data: {
      type: 'inAppPurchases',
      attributes: {
        name: trunc(refName, LIM_REF_NAME),
        productId,
        inAppPurchaseType: 'NON_CONSUMABLE',
      },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
  });
  return r.data.id;
}

async function existingLocales(iapId) {
  // Читаем через include на v2-ресурсе — прямой to-many путь у Apple не отдаётся.
  try {
    const r = await api(
      'GET',
      `/v2/inAppPurchases/${iapId}?include=inAppPurchaseLocalizations`
    );
    const inc = r.included || [];
    return new Set(
      inc
        .filter((x) => x.type === 'inAppPurchaseLocalizations')
        .map((x) => x.attributes.locale)
    );
  } catch (_e) {
    return new Set();
  }
}

async function addLocalization(iapId, locale, name, description) {
  try {
    await api('POST', '/v1/inAppPurchaseLocalizations', {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes: {
          locale,
          name: trunc(clean(name), LIM_DISP_NAME),
          description: trunc(clean(description), LIM_DESC),
        },
        relationships: {
          inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iapId } },
        },
      },
    });
    console.log(`      локализация ${locale}`);
  } catch (e) {
    console.log(`      локализация ${locale}: пропущена (${e.message.slice(0, 120)})`);
  }
}

// Найти price point в базовой витрине, совпадающий с ценой USD.
async function findPricePointId(iapId, priceUsd) {
  const target = Number(priceUsd).toFixed(2);
  let url =
    `/v2/inAppPurchases/${iapId}/pricePoints` +
    `?filter[territory]=${BASE_TERRITORY}&limit=200`;
  // Пагинация — прайс-поинтов много.
  while (url) {
    const r = await api('GET', url);
    for (const pp of r.data || []) {
      if (Number(pp.attributes.customerPrice).toFixed(2) === target) return pp.id;
    }
    url = r.links && r.links.next ? r.links.next.replace(BASE_URL, '') : null;
  }
  return null;
}

async function hasPriceSchedule(iapId) {
  try {
    const r = await api(
      'GET',
      `/v1/inAppPurchases/${iapId}/iapPriceSchedule`
    );
    return !!(r.data && r.data.id);
  } catch (_e) {
    return false;
  }
}

async function setPrice(iapId, pricePointId) {
  await api('POST', '/v1/inAppPurchasePriceSchedules', {
    data: {
      type: 'inAppPurchasePriceSchedules',
      relationships: {
        inAppPurchase: { data: { type: 'inAppPurchases', id: iapId } },
        baseTerritory: {
          data: { type: 'territories', id: BASE_TERRITORY },
        },
        manualPrices: {
          data: [{ type: 'inAppPurchasePrices', id: '${price1}' }],
        },
      },
    },
    included: [
      {
        type: 'inAppPurchasePrices',
        id: '${price1}',
        attributes: { startDate: null },
        relationships: {
          inAppPurchasePricePoint: {
            data: { type: 'inAppPurchasePricePoints', id: pricePointId },
          },
        },
      },
    ],
  });
}

// ── Обработка одного продукта ──
async function processItem(appId, item) {
  const { productId, refName, title, description, priceUsd } = item;
  let iap = await findIap(appId, productId);
  let wasCreated = false;

  if (!iap) {
    if (DRY_RUN) {
      console.log(`  [dry] СОЗДАТЬ ${productId}  $${priceUsd}  «${title}»`);
      return { created: true };
    }
    const id = await createIap(appId, { productId, refName });
    iap = { id };
    wasCreated = true;
    console.log(`  + создан ${productId}  «${title}»`);
  } else {
    console.log(`  = уже есть ${productId}`);
  }

  const iapId = iap.id;

  // Локализации (добавляем недостающие). Каждая — устойчиво, не роняет прогон.
  if (!DRY_RUN) {
    const have = await existingLocales(iapId);
    for (const loc of LOCALES) {
      if (!have.has(loc)) {
        await addLocalization(iapId, loc, title, description);
      }
    }
  }

  // Цена. Весь блок в защите — ошибка цены не роняет продукт.
  try {
    const needPrice = FORCE_PRICE || !(await hasPriceSchedule(iapId));
    if (needPrice) {
      if (DRY_RUN) {
        console.log(`      [dry] цена $${priceUsd}`);
      } else {
        const pp = await findPricePointId(iapId, priceUsd);
        if (!pp) {
          console.log(
            `      ! price point для $${priceUsd} не найден (${productId}) — задать вручную`
          );
        } else {
          await setPrice(iapId, pp);
          console.log(`      цена $${priceUsd} (base ${BASE_TERRITORY} → все регионы)`);
        }
      }
    }
  } catch (e) {
    console.log(`      ! цена $${priceUsd}: ошибка — ${e.message.slice(0, 220)}`);
  }

  return { created: wasCreated };
}

// ── Аудит: приложение, продукты, подписки/группы ──
async function runAudit(appId) {
  console.log('\n── IAP (non-consumable / consumable) ──');
  let url = `/v1/apps/${appId}/inAppPurchasesV2?limit=200`;
  while (url) {
    const r = await api('GET', url);
    for (const d of r.data || []) {
      console.log(
        `  ${d.attributes.productId}  [${d.attributes.inAppPurchaseType}]  ${d.attributes.state}`
      );
    }
    url = r.links && r.links.next ? r.links.next.replace(BASE_URL, '') : null;
  }

  console.log('\n── Subscription groups и подписки ──');
  const groups = await api(
    'GET',
    `/v1/apps/${appId}/subscriptionGroups?include=subscriptions&limit=50`
  );
  const included = groups.included || [];
  for (const g of groups.data || []) {
    console.log(`  ГРУППА: ${g.attributes.referenceName} (${g.id})`);
    const subRefs = (g.relationships.subscriptions.data || []).map((s) => s.id);
    for (const sid of subRefs) {
      const sub = included.find((x) => x.type === 'subscriptions' && x.id === sid);
      if (sub) {
        console.log(
          `      • ${sub.attributes.productId}  [${sub.attributes.subscriptionPeriod || '—'}]  ${sub.attributes.state}`
        );
      }
    }
  }
  console.log(
    '\nЕсли все club.* под ОДНОЙ группой → апгрейд/даунгрейд работает, менять нечего.\n' +
      'Если под разными → переместить нельзя, только пересоздать в одной (пока не одобрены).'
  );
}

// ── main ──
async function main() {
  console.log('=== App Store Connect: продукты из каталога ===');
  console.log(`bundleId: ${BUNDLE_ID}  |  dry-run: ${DRY_RUN}  |  audit: ${AUDIT}`);

  const appId = await getAppId();
  console.log(`App id: ${appId}`);

  if (AUDIT) {
    await runAudit(appId);
    return;
  }

  await mongoose.connect(config.mongoUri);
  console.log(`Mongo: ${config.mongoUri}`);

  const books = await Book.find({
    isPublished: true,
    isFree: false,
    priceUsd: { $ne: null },
    appleProductId: { $ne: null },
  })
    .select('title description priceUsd appleProductId bookSlug')
    .lean();

  const packages = await Package.find({
    isPublished: true,
    priceUsd: { $ne: null },
    appleProductId: { $ne: null },
  })
    .select('title description priceUsd appleProductId packageSlug')
    .lean();

  console.log(`\nРазборы: ${books.length}, пакеты: ${packages.length}\n`);

  let created = 0;

  console.log('РАЗБОРЫ:');
  for (const b of books) {
    try {
      const r = await processItem(appId, {
        productId: b.appleProductId,
        refName: `Разбор: ${b.title}`,
        title: b.title,
        description: b.description || b.title,
        priceUsd: b.priceUsd,
      });
      if (r.created) created += 1;
    } catch (e) {
      console.log(`  ОШИБКА ${b.appleProductId}: ${e.message.slice(0, 150)}`);
    }
  }

  console.log('\nПАКЕТЫ:');
  for (const p of packages) {
    try {
      const r = await processItem(appId, {
        productId: p.appleProductId,
        refName: `Пакет: ${p.title}`,
        title: p.title,
        description: p.description || p.title,
        priceUsd: p.priceUsd,
      });
      if (r.created) created += 1;
    } catch (e) {
      console.log(`  ОШИБКА ${p.appleProductId}: ${e.message.slice(0, 150)}`);
    }
  }

  console.log(`\n=== Готово. Новых продуктов: ${created} ===`);
  console.log(
    'Дальше вручную в App Store Connect: скриншот ревью каждому продукту + ' +
      'отправить на ревью вместе со сборкой приложения.'
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
