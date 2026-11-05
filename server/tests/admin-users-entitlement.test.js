/**
 * Админка после переноса выдачи прав в entitlement.service (CRM-PLAN B1,
 * 05.11.2026): ответы и записи Purchase (platform 'web', manual-…) — те же,
 * что до переноса. Плюс B5: смена почты зовёт привязку CRM.
 *
 * БД не нужна: модели подменены jest.mock, запросы идут в мини-приложение
 * Express по HTTP.
 */

const q = (value) => {
  const chain = {
    select: () => chain,
    lean: () => chain,
    populate: () => chain,
    sort: () => chain,
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return chain;
};

jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { userId: 'admin1' };
    next();
  },
}));
jest.mock('../src/middleware/subscription', () => ({
  ...jest.requireActual('../src/middleware/subscription'),
  requireAdmin: (_req, _res, next) => next(),
}));
jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../src/models/Book', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Package', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({}));
jest.mock('../src/models/Purchase', () => ({
  create: jest.fn(() => Promise.resolve({})),
  updateMany: jest.fn(() => Promise.resolve({})),
  findOneAndUpdate: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../src/crm/services/access.service', () => ({
  linkUserSafe: jest.fn(() => Promise.resolve({ linked: 0, applied: 0 })),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const express = require('express');
const { errorHandler } = require('../src/middleware/error');
const User = require('../src/models/User');
const Book = require('../src/models/Book');
const Package = require('../src/models/Package');
const Purchase = require('../src/models/Purchase');
const { linkUserSafe } = require('../src/crm/services/access.service');
const adminUsers = require('../src/routes/admin-users');

const UID = '64b000000000000000000001';
let server;
let base;
let user;

function makeUser(extra = {}) {
  return {
    _id: UID,
    subscriptionStatus: 'free',
    subscriptionPlan: null,
    subscriptionExpiresAt: null,
    clubMonthsEntitled: [],
    tier2MonthsEntitled: [],
    purchasedBooks: [],
    purchasedPackages: [],
    save: jest.fn(() => Promise.resolve()),
    ...extra,
  };
}

async function post(path, body) {
  const res = await fetch(`${base}/api/admin/users/${UID}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/users', adminUsers);
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
  user = makeUser();
  User.findById.mockImplementation(() => q(user));
});

describe('POST /:id/subscription', () => {
  test('basic monthly: ответ, поля User и запись Purchase как раньше', async () => {
    const r = await post('/subscription', { status: 'basic', plan: 'monthly' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      ok: true,
      subscriptionStatus: 'basic',
      subscriptionPlan: 'monthly',
      subscriptionExpiresAt: user.subscriptionExpiresAt.toISOString(),
    });
    expect(user.clubMonthsEntitled).toHaveLength(1);
    expect(user.tier2MonthsEntitled).toEqual([]);
    expect(Purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: UID,
        itemType: 'subscription',
        itemId: 'monthly',
        platform: 'web',
        appleProductId: null,
        transactionId: expect.stringMatching(new RegExp(`^manual-sub-${UID}-monthly-\\d+$`)),
        status: 'active',
      })
    );
  });

  test('premium с датой: месяцы до даты и Тариф 2', async () => {
    const date = new Date(Date.now() + 70 * 86400000);
    const r = await post('/subscription', { status: 'premium', plan: 'season', expiresAt: date.toISOString() });
    expect(r.status).toBe(200);
    expect(r.body.data.subscriptionExpiresAt).toBe(date.toISOString());
    expect(user.subscriptionStatus).toBe('premium');
    expect(user.clubMonthsEntitled.length).toBeGreaterThanOrEqual(3);
    expect(user.tier2MonthsEntitled).toEqual(user.clubMonthsEntitled);
  });

  test('дата в прошлом → 400', async () => {
    const r = await post('/subscription', { status: 'basic', expiresAt: '2020-01-01' });
    expect(r.status).toBe(400);
    expect(user.save).not.toHaveBeenCalled();
  });

  test('free снимает подписку, месяцы не трогает', async () => {
    user = makeUser({
      subscriptionStatus: 'basic',
      subscriptionPlan: 'monthly',
      subscriptionExpiresAt: new Date(),
      clubMonthsEntitled: ['2026-11'],
    });
    const r = await post('/subscription', { status: 'free' });
    expect(r.body.data).toEqual({ ok: true, subscriptionStatus: 'free' });
    expect(user.subscriptionStatus).toBe('free');
    expect(user.subscriptionExpiresAt).toBeNull();
    expect(user.clubMonthsEntitled).toEqual(['2026-11']);
    expect(Purchase.create).not.toHaveBeenCalled();
  });

  test('нет пользователя → 404', async () => {
    User.findById.mockImplementation(() => q(null));
    expect((await post('/subscription', { status: 'basic' })).status).toBe(404);
  });
});

describe('разборы и пакеты', () => {
  test('grant-book: ответ, purchasedBooks, Purchase book.<slug>', async () => {
    Book.findOne.mockImplementation(() => q({ _id: 'b1', title: 'Атлант', bookSlug: 'atlant', priceUsd: 12 }));
    const r = await post('/grant-book', { bookSlug: 'atlant' });
    expect(r.body.data).toEqual({ ok: true, book: { title: 'Атлант', bookSlug: 'atlant' } });
    expect(user.purchasedBooks).toEqual(['b1']);
    expect(Purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: 'book',
        itemId: 'atlant',
        platform: 'web',
        appleProductId: 'book.atlant',
        priceUsd: 12,
        transactionId: expect.stringMatching(/^manual-book-/),
      })
    );
  });

  test('grant-book: нет разбора → 404, нет пользователя → 404', async () => {
    Book.findOne.mockImplementation(() => q(null));
    expect((await post('/grant-book', { bookSlug: 'x' })).status).toBe(404);
    Book.findOne.mockImplementation(() => q({ _id: 'b1', bookSlug: 'x' }));
    User.findById.mockImplementation(() => q(null));
    expect((await post('/grant-book', { bookSlug: 'x' })).status).toBe(404);
  });

  test('revoke-book: $pull и ручные Purchase → cancelled', async () => {
    Book.findOne.mockImplementation(() => q({ _id: 'b1', bookSlug: 'atlant' }));
    User.findByIdAndUpdate.mockResolvedValue({});
    const r = await post('/revoke-book', { bookSlug: 'atlant' });
    expect(r.body.data).toEqual({ ok: true });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(UID, { $pull: { purchasedBooks: 'b1' } });
    expect(Purchase.updateMany).toHaveBeenCalledWith(
      { userId: UID, itemType: 'book', itemId: 'atlant', platform: 'web', status: 'active' },
      { $set: { status: 'cancelled' } }
    );
  });

  test('grant-package / revoke-package', async () => {
    Package.findOne.mockImplementation(() => q({ _id: 'k1', title: 'Осень', packageSlug: 'autumn', priceUsd: 30 }));
    const g = await post('/grant-package', { packageSlug: 'autumn' });
    expect(g.body.data).toEqual({ ok: true, package: { title: 'Осень', packageSlug: 'autumn' } });
    expect(user.purchasedPackages).toEqual(['k1']);
    expect(Purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'package', appleProductId: 'package.autumn' })
    );
    User.findByIdAndUpdate.mockResolvedValue({});
    const rv = await post('/revoke-package', { packageSlug: 'autumn' });
    expect(rv.body.data).toEqual({ ok: true });
    expect(Purchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'package', itemId: 'autumn', platform: 'web' }),
      { $set: { status: 'cancelled' } }
    );
  });
});

describe('клубный месяц и Тариф 2', () => {
  test('revoke-club-month: снимает месяц, Тариф 2 и «чат остаётся»', async () => {
    User.findByIdAndUpdate.mockImplementation(() => q({ clubMonthsEntitled: ['2026-10'] }));
    const r = await post('/revoke-club-month', { month: '2026-11' });
    expect(r.body.data).toEqual({ ok: true, clubMonthsEntitled: ['2026-10'] });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      UID,
      { $pull: { clubMonthsEntitled: '2026-11', tier2MonthsEntitled: '2026-11', clubChatForever: '2026-11' } },
      { new: true }
    );
  });

  test('grant-tier2-month: без клуба → 400; с клубом — добавлен и Purchase tier2', async () => {
    expect((await post('/grant-tier2-month', { month: '2026-11' })).status).toBe(400);
    user = makeUser({ clubMonthsEntitled: ['2026-11'] });
    const r = await post('/grant-tier2-month', { month: '2026-11' });
    expect(r.body.data).toEqual({ ok: true, tier2MonthsEntitled: ['2026-11'] });
    expect(Purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'tier2', transactionId: expect.stringMatching(/^manual-tier2-/) })
    );
  });

  test('revoke-tier2-month', async () => {
    User.findByIdAndUpdate.mockImplementation(() => q({ tier2MonthsEntitled: [] }));
    const r = await post('/revoke-tier2-month', { month: '2026-11' });
    expect(r.body.data).toEqual({ ok: true, tier2MonthsEntitled: [] });
  });
});

describe('POST /:id/email (B5)', () => {
  test('после смены почты — привязка CRM', async () => {
    User.findOne.mockImplementation(() => q(null));
    const saved = { _id: UID, email: 'new@mail.ru' };
    User.findByIdAndUpdate.mockImplementation(() => q(saved));
    const r = await post('/email', { email: 'New@Mail.ru' });
    expect(r.body.data).toEqual({ ok: true, email: 'new@mail.ru' });
    expect(linkUserSafe).toHaveBeenCalledWith(saved, 'admin-email');
  });

  test('ошибка привязки ответ не ломает (linkUserSafe ничего не бросает)', async () => {
    User.findOne.mockImplementation(() => q(null));
    User.findByIdAndUpdate.mockImplementation(() => q({ _id: UID, email: 'a@b.ru' }));
    linkUserSafe.mockResolvedValueOnce(null);
    const r = await post('/email', { email: 'a@b.ru' });
    expect(r.status).toBe(200);
  });
});
