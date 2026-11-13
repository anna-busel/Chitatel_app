/**
 * CRM: покупки App Store / Google Play → заказы CRM (CRM-PLAN C1, C2, C3;
 * 13.11.2026) — crm/services/store-ingest.service.js + врезка в
 * purchase.service.applyTransaction.
 *
 * БД не нужна: модели подменены простым хранилищем в памяти (mockDb) — запросы
 * на равенство, $ne, $in и сортировку по createdAt.
 */

process.env.TZ = 'Europe/Moscow';

const mockDb = {};
let mockSeq = 0;

function mockValues(doc, path) {
  let cur = [doc];
  path.split('.').forEach((part) => {
    const next = [];
    cur.forEach((v) => {
      if (v === null || v === undefined) {return;}
      const x = v[part];
      if (Array.isArray(x)) {next.push(...x);} else {next.push(x);}
    });
    cur = next;
  });
  return cur.length ? cur : [undefined];
}

function mockMatch(doc, q) {
  const eq = (a, b) =>
    ((a === null || a === undefined) && (b === null || b === undefined)) ||
    (a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b));
  return Object.entries(q || {}).every(([k, v]) => {
    if (k === '$or') {return v.some((sub) => mockMatch(doc, sub));}
    const vals = mockValues(doc, k);
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      if ('$ne' in v) {return !vals.some((x) => eq(x, v.$ne));}
      if ('$in' in v) {return vals.some((x) => v.$in.some((y) => eq(x, y)));}
    }
    return vals.some((x) => eq(x, v));
  });
}

function mockChain(get) {
  let sortDesc = false;
  const chain = {
    select: () => chain,
    lean: () => chain,
    sort: (s) => {
      sortDesc = Object.values(s || {})[0] === -1;
      return chain;
    },
    then: (res, rej) => Promise.resolve().then(() => get(sortDesc)).then(res, rej),
  };
  return chain;
}

function mockModel(name, { unique = [] } = {}) {
  mockDb[name] = [];
  function Model(data = {}) {
    Object.assign(this, { history: [], emails: [], payments: [], tags: [] }, data);
    if (!this._id) {
      mockSeq += 1;
      this._id = `${name}-${mockSeq}`;
    }
    if (!this.createdAt) {this.createdAt = new Date(Date.now() + mockSeq);}
  }
  Model.prototype.save = async function save() {
    unique.forEach((f) => {
      if (this[f] === undefined || this[f] === null) {return;}
      if (mockDb[name].some((d) => d !== this && d[f] === this[f])) {
        const err = new Error('E11000 duplicate key');
        err.code = 11000;
        throw err;
      }
    });
    if (!mockDb[name].includes(this)) {mockDb[name].push(this);}
    return this;
  };
  Model.create = async (data) => new Model(data).save();
  Model.find = jest.fn((q) =>
    mockChain((desc) => {
      const r = mockDb[name].filter((d) => mockMatch(d, q));
      return desc ? r.reverse() : r;
    })
  );
  Model.findOne = jest.fn((q) =>
    mockChain((desc) => {
      const r = mockDb[name].filter((d) => mockMatch(d, q));
      return (desc ? r[r.length - 1] : r[0]) || null;
    })
  );
  Model.findById = jest.fn((id) =>
    mockChain(() => mockDb[name].find((d) => String(d._id) === String(id)) || null)
  );
  return Model;
}

jest.mock('../src/models/User', () => mockModel('User'));
jest.mock('../src/models/Book', () => mockModel('Book'));
jest.mock('../src/models/Package', () => mockModel('Package'));
jest.mock('../src/models/ClubMonth', () => mockModel('ClubMonth'));
jest.mock('../src/models/Purchase', () => {
  const M = mockModel('Purchase', { unique: ['transactionId'] });
  M.findOneAndUpdate = jest.fn(async (filter, update) => {
    let doc = mockDb.Purchase.find((d) => mockMatch(d, filter));
    if (!doc) {
      doc = new M({ ...filter, ...(update.$setOnInsert || {}) });
      mockDb.Purchase.push(doc);
    }
    Object.assign(doc, update.$set || {});
    return doc;
  });
  return M;
});
jest.mock('../src/crm/models/CrmClient', () => mockModel('CrmClient'));
jest.mock('../src/crm/models/CrmOrder', () => mockModel('CrmOrder', { unique: ['storeTxId'] }));
jest.mock('../src/crm/models/CrmProduct', () => mockModel('CrmProduct'));
jest.mock('../src/crm/models/CrmEvent', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/crm/models/CrmBalanceOp', () => ({ create: jest.fn() }));
jest.mock('../src/crm/models/CrmCounter', () => {
  let n = 1000;
  return {
    nextOrderNum: jest.fn(async () => {
      n += 1;
      return n;
    }),
  };
});
jest.mock('../src/services/google-play.service', () => ({}));
jest.mock('../src/services/push.service', () => ({ sendToUser: jest.fn() }));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const User = require('../src/models/User');
const Book = require('../src/models/Book');
const Package = require('../src/models/Package');
const Purchase = require('../src/models/Purchase');
const CrmClient = require('../src/crm/models/CrmClient');
const CrmProduct = require('../src/crm/models/CrmProduct');
const CrmCounter = require('../src/crm/models/CrmCounter');
const logger = require('../src/config/logger');
const { applyTransaction } = require('../src/services/purchase.service');
const ingest = require('../src/crm/services/store-ingest.service');
const access = require('../src/crm/services/access.service');

const orders = () => mockDb.CrmOrder;
const clients = () => mockDb.CrmClient;

async function makeUser(extra = {}) {
  return User.create({
    email: 'Anna@Mail.ru',
    name: 'Анна',
    subscriptionStatus: 'free',
    subscriptionPlan: null,
    subscriptionExpiresAt: null,
    clubMonthsEntitled: [],
    tier2MonthsEntitled: [],
    purchasedBooks: [],
    purchasedPackages: [],
    ...extra,
  });
}

function tx(productId, extra = {}) {
  return {
    productId,
    originalTransactionId: 'otx-1',
    transactionId: 'tx-1',
    purchaseDate: new Date(2026, 10, 3).getTime(),
    expiresDate: new Date(2099, 0, 1).getTime(),
    price: 9990,
    currency: 'USD',
    environment: 'Production',
    ...extra,
  };
}

beforeEach(() => {
  Object.keys(mockDb).forEach((k) => {
    mockDb[k].length = 0;
  });
  jest.clearAllMocks();
});

/* ------------------------------ C1 ------------------------------ */

describe('C1: покупка в приложении → заказ CRM', () => {
  test('покупка Apple → клиентка (связана, почта) + заказ «Оплачен» App Store', async () => {
    const user = await makeUser();
    const res = await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });

    expect(res.clubMonthsEntitled).toContain('2026-11');
    expect(clients()).toHaveLength(1);
    expect(clients()[0]).toMatchObject({ appUserId: user._id, primaryEmail: 'anna@mail.ru' });
    expect(clients()[0].emails).toEqual([{ email: 'anna@mail.ru', source: 'app' }]);

    expect(orders()).toHaveLength(1);
    const o = orders()[0];
    const purchase = mockDb.Purchase[0];
    expect(o).toMatchObject({
      num: expect.any(Number),
      clientId: clients()[0]._id,
      status: 'paid',
      source: 'app_store',
      price: 9.99,
      cur: 'USD',
      purchaseId: purchase._id,
      storeTxId: 'tx-1',
      storeProductId: 'club.basic.monthly',
      storeUnmatched: true,
      productTitle: 'Клуб · месяц',
    });
    expect(o.payments).toEqual([
      expect.objectContaining({ method: 'app_store', amount: 9.99, cur: 'USD', extId: 'tx-1' }),
    ]);
  });

  test('повтор той же транзакции (verify + вебхук) — без дубля', async () => {
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    expect(orders()).toHaveLength(1);
    expect(clients()).toHaveLength(1);
  });

  test('продление (новый transactionId) → второй заказ той же клиентке', async () => {
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    await applyTransaction({
      userId: user._id,
      decodedTransaction: tx('club.basic.monthly', {
        transactionId: 'tx-2',
        purchaseDate: new Date(2026, 11, 3).getTime(),
      }),
    });
    expect(orders()).toHaveLength(2);
    expect(orders().map((o) => o.storeTxId)).toEqual(['tx-1', 'tx-2']);
    expect(new Set(orders().map((o) => String(o.clientId))).size).toBe(1);
    expect(orders()[0].num).not.toBe(orders()[1].num);
    // Одна запись Purchase на подписку — у обоих заказов.
    expect(mockDb.Purchase).toHaveLength(1);
    expect(String(orders()[1].purchaseId)).toBe(String(mockDb.Purchase[0]._id));
  });

  test('club.premium.* → заказ «Тариф 2»; с продуктом CRM — сопоставлен', async () => {
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.premium.monthly') });
    expect(orders()[0].productTitle).toBe('Тариф 2 (клуб + встречи) · месяц');
    expect(user.tier2MonthsEntitled).toContain('2026-11');

    const product = await CrmProduct.create({ name: 'Тариф 2', appleProductId: 'club.premium.monthly' });
    await applyTransaction({
      userId: user._id,
      decodedTransaction: tx('club.premium.monthly', { transactionId: 'tx-2' }),
    });
    expect(orders()[1]).toMatchObject({
      productId: product._id,
      productTitle: 'Тариф 2',
      storeUnmatched: false,
    });
  });

  test('возврат (refunded) → заказ в «Возврат», новый не создаётся, доступ снят applyTransaction', async () => {
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    const res = await applyTransaction({
      userId: user._id,
      decodedTransaction: tx('club.basic.monthly'),
      statusOverride: 'refunded',
      gracePeriodExpiresAt: null,
    });
    expect(res.clubMonthsEntitled).not.toContain('2026-11');
    expect(orders()).toHaveLength(1);
    expect(orders()[0]).toMatchObject({ status: 'refund' });
    expect(orders()[0].refund).toMatchObject({ amount: 9.99, mode: 'money' });
    expect(orders()[0].history.map((h) => h.text).join(' ')).toMatch(/Возврат/);
  });

  test('возврат по покупке, которой нет в CRM → заказ сразу «Возврат»', async () => {
    const user = await makeUser();
    await applyTransaction({
      userId: user._id,
      decodedTransaction: tx('club.basic.monthly', { revocationDate: Date.now() }),
    });
    expect(orders()).toHaveLength(1);
    expect(orders()[0].status).toBe('refund');
  });

  test('expired без заказа — заказ не создаётся (оплаты не было/не наша)', async () => {
    const user = await makeUser();
    await applyTransaction({
      userId: user._id,
      decodedTransaction: tx('club.basic.monthly', { expiresDate: Date.now() - 1000 }),
    });
    expect(orders()).toHaveLength(0);
  });

  test('ошибка CRM не ломает покупку', async () => {
    const user = await makeUser();
    CrmCounter.nextOrderNum.mockRejectedValueOnce(new Error('crm down'));
    const res = await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    expect(res.clubMonthsEntitled).toContain('2026-11');
    expect(res.subscriptionStatus).toBe('basic');
    expect(mockDb.Purchase).toHaveLength(1);
    expect(orders()).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith(
      'CRM ingestStorePurchase error',
      expect.objectContaining({ message: 'crm down' })
    );
  });

  test('sandbox в CRM не пишется', async () => {
    const user = await makeUser();
    await applyTransaction({
      userId: user._id,
      decodedTransaction: tx('club.basic.monthly', { environment: 'Sandbox' }),
    });
    expect(mockDb.Purchase[0].environment).toBe('sandbox');
    expect(orders()).toHaveLength(0);
    expect(clients()).toHaveLength(0);
  });

  test('клиентка с этой почтой уже есть (оплачивала на сайте) — связывается, новая не заводится', async () => {
    const existing = await CrmClient.create({
      name: 'Анна С.',
      emails: [{ email: 'anna@mail.ru', source: 'site' }],
      primaryEmail: 'anna@mail.ru',
      appUserId: null,
      mergedInto: null,
    });
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    expect(clients()).toHaveLength(1);
    expect(existing.appUserId).toBe(user._id);
    expect(String(orders()[0].clientId)).toBe(String(existing._id));
  });

  test('Google Play: source/method google_play, продление — по сроку периода', async () => {
    const user = await makeUser();
    const g = (exp) =>
      tx('club.basic.monthly', {
        transactionId: 'gtoken',
        originalTransactionId: 'gtoken',
        expiresDate: exp,
        price: undefined,
      });
    const exp1 = new Date(2099, 0, 1).getTime();
    await applyTransaction({ userId: user._id, decodedTransaction: g(exp1), platform: 'google' });
    await applyTransaction({ userId: user._id, decodedTransaction: g(exp1), platform: 'google' });
    await applyTransaction({
      userId: user._id,
      decodedTransaction: g(new Date(2099, 1, 1).getTime()),
      platform: 'google',
    });
    expect(orders()).toHaveLength(2);
    expect(orders()[0]).toMatchObject({ source: 'google_play', price: 0 });
    expect(orders()[0].payments[0].method).toBe('google_play');
  });

  test('applyOrder не выдаёт доступ по заказу стора (права уже у applyTransaction)', async () => {
    const product = await CrmProduct.create({
      name: 'Клуб месяц',
      appleProductId: 'club.basic.monthly',
      grant: { type: 'month' },
    });
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    expect(String(orders()[0].productId)).toBe(String(product._id));
    const r = await access.applyOrder(orders()[0]);
    expect(r).toEqual({ action: 'noop', reason: 'external_purchase' });
  });
});

/* ------------------------------ C2 ------------------------------ */

describe('C2: сопоставление продукта и L8', () => {
  test('нет продукта CRM → storeUnmatched + название из productId; появился — сопоставляется при повторе', async () => {
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('book.anna-karenina') });
    expect(orders()[0]).toMatchObject({
      storeUnmatched: true,
      productTitle: 'Разбор anna-karenina',
      productId: null,
    });
    // «Сегодня»: выбрать несопоставленные можно запросом по флагу.
    expect(mockDb.CrmOrder.filter((o) => mockMatch(o, { storeUnmatched: true }))).toHaveLength(1);

    const p = await CrmProduct.create({ name: 'Анна Каренина', appleProductId: 'book.anna-karenina' });
    await applyTransaction({ userId: user._id, decodedTransaction: tx('book.anna-karenina') });
    expect(orders()).toHaveLength(1);
    expect(orders()[0]).toMatchObject({ storeUnmatched: false, productId: p._id, productTitle: 'Анна Каренина' });
  });

  test('storeWarnings: разбор без appleProductId → предупреждение, с ним — нет', async () => {
    await Book.create({ bookSlug: 'atlant', title: 'Атлант', appleProductId: null });
    await Book.create({ bookSlug: 'war', title: 'Война и мир', appleProductId: 'book.war' });
    const w = await ingest.storeWarnings({ grant: { type: 'book', bookSlugs: ['atlant', 'war', 'nope'] } });
    expect(w.map((x) => x.slug)).toEqual(['atlant', 'nope']);
    expect(w[0]).toMatchObject({ code: 'not_in_app_store', kind: 'book' });
    expect(w[0].text).toMatch(/Атлант.*App Store/);

    expect(await ingest.storeWarnings({ grant: { type: 'month' } })).toEqual([]);
  });

  test('storeWarnings: пакет без appleProductId; productsWithStoreWarnings для «Сегодня»', async () => {
    await Package.create({ packageSlug: 'dost', title: 'Достоевский', appleProductId: null });
    await Package.create({ packageSlug: 'tol', title: 'Толстой', appleProductId: 'package.tol' });
    await CrmProduct.create({ name: 'Факультатив Д', active: true, archivedAt: null, grant: { type: 'pack', packageSlug: 'dost' } });
    await CrmProduct.create({ name: 'Факультатив Т', active: true, archivedAt: null, grant: { type: 'pack', packageSlug: 'tol' } });
    const list = await ingest.productsWithStoreWarnings();
    expect(list.map((x) => x.name)).toEqual(['Факультатив Д']);
    expect(list[0].warnings[0]).toMatchObject({ kind: 'pack', slug: 'dost' });
  });
});

/* ------------------------------ C3 ------------------------------ */

describe('C3: перенос прошлых покупок', () => {
  async function seed() {
    const user = await makeUser();
    const other = await makeUser({ email: 'olga@mail.ru', name: 'Ольга' });
    await Purchase.create({ userId: user._id, itemType: 'subscription', itemId: 'monthly', platform: 'apple', environment: 'production', transactionId: 'otx-a', appleProductId: 'club.basic.monthly', priceUsd: 9.99, status: 'expired', purchasedAt: new Date(2026, 8, 1) });
    await Purchase.create({ userId: user._id, itemType: 'book', itemId: 'war', platform: 'apple', environment: 'production', transactionId: 'otx-b', appleProductId: 'book.war', priceUsd: 4.99, status: 'refunded', purchasedAt: new Date(2026, 8, 2) });
    await Purchase.create({ userId: other._id, itemType: 'subscription', itemId: 'monthly', platform: 'google', environment: 'production', transactionId: 'gtok', appleProductId: 'club.basic.monthly', priceUsd: null, status: 'active', purchasedAt: new Date(2026, 9, 1) });
    await Purchase.create({ userId: user._id, itemType: 'subscription', itemId: 'monthly', platform: 'apple', environment: 'sandbox', transactionId: 'otx-sb', appleProductId: 'club.basic.monthly', status: 'active' });
    await Purchase.create({ userId: other._id, itemType: 'book', itemId: 'war', platform: 'web', environment: 'production', transactionId: 'manual-book-x', status: 'active' });
    await Purchase.create({ userId: other._id, itemType: 'book', itemId: 'war', platform: 'web', environment: 'production', transactionId: 'crm-abc-book-war', status: 'active' });
    return { user, other };
  }

  test('сухой прогон считает и ничего не пишет', async () => {
    await seed();
    const s = await ingest.backfillStorePurchases({ apply: false });
    expect(s).toMatchObject({ total: 6, store: 3, admin: 1, sandbox: 1, crm: 1, exists: 0 });
    expect(orders()).toHaveLength(0);
  });

  test('запись: стор → заказы (возврат — «Возврат»), web → admin/free; повтор — без дублей', async () => {
    await seed();
    const s1 = await ingest.backfillStorePurchases({ apply: true });
    expect(s1).toMatchObject({ store: 3, admin: 1, sandbox: 1, crm: 1, errors: 0 });
    expect(orders()).toHaveLength(4);

    const byTx = (id) => orders().find((o) => o.storeTxId === id);
    expect(byTx('otx-a')).toMatchObject({ status: 'paid', source: 'app_store', price: 9.99 });
    expect(byTx('otx-b')).toMatchObject({ status: 'refund', source: 'app_store' });
    expect(byTx('gtok')).toMatchObject({ status: 'paid', source: 'google_play', price: 0 });
    const admin = orders().find((o) => o.source === 'admin');
    expect(admin).toMatchObject({ status: 'free', price: 0, productTitle: 'Ручная выдача: разбор war' });
    expect(clients()).toHaveLength(2);

    const s2 = await ingest.backfillStorePurchases({ apply: true });
    expect(s2).toMatchObject({ store: 0, admin: 0, exists: 4 });
    expect(orders()).toHaveLength(4);
  });

  test('перенос после живой покупки — заказ по этой покупке уже есть, не дублируется', async () => {
    const user = await makeUser();
    await applyTransaction({ userId: user._id, decodedTransaction: tx('club.basic.monthly') });
    const s = await ingest.backfillStorePurchases({ apply: true });
    expect(s).toMatchObject({ store: 0, exists: 1 });
    expect(orders()).toHaveLength(1);
  });
});
