/**
 * Пуш о покупке (UPDATES-PLAN K0, K1, K3, 15.11.2026).
 *
 * K0: pushSettings.offers — в схеме по умолчанию false, меняется через
 *     PATCH /api/profile/push-settings { offers }, в профиле всегда boolean
 *     (у старых аккаунтов поля нет → false).
 * K1: sendPurchase — только pushSettings.offers === true, data плоскими
 *     строками { type:'purchase', targetKind, targetId? }, аудитории
 *     no_current_club / not_bought_book; POST /api/admin/news с target.
 * K3: Android получает только нейтральный androidBody; пуст → на Android не
 *     уходит (и в ленту такой пользователь с андроидом не попадает).
 *
 * БД, APNs и FCM подменены jest.mock.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../src/models/Notification', () => ({ insertMany: jest.fn() }));
jest.mock('../src/services/fcm.service', () => ({
  sendToTokens: jest.fn(async (tokens) => ({ sent: tokens.length, dead: [] })),
}));

const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const fcm = require('../src/services/fcm.service');
const push = require('../src/services/push.service');

const ios = (t) => ({ platform: 'ios', token: t });
const android = (t) => ({ platform: 'android', token: t });
const ON = { offers: true };

function chain(value) {
  const q = {
    calls: {},
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  ['populate', 'sort', 'skip', 'limit', 'select', 'lean'].forEach((m) => {
    q[m] = jest.fn((...args) => {
      q.calls[m] = args;
      return q;
    });
  });
  return q;
}

function mockUsers(users) {
  User.find.mockReturnValue(chain(users));
}

beforeEach(() => {
  jest.clearAllMocks();
  Notification.insertMany.mockResolvedValue([]);
});

/* -------------------------------- K0 -------------------------------- */

describe('K0: pushSettings.offers в схеме', () => {
  test('по умолчанию false', () => {
    const Real = jest.requireActual('../src/models/User');
    const u = new Real({ email: 'a@b.c' });
    expect(u.pushSettings.offers).toBe(false);
    // Остальные настройки не сломаны.
    expect(u.pushSettings.news).toBe(true);
  });
});

/* -------------------------------- K1 -------------------------------- */

describe('K1: purchaseData / purchaseFilter', () => {
  test('data — плоские строки, targetId только если есть', () => {
    expect(push.purchaseData({ kind: 'book', id: 'mal-princ' })).toEqual({
      type: 'purchase',
      targetKind: 'book',
      targetId: 'mal-princ',
    });
    expect(push.purchaseData({ kind: 'paywall' })).toEqual({
      type: 'purchase',
      targetKind: 'paywall',
    });
  });

  test('всегда только offers === true', () => {
    const f = push.purchaseFilter({ audience: 'all' });
    expect(f['pushSettings.offers']).toBe(true);
    expect(f.isDeleted).toEqual({ $ne: true });
  });

  test('no_current_club: без ключа текущего месяца и не admin', () => {
    const f = push.purchaseFilter({
      audience: 'no_current_club',
      currentClub: { year: 2026, month: 11 },
    });
    expect(f.clubMonthsEntitled).toEqual({ $ne: '2026-11' });
    expect(f.role).toEqual({ $ne: 'admin' });
    // Клуба нет — доступа нет ни у кого, кроме админов.
    const g = push.purchaseFilter({ audience: 'no_current_club', currentClub: null });
    expect(g.clubMonthsEntitled).toBeUndefined();
    expect(g.role).toEqual({ $ne: 'admin' });
  });

  test('not_bought_book: книги нет в purchasedBooks', () => {
    const f = push.purchaseFilter({ audience: 'not_bought_book', bookId: 'b1' });
    expect(f.purchasedBooks).toEqual({ $ne: 'b1' });
  });

  test('season: активная подписка с планом season', () => {
    const f = push.purchaseFilter({ audience: 'season' });
    expect(f.subscriptionPlan).toBe('season');
    expect(f.subscriptionStatus).toEqual({ $in: ['basic', 'premium'] });
  });
});

describe('K1/K3: sendPurchase', () => {
  test('iPhone — текст для iPhone, Android без androidBody — не шлём', async () => {
    mockUsers([
      { _id: 'i', devices: [ios('ti')], pushSettings: ON },
      { _id: 'a', devices: [android('ta')], pushSettings: ON },
      { _id: 'b', devices: [ios('tb'), android('tb2')], pushSettings: ON },
    ]);

    const r = await push.sendPurchase({
      target: { kind: 'book', id: 'mal-princ' },
      bookId: 'b1',
      audience: 'not_bought_book',
      title: 'Скидка',
      body: 'Купите разбор',
    });

    expect(r.ios).toBe(2);
    expect(r.android).toBe(0);
    expect(r.total).toBe(2);
    // FCM не вызывался — на Android ничего не ушло.
    expect(fcm.sendToTokens).not.toHaveBeenCalled();
    // В ленту — только iPhone-only (у «b» есть андроид, лента видна там).
    const feed = Notification.insertMany.mock.calls[0][0];
    expect(feed.map((n) => n.userId)).toEqual(['i']);
    expect(feed[0]).toMatchObject({
      type: 'purchase',
      body: 'Купите разбор',
      data: { type: 'purchase', targetKind: 'book', targetId: 'mal-princ' },
    });
    // Фильтр БД: offers и книга.
    const filter = User.find.mock.calls[0][0];
    expect(filter['pushSettings.offers']).toBe(true);
    expect(filter.purchasedBooks).toEqual({ $ne: 'b1' });
  });

  test('с androidBody: Android получает нейтральный текст, iPhone — свой', async () => {
    mockUsers([
      { _id: 'a', devices: [android('ta')], pushSettings: ON },
      { _id: 'b', devices: [ios('tb'), android('tb2')], pushSettings: ON },
    ]);

    const r = await push.sendPurchase({
      target: { kind: 'club' },
      title: 'Клуб',
      body: 'Оформите подписку',
      androidBody: 'В клубе новая книга',
    });

    expect(r.ios).toBe(1);
    expect(r.android).toBe(2);
    expect(r.total).toBe(2);
    const [tokens, payload] = fcm.sendToTokens.mock.calls[0];
    expect(tokens.sort()).toEqual(['ta', 'tb2']);
    expect(payload.body).toBe('В клубе новая книга');
    expect(payload.data).toEqual({ type: 'purchase', targetKind: 'club' });
    // Лента у владельцев андроида — нейтральный текст.
    const feed = Notification.insertMany.mock.calls[0][0];
    expect(feed.every((n) => n.body === 'В клубе новая книга')).toBe(true);
  });

  test('platform ios — андроид не получает даже с androidBody', async () => {
    mockUsers([{ _id: 'b', devices: [ios('tb'), android('tb2')], pushSettings: ON }]);
    const r = await push.sendPurchase({
      target: { kind: 'paywall' },
      platform: 'ios',
      title: 't',
      body: 'b',
      androidBody: 'n',
    });
    expect(r.android).toBe(0);
    expect(fcm.sendToTokens).not.toHaveBeenCalled();
  });

  test('offers выключено в документе — не шлём (страховка поверх фильтра)', async () => {
    mockUsers([{ _id: 'x', devices: [ios('t')], pushSettings: { offers: false } }]);
    const r = await push.sendPurchase({ target: { kind: 'season' }, title: 't', body: 'b' });
    expect(r.total).toBe(0);
    expect(Notification.insertMany).not.toHaveBeenCalled();
  });
});

/* ----------------------------- маршруты ----------------------------- */

describe('маршруты: /api/admin/news с target, /api/profile/push-settings', () => {
  let server;
  let baseUrl;
  let USERS;
  const ADMIN = '64a000000000000000000009';
  const ME = '64a000000000000000000001';
  let pushSvc;
  let Book;
  let ClubMonth;

  beforeAll((done) => {
    jest.resetModules();
    jest.doMock('../src/config/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }));
    jest.doMock('../src/models/User', () => ({
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    }));
    jest.doMock('../src/models/ClubMonth', () => ({ findOne: jest.fn() }));
    jest.doMock('../src/models/Book', () => ({ findOne: jest.fn() }));
    jest.doMock('../src/models/QAQuestion', () => ({}));
    jest.doMock('../src/models/ChatMessage', () => ({ ALLOWED_REACTIONS: [] }));
    jest.doMock('../src/models/Report', () => ({}));
    jest.doMock('../src/models/Quote', () => ({}));
    jest.doMock('../src/models/Review', () => ({}));
    jest.doMock('../src/services/review.service', () => ({ hideReview: jest.fn() }));
    jest.doMock('../src/jobs/weekly-report', () => ({ runWeeklyReports: jest.fn() }));
    jest.doMock('../src/jobs/monthly-report', () => ({ runMonthlyReports: jest.fn() }));
    jest.doMock('../src/socket', () => ({ emitToClub: jest.fn() }));
    jest.doMock('../src/services/image.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
    jest.doMock('../src/services/push.service', () => ({
      sendPurchase: jest.fn(async () => ({ total: 1, ios: 1, android: 0, persisted: 1, sent: 1 })),
      sendNews: jest.fn(async () => ({ total: 5, persisted: 5, sent: 5 })),
      sendToUser: jest.fn(),
    }));
    jest.doMock('../src/middleware/auth', () => {
      const { AppError } = jest.requireActual('../src/middleware/error');
      return {
        requireAuth: (req, _res, next) => {
          const id = req.headers['x-test-user'];
          if (!id) {return next(new AppError('UNAUTHORIZED', 'no', 401));}
          req.user = { userId: id };
          return next();
        },
        optionalAuth: (req, _res, next) => next(),
      };
    });

    const express = require('express');
    const UserM = require('../src/models/User');
    Book = require('../src/models/Book');
    ClubMonth = require('../src/models/ClubMonth');
    pushSvc = require('../src/services/push.service');
    const adminRoutes = require('../src/routes/admin');
    const profileRoutes = require('../src/routes/profile');
    const { errorHandler } = require('../src/middleware/error');

    USERS = {
      [ADMIN]: { _id: ADMIN, role: 'admin' },
      [ME]: { _id: ME, role: 'user', pushSettings: { news: true } },
    };
    UserM.findById.mockImplementation((id) => chain(USERS[String(id)] || null));
    UserM.findByIdAndUpdate.mockImplementation((id, update) =>
      chain({ _id: id, pushSettings: { news: true, offers: update.$set['pushSettings.offers'] } })
    );

    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
    app.use('/api/profile', profileRoutes);
    app.use(errorHandler);
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
    // Ссылка на мок для проверок ниже.
    USERS.__UserM = UserM;
  });

  afterAll((done) => {
    server.close(done);
  });

  async function call(method, path, { user, body } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (user) {headers['x-test-user'] = user;}
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  }

  test('K0: PATCH push-settings { offers: true } сохраняет ключ offers', async () => {
    const r = await call('PATCH', '/api/profile/push-settings', {
      user: ME,
      body: { offers: true },
    });
    expect(r.status).toBe(200);
    const [, update] = USERS.__UserM.findByIdAndUpdate.mock.calls.pop();
    expect(update).toEqual({ $set: { 'pushSettings.offers': true } });
    expect(r.body.data.user.pushSettings.offers).toBe(true);
  });

  test('K0: GET profile старого аккаунта без offers → offers: false, остальное как было', async () => {
    USERS[ME] = { _id: ME, role: 'user', pushSettings: { news: true } };
    const r = await call('GET', '/api/profile', { user: ME });
    expect(r.status).toBe(200);
    expect(r.body.data.user.pushSettings).toEqual({ news: true, offers: false });
  });

  test('K1: target book → bookSlug ищется, sendPurchase с bookId и androidBody', async () => {
    Book.findOne.mockReturnValue(chain({ _id: 'book1' }));
    const r = await call('POST', '/api/admin/news', {
      user: ADMIN,
      body: {
        title: 'Скидка',
        body: 'Купите разбор',
        androidBody: 'Новый разбор в каталоге',
        audience: 'not_bought_book',
        target: { kind: 'book', id: 'mal-princ' },
      },
    });
    expect(r.status).toBe(200);
    expect(Book.findOne.mock.calls[0][0]).toEqual({ bookSlug: 'mal-princ' });
    const args = pushSvc.sendPurchase.mock.calls[0][0];
    expect(args).toMatchObject({
      audience: 'not_bought_book',
      platform: 'all',
      target: { kind: 'book', id: 'mal-princ' },
      bookId: 'book1',
      body: 'Купите разбор',
      androidBody: 'Новый разбор в каталоге',
    });
    expect(pushSvc.sendNews).not.toHaveBeenCalled();
  });

  test('K1: no_current_club передаёт текущий клуб', async () => {
    const club = { _id: 'c1', year: 2026, month: 11 };
    ClubMonth.findOne.mockReturnValue(chain(club));
    const r = await call('POST', '/api/admin/news', {
      user: ADMIN,
      body: { title: 't', body: 'b', audience: 'no_current_club', target: { kind: 'club' } },
    });
    expect(r.status).toBe(200);
    expect(pushSvc.sendPurchase.mock.calls.pop()[0].currentClub).toEqual(club);
  });

  test('K1: разбор не найден → 404', async () => {
    Book.findOne.mockReturnValue(chain(null));
    const r = await call('POST', '/api/admin/news', {
      user: ADMIN,
      body: { title: 't', body: 'b', target: { kind: 'book', id: 'nope' } },
    });
    expect(r.status).toBe(404);
  });

  test.each([
    ['новая аудитория без target', { audience: 'no_current_club' }],
    ['not_bought_book с целью не book', { audience: 'not_bought_book', target: { kind: 'club' } }],
    ['book без id', { target: { kind: 'book' } }],
    ['tier2 с target', { audience: 'tier2', target: { kind: 'paywall' } }],
    ['неизвестная цель', { target: { kind: 'shop' } }],
  ])('K1: валидация — %s → 400', async (_name, extra) => {
    const r = await call('POST', '/api/admin/news', {
      user: ADMIN,
      body: { title: 't', body: 'b', ...extra },
    });
    expect(r.status).toBe(400);
    expect(pushSvc.sendPurchase).not.toHaveBeenCalled();
  });

  test('без target — обычная новость, как раньше (P7)', async () => {
    pushSvc.sendPurchase.mockClear();
    const r = await call('POST', '/api/admin/news', {
      user: ADMIN,
      body: { title: 't', body: 'b', audience: 'subscribers' },
    });
    expect(r.status).toBe(200);
    expect(pushSvc.sendNews).toHaveBeenCalled();
    expect(pushSvc.sendPurchase).not.toHaveBeenCalled();
  });
});
