/**
 * Что сейчас записано у Apple по одному товару: состояние, базовая цена,
 * цена в Грузии. ТОЛЬКО ЧТЕНИЕ — ничего не меняет.
 *
 *   cd server
 *   node src/scripts/check-iap-price.js book.idiot
 *   node src/scripts/check-iap-price.js book.idiot GEO USA   # свои страны
 *
 * ENV те же, что у create-appstore-products.js (ASC_API_*).
 */

const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('../config');

const BASE_URL = 'https://api.appstoreconnect.apple.com';
const [productId, ...terrArgs] = process.argv.slice(2);
const TERRITORIES = terrArgs.length ? terrArgs : ['GEO'];

function token() {
  const { ASC_API_ISSUER_ID: iss, ASC_API_KEY_ID: kid, ASC_API_P8_PATH: p8 } = process.env;
  if (!iss || !kid || !p8) throw new Error('Не заданы ASC_API_* в .env');
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' },
    fs.readFileSync(p8, 'utf8'),
    { algorithm: 'ES256', header: { alg: 'ES256', kid, typ: 'JWT' } }
  );
}

const TOKEN = token();
async function get(path) {
  const res = await fetch(BASE_URL + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const d = (json.errors || []).map((e) => `${e.status} ${e.detail}`).join(' | ');
    throw new Error(`${res.status} ${d || text}`.slice(0, 250));
  }
  return json;
}

async function showPrices(label, path) {
  try {
    const r = await get(path);
    const inc = r.included || [];
    if (!(r.data || []).length) return console.log(`  ${label}: пусто`);
    for (const p of r.data) {
      const ppRef = p.relationships?.inAppPurchasePricePoint?.data;
      const terRef = p.relationships?.territory?.data;
      const pp = ppRef && inc.find((x) => x.type === ppRef.type && x.id === ppRef.id);
      console.log(
        `  ${label}: ${terRef ? terRef.id : '?'} ${pp ? pp.attributes.customerPrice : '?'}` +
          `  (с ${p.attributes?.startDate || 'сразу'} по ${p.attributes?.endDate || '—'})`
      );
    }
  } catch (e) {
    console.log(`  ${label}: не удалось прочитать — ${e.message}`);
  }
}

async function main() {
  if (!productId) throw new Error('Укажите товар: node src/scripts/check-iap-price.js book.idiot');

  const apps = await get(`/v1/apps?filter[bundleId]=${encodeURIComponent(config.apple.bundleId)}&limit=1`);
  const appId = apps.data[0].id;

  const r = await get(
    `/v1/apps/${appId}/inAppPurchasesV2?filter[productId]=${encodeURIComponent(productId)}&limit=1`
  );
  const iap = (r.data || [])[0];
  if (!iap) return console.log(`${productId}: в App Store Connect не найден`);
  console.log(`${productId}  состояние: ${iap.attributes.state}`);

  const base = `/v1/inAppPurchasePriceSchedules/${iap.id}`;
  await showPrices(
    'базовая',
    `${base}/manualPrices?include=inAppPurchasePricePoint,territory&limit=50`
  );
  for (const t of TERRITORIES) {
    await showPrices(
      `авто ${t}`,
      `${base}/automaticPrices?filter[territory]=${t}&include=inAppPurchasePricePoint,territory&limit=50`
    );
  }
}

main().catch((e) => {
  console.error('ОШИБКА:', e.message);
  process.exitCode = 1;
});
