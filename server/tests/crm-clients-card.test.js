/**
 * CRM D1/D2/D4 (16.11.2026): роуты «Клиенты», карточка клиентки и «Заказы» —
 * права по матрице, журнал CrmAudit, баланс с причиной, теги, комментарии,
 * история, выгрузка CSV.
 *
 * БД не нужна: модели подменены jest.mock.
 */

const q = (value) => {
  const chain = {
    select: () => chain,
    lean: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return chain;
};

jest.mock('../src/crm/models/CrmMember', () => ({
  ROLES: ['owner', 'admin', 'marketing', 'manager'],
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../src/crm/models/CrmAudit', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/crm/models/CrmClient', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(() => Promise.resolve({})),
  updateOne: jest.fn(() => Promise.resolve({})),
  findOneAndUpdate: jest.fn(),
  collection: { name: 'crmclients' },
}));
jest.mock('../src/crm/models/CrmOrder', () => ({
  find: jest.fn(),
  aggregate: jest.fn(),
  distinct: jest.fn(() => Promise.resolve([])),
  collection: { name: 'crmorders' },
}));
jest.mock('../src/crm/models/CrmEvent', () => ({
  create: jest.fn(() => Promise.resolve({})),
  insertMany: jest.fn(() => Promise.resolve([])),
  find: jest.fn(),
  countDocuments: jest.fn(() => Promise.resolve(0)),
}));
jest.mock('../src/crm/models/CrmBalanceOp', () => ({ find: jest.fn(), create: jest.fn() }));
jest.mock('../src/crm/models/CrmProduct', () => ({ find: jest.fn() }));
jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  distinct: jest.fn(() => Promise.resolve([])),
  collection: { name: 'users' },
}));
jest.mock('../src/models/Book', () => ({ find: jest.fn() }));
jest.mock('../src/models/Package', () => ({ find: jest.fn() }));
jest.mock('../src/crm/services/settings.service', () => ({
  getCrmSettings: jest.fn(() => Promise.resolve({ rates: {} })),
}));
jest.mock('../src/crm/services/access.service', () => ({
  attachClient: jest.fn(),
  applyClientOrders: jest.fn(),
  unlinkClient: jest.fn(),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/middleware/rate-limit', () => {
  const pass = (_req, _res, next) => next();
  return { authLimiter: pass, refreshLimiter: pass, apiLimiter: pass, uploadLimiter: pass, reportLimiter: pass };
});

const express = require('express');
const CrmMember = require('../src/crm/models/CrmMember');
const CrmAudit = require('../src/crm/models/CrmAudit');
const CrmClient = require('../src/crm/models/CrmClient');
const CrmOrder = require('../src/crm/models/CrmOrder');
const CrmEvent = require('../src/crm/models/CrmEvent');
const CrmBalanceOp = require('../src/crm/models/CrmBalanceOp');
const CrmProduct = require('../src/crm/models/CrmProduct');
const User = require('../src/models/User');
const Book = require('../src/models/Book');
const Package = require('../src/models/Package');
const crmRouter = require('../src/crm/routes');
const tokenService = require('../src/crm/services/token.service');
const { errorHandler } = require('../src/middleware/error');

const CID = '64c000000000000000000001';
const UID = '64c0000000000000000000aa';
const M1 = '64c0000000000000000000f1';
const members = {
  [M1]: { _id: M1, name: 'Тамуна', email: 't@chitatel.app', role: 'manager', active: true },
  m2: { _id: 'm2', name: 'Маркетинг', email: 'mk@chitatel.app', role: 'marketing', active: true },
  m3: { _id: 'm3', name: 'Гульнара', email: 'g@chitatel.app', role: 'admin', active: true },
};
let server;
let base;
let client;

async function call(method, path, memberId, body) {
  const headers = { Authorization: `Bearer ${tokenService.signAccess(members[memberId])}` };
  if (body !== undefined) {headers['Content-Type'] = 'application/json';}
  const res = await fetch(`${base}/api/crm${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = Buffer.from(await res.arrayBuffer());
  const text = raw.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_e) {
    json = null;
  }
  return { status: res.status, body: json, text, raw, headers: res.headers };
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const audits = () => CrmAudit.create.mock.calls.map((c) => c[0]);

function makeClient(over = {}) {
  const c = {
    _id: CID,
    name: 'Мария Иванова',
    emails: [{ email: 'm@mail.ru', source: 'gk' }],
    primaryEmail: 'm@mail.ru',
    phone: '+375 29 111-22-33',
    phoneNorm: '375291112233',
    city: 'Минск',
    country: 'Беларусь',
    telegram: { username: 'maria', botSubscribed: true },
    whatsapp: true,
    appUserId: UID,
    tags: ['VIP'],
    comments: [{ _id: 'c1', memberId: M1, at: new Date('2026-11-10'), text: 'Просила рассрочку' }],
    legacyMonths: ['2026-9'],
    legacyNote: 'Абонемент до декабря',
    balance: 30,
    since: new Date('2025-01-01'),
    save: jest.fn(() => Promise.resolve()),
    set: jest.fn((path, v) => {
      if (path === 'telegram.username') {c.telegram.username = v;}
    }),
    ...over,
  };
  return c;
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/crm', crmRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  jest.clearAllMocks();
  CrmMember.findById.mockImplementation((id) => q(members[id] ? { ...members[id] } : null));
  CrmMember.find.mockImplementation(() => q([{ _id: M1, name: 'Тамуна' }]));
  client = makeClient();
  CrmClient.findById.mockImplementation(() => q(client));
  CrmClient.find.mockImplementation(() => q([]));
  CrmOrder.find.mockImplementation(() => q([]));
  CrmProduct.find.mockImplementation(() => q([]));
  CrmBalanceOp.find.mockImplementation(() => q([]));
  CrmEvent.find.mockImplementation(() => q([]));
  User.find.mockImplementation(() => q([]));
  Book.find.mockImplementation(() => q([{ _id: 'b1', title: 'Мастер и Маргарита', bookSlug: 'master' }]));
  Package.find.mockImplementation(() => q([]));
  User.findById.mockImplementation(() =>
    q({
      _id: UID,
      email: 'app@mail.ru',
      clubMonthsEntitled: ['2026-12', '2026-10', '2026-11'],
      tier2MonthsEntitled: ['2026-11'],
      purchasedBooks: ['b1'],
      purchasedPackages: [],
      subscriptionStatus: 'basic',
      subscriptionExpiresAt: new Date(Date.now() + 30 * 864e5),
    })
  );
});

describe('доступ', () => {
  test('без токена CRM — 401', async () => {
    const res = await fetch(`${base}/api/crm/clients`);
    expect(res.status).toBe(401);
  });
});

describe('GET /clients и выгрузка', () => {
  beforeEach(() => {
    CrmClient.aggregate.mockResolvedValue([
      { _id: CID, name: 'Мария Иванова', primaryEmail: 'm@mail.ru', appUserId: UID, _u: { email: 'app@mail.ru' }, _ltv: 99.5, tags: ['Акция'] },
    ]);
    CrmClient.countDocuments.mockResolvedValue(1);
  });

  test('список видят все роли, маркетинг тоже', async () => {
    const r = await call('GET', '/clients?q=Мария&seg=club&sort=-last', 'm2');
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(1);
    expect(r.body.data.seg).toBe('club');
    expect(r.body.data.items[0]).toMatchObject({ name: 'Мария Иванова', appEmail: 'app@mail.ru', ltv: 99.5 });
  });

  test('export.csv: BOM, заголовки, только выбранные id, запись в журнал', async () => {
    const r = await call('GET', `/clients/export.csv?ids=${CID},bad`, 'm2');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/csv/);
    expect(r.headers.get('content-disposition')).toMatch(/clients-\d{4}-\d{2}-\d{2}\.csv/);
    expect([...r.raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(r.text).toContain('Клиентка;Почта (ГК / сайт);Почта в приложении');
    expect(r.text).toContain('Мария Иванова;m@mail.ru;app@mail.ru');
    const match = CrmClient.aggregate.mock.calls[0][0][0].$match;
    expect(JSON.stringify(match)).toContain(CID);
    await flush();
    expect(audits()).toEqual([expect.objectContaining({ action: 'clients.export', memberId: 'm2' })]);
  });
});

describe('POST /clients/tags — тег «Акция» выбранным', () => {
  test('добавляет только тем, у кого тега нет; история и журнал', async () => {
    CrmClient.find.mockImplementation(() => q([{ _id: CID }]));
    const r = await call('POST', '/clients/tags', 'm2', { ids: [CID, '64c000000000000000000002'], add: 'Акция' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ tag: 'Акция', changed: 1, ids: [CID] });
    expect(CrmClient.find.mock.calls[0][0]).toMatchObject({ tags: { $ne: 'Акция' }, mergedInto: null });
    expect(CrmClient.updateMany).toHaveBeenCalledWith({ _id: { $in: [CID] } }, { $addToSet: { tags: 'Акция' } });
    expect(CrmEvent.insertMany).toHaveBeenCalledWith([
      { clientId: CID, who: 'Маркетинг', text: 'Добавлен тег «Акция»', type: 'tag' },
    ]);
    await flush();
    expect(audits()[0]).toMatchObject({ action: 'clients.tag.add', diff: { after: { tag: 'Акция', ids: [CID] } } });
  });

  test('«Отменить» — remove', async () => {
    CrmClient.find.mockImplementation(() => q([{ _id: CID }]));
    const r = await call('POST', '/clients/tags', M1, { ids: [CID], remove: 'Акция' });
    expect(r.status).toBe(200);
    expect(CrmClient.updateMany).toHaveBeenCalledWith({ _id: { $in: [CID] } }, { $pull: { tags: 'Акция' } });
  });

  test('add и remove вместе — 400', async () => {
    const r = await call('POST', '/clients/tags', M1, { ids: [CID], add: 'a', remove: 'b' });
    expect(r.status).toBe(400);
  });
});

describe('GET /clients/:id — карточка', () => {
  test('контакты, доступ в приложении, заказы, баланс, комментарии', async () => {
    CrmOrder.find.mockImplementation(() =>
      q([
        {
          _id: '64c0000000000000000000b1',
          num: 8921,
          clientId: CID,
          productId: null,
          productTitle: 'club.basic.monthly',
          source: 'app_store',
          status: 'paid',
          price: 12.99,
          cur: 'USD',
          payments: [],
        },
      ])
    );
    CrmBalanceOp.find.mockImplementation(() =>
      q([{ _id: 'op1', at: new Date(), amount: 30, reason: 'Перезачёт', by: M1 }])
    );
    const r = await call('GET', `/clients/${CID}`, 'm2');
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({
      name: 'Мария Иванова',
      phoneDigits: '375291112233',
      telegram: { username: 'maria', botSubscribed: true },
      whatsapp: true,
      linked: true,
      balance: 30,
      tags: ['VIP'],
    });
    expect(d.app).toMatchObject({
      email: 'app@mail.ru',
      lastSeenAt: null,
      clubMonths: ['2026-10', '2026-11', '2026-12'],
      tier2Months: ['2026-11'],
      books: [{ id: 'b1', title: 'Мастер и Маргарита', slug: 'master' }],
    });
    expect(d.access).toMatchObject({ lastMonth: '2026-12', legacyMonths: ['2026-9'], legacyNote: 'Абонемент до декабря' });
    expect(d.orders[0]).toMatchObject({ num: 8921, productUnmatched: true, app: { text: 'Выдано автоматически' } });
    expect(d.balanceOps[0]).toMatchObject({ amount: 30, reason: 'Перезачёт', who: 'Тамуна' });
    expect(d.comments[0]).toMatchObject({ text: 'Просила рассрочку', who: 'Тамуна' });
    expect(JSON.stringify(d)).not.toMatch(/код актив/i);
  });

  test('не связана — app: null; неверный id — 400; нет клиентки — 404', async () => {
    client = makeClient({ appUserId: null });
    let r = await call('GET', `/clients/${CID}`, M1);
    expect(r.body.data.app).toBeNull();
    expect(r.body.data.linked).toBe(false);

    r = await call('GET', '/clients/nope', M1);
    expect(r.status).toBe(400);
    CrmClient.findById.mockImplementation(() => q(null));
    r = await call('GET', `/clients/${CID}`, M1);
    expect(r.status).toBe(404);
  });
});

describe('PATCH /clients/:id', () => {
  test('менеджер меняет телефон и Telegram: phoneNorm, история, журнал до/после', async () => {
    const r = await call('PATCH', `/clients/${CID}`, M1, { phone: '+995 555 12-34-56', telegram: '@maria_k', city: 'Минск' });
    expect(r.status).toBe(200);
    expect(client.phone).toBe('+995 555 12-34-56');
    expect(client.phoneNorm).toBe('995555123456');
    expect(client.telegram.username).toBe('maria_k');
    expect(client.save).toHaveBeenCalled();
    expect(CrmEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CID, who: 'Тамуна', text: 'Изменены данные: Телефон, Telegram' })
    );
    await flush();
    expect(audits()[0]).toMatchObject({
      action: 'client.update',
      entityId: CID,
      diff: {
        before: { phone: '+375 29 111-22-33', telegram: 'maria' },
        after: { phone: '+995 555 12-34-56', telegram: 'maria_k' },
      },
    });
  });

  test('маркетинг: теги можно, контакты — 403', async () => {
    let r = await call('PATCH', `/clients/${CID}`, 'm2', { tags: ['VIP', 'Акция'] });
    expect(r.status).toBe(200);
    expect(client.tags).toEqual(['VIP', 'Акция']);
    expect(CrmEvent.create).toHaveBeenCalledWith(expect.objectContaining({ text: 'Добавлен тег «Акция»' }));

    r = await call('PATCH', `/clients/${CID}`, 'm2', { phone: '123' });
    expect(r.status).toBe(403);
  });

  test('чужие поля (баланс, appUserId) не принимаются', async () => {
    const r = await call('PATCH', `/clients/${CID}`, 'm3', { balance: 1000 });
    expect(r.status).toBe(400);
    expect(client.save).not.toHaveBeenCalled();
  });
});

describe('POST /clients/:id/comments', () => {
  test('любая роль, автор и журнал', async () => {
    const r = await call('POST', `/clients/${CID}/comments`, 'm2', { text: '  Подарок от подруги ' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ text: 'Подарок от подруги', who: 'Маркетинг' });
    expect(CrmClient.updateOne).toHaveBeenCalledWith(
      { _id: CID },
      { $push: { comments: expect.objectContaining({ memberId: 'm2', text: 'Подарок от подруги' }) } }
    );
    await flush();
    expect(audits()[0]).toMatchObject({ action: 'client.comment', entityId: CID });
  });

  test('пустой — 400', async () => {
    const r = await call('POST', `/clients/${CID}/comments`, M1, { text: '   ' });
    expect(r.status).toBe(400);
  });
});

describe('POST /clients/:id/balance', () => {
  test('пополнение: атомарный $inc, операция с причиной, история, журнал', async () => {
    CrmClient.findOneAndUpdate.mockImplementation(() => q({ balance: 80 }));
    CrmBalanceOp.create.mockResolvedValue({ _id: 'op9', at: new Date() });
    const r = await call('POST', `/clients/${CID}/balance`, M1, { op: 'topup', amount: '50', reason: 'Акция осени' });
    expect(r.status).toBe(200);
    expect(r.body.data.balance).toBe(80);
    expect(CrmClient.findOneAndUpdate).toHaveBeenCalledWith({ _id: CID }, { $inc: { balance: 50 } }, { new: true });
    expect(CrmBalanceOp.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CID, amount: 50, reason: 'Акция осени', by: M1 })
    );
    expect(CrmEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Пополнен баланс: 50 BYN · Акция осени', type: 'balance' })
    );
    await flush();
    expect(audits()[0]).toMatchObject({
      action: 'client.balance.topup',
      diff: { before: { balance: 30 }, after: { balance: 80, amount: 50, reason: 'Акция осени' } },
    });
  });

  test('списание больше остатка — 400, операции нет', async () => {
    CrmClient.findOneAndUpdate.mockImplementation(() => q(null));
    const r = await call('POST', `/clients/${CID}/balance`, M1, { op: 'spend', amount: 100, reason: 'Оплата заказа' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe('На балансе только 30 BYN');
    expect(CrmClient.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: CID, balance: { $gte: 100 } },
      { $inc: { balance: -100 } },
      { new: true }
    );
    expect(CrmBalanceOp.create).not.toHaveBeenCalled();
    await flush();
    expect(CrmAudit.create).not.toHaveBeenCalled();
  });

  test('операция не записалась — сумма возвращается', async () => {
    CrmClient.findOneAndUpdate.mockImplementation(() => q({ balance: 10 }));
    CrmBalanceOp.create.mockRejectedValue(new Error('db'));
    const r = await call('POST', `/clients/${CID}/balance`, M1, { op: 'spend', amount: 20, reason: 'Ошибка' });
    expect(r.status).toBe(500);
    expect(CrmClient.updateOne).toHaveBeenCalledWith({ _id: CID }, { $inc: { balance: 20 } });
  });

  test('без причины — 400; маркетинг — 403', async () => {
    let r = await call('POST', `/clients/${CID}/balance`, M1, { op: 'topup', amount: 5, reason: '' });
    expect(r.status).toBe(400);
    r = await call('POST', `/clients/${CID}/balance`, 'm2', { op: 'topup', amount: 5, reason: 'Акция' });
    expect(r.status).toBe(403);
    expect(CrmClient.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /clients/:id/history', () => {
  test('события новые сверху, имя участницы вместо id', async () => {
    CrmEvent.find.mockImplementation(() =>
      q([
        { _id: 'e2', at: new Date('2026-11-12'), who: M1, text: 'Пополнен баланс: 5 BYN · Акция' },
        { _id: 'e1', at: new Date('2026-11-01'), who: 'App Store', text: 'Заказ №8921: оплачен', orderId: 'o1' },
      ])
    );
    CrmEvent.countDocuments.mockResolvedValue(2);
    const r = await call('GET', `/clients/${CID}/history`, 'm2');
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(2);
    expect(r.body.data.items.map((e) => e.who)).toEqual(['Тамуна', 'App Store']);
  });
});

describe('GET /orders и выгрузка', () => {
  const orderDoc = {
    _id: '64c0000000000000000000b2',
    num: 8930,
    createdAt: new Date('2026-11-14'),
    clientId: CID,
    productId: null,
    productTitle: 'book.atlant',
    storeUnmatched: true,
    source: 'app_store',
    status: 'paid',
    price: 9.99,
    cur: 'USD',
    payments: [{ amount: 9.99, method: 'app_store' }],
  };

  test('вкладка, фильтры и строки; видят все роли', async () => {
    CrmOrder.aggregate
      .mockResolvedValueOnce([{ items: [orderDoc], total: [{ n: 1 }] }])
      .mockResolvedValueOnce([{ byStatus: [{ _id: 'paid', n: 1 }], received: [] }]);
    CrmClient.find.mockImplementation(() => q([{ _id: CID, name: 'Мария Иванова', appUserId: UID }]));
    const r = await call('GET', '/orders?status=paid&source=app_store&page=1', 'm2');
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.tab).toBe('paid');
    expect(d.tabs.paid).toBe(1);
    expect(d.items[0]).toMatchObject({
      num: 8930,
      clientId: CID,
      clientName: 'Мария Иванова',
      product: 'book.atlant',
      productUnmatched: true,
      app: { text: 'Выдано автоматически', tone: 'ok' },
    });
    expect(CrmOrder.aggregate.mock.calls[0][0][0].$match).toEqual({
      $and: [{ source: 'app_store' }, { status: 'paid' }],
    });
  });

  test('export.csv — колонки плана и метка «продукт не сопоставлен», журнал', async () => {
    CrmOrder.aggregate.mockResolvedValueOnce([orderDoc]);
    CrmClient.find.mockImplementation(() => q([{ _id: CID, name: 'Мария Иванова', primaryEmail: 'm@mail.ru' }]));
    // 27.11.2026: выгрузка — только с правом stats, менеджеру запрещена.
    const r = await call('GET', '/orders/export.csv?status=all', 'm3');
    expect(r.status).toBe(200);
    expect([...r.raw.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(r.text).toContain('Источник / способ;Менеджер;Доступ в приложении');
    expect(r.text).toContain('8930;2026-11-14;Мария Иванова;m@mail.ru;book.atlant (продукт не сопоставлен);9,99;USD;9,99;Оплачен;App Store;;Выдано автоматически;');
    await flush();
    expect(audits()).toEqual([expect.objectContaining({ action: 'orders.export', memberId: 'm3' })]);
  });
});
