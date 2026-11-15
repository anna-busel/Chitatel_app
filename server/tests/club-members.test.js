/**
 * Участницы клуба в шапке (UPDATES-PLAN E1, 15.11.2026).
 *
 * GET /api/club/:clubMonthId/members?page:
 * - доступ — resolveClubAccess (без доступа к клубу → 403);
 * - фильтр: ключ месяца в clubMonthsEntitled ИЛИ admin, без бана/удалённых,
 *   без заблокированных мной; сортировка админы → имя; страница 50, hasMore;
 * - count кэшируется 10 минут по clubMonthId.
 *
 * БД не нужна: модели подменены jest.mock, запросы идут в мини-express.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/QAQuestion', () => ({}));
jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../src/models/ClubMonth', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/ChatMessage', () => ({ ALLOWED_REACTIONS: [] }));
jest.mock('../src/models/Report', () => ({}));
jest.mock('../src/models/Book', () => ({}));
jest.mock('../src/socket', () => ({ emitToClub: jest.fn() }));
jest.mock('../src/services/image.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
jest.mock('../src/services/voice.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
jest.mock('../src/services/club-chat-push.service', () => ({}));
jest.mock('../src/services/chat-unread.service', () => ({}));
jest.mock('../src/services/push.service', () => ({}));
jest.mock('../src/middleware/auth', () => {
  const { AppError } = jest.requireActual('../src/middleware/error');
  return {
    requireAuth: (req, _res, next) => {
      const id = req.headers['x-test-user'];
      if (!id) {
        return next(new AppError('UNAUTHORIZED', 'Токен не предоставлен', 401));
      }
      req.user = { userId: id };
      return next();
    },
    optionalAuth: (req, _res, next) => next(),
  };
});

const express = require('express');
const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const clubRoutes = require('../src/routes/club');
const { errorHandler } = require('../src/middleware/error');

const ME = '64a000000000000000000001';
const STRANGER = '64a000000000000000000007';
const BLOCKED = '64a000000000000000000003';
const CLUB = '64c000000000000000000001';

const CLUB_DOC = {
  _id: CLUB,
  year: 2026,
  month: 11,
  startsAt: new Date('2020-01-01T00:00:00Z'),
  endsAt: new Date('2035-01-01T00:00:00Z'),
};

const subscriber = (extra = {}) => ({
  subscriptionStatus: 'basic',
  subscriptionPlan: 'monthly',
  subscriptionExpiresAt: new Date('2099-01-01T00:00:00Z'),
  clubMonthsEntitled: ['2026-11'],
  role: 'user',
  isBanned: false,
  blockedUsers: [],
  ...extra,
});

let USERS;

function chain(value) {
  const q = {
    calls: {},
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  ['populate', 'sort', 'skip', 'limit', 'select', 'lean', 'collation'].forEach((m) => {
    q[m] = jest.fn((...args) => {
      q.calls[m] = args;
      return q;
    });
  });
  return q;
}

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/club', clubRoutes);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

let findQuery;

beforeEach(() => {
  jest.clearAllMocks();
  clubRoutes.membersCountCache.clear();
  USERS = {
    [ME]: subscriber({ blockedUsers: [BLOCKED] }),
    [STRANGER]: subscriber({ clubMonthsEntitled: ['2026-10'] }),
  };
  User.findById.mockImplementation((id) => chain(USERS[String(id)] || null));
  ClubMonth.findById.mockImplementation((id) =>
    chain(String(id) === CLUB ? { ...CLUB_DOC } : null)
  );
  User.countDocuments.mockResolvedValue(3);
  User.find.mockImplementation(() => {
    findQuery = chain([
      { _id: 'a1', name: 'Анна', avatarUrl: 'https://x/a.jpg', role: 'admin' },
      { _id: 'u2', name: 'Вера', role: 'user' },
    ]);
    return findQuery;
  });
});

async function call(path, user) {
  const headers = {};
  if (user) {headers['x-test-user'] = user;}
  const res = await fetch(baseUrl + path, { headers });
  return { status: res.status, body: await res.json() };
}

describe('E1: GET /api/club/:clubMonthId/members', () => {
  test('ответ {count, members, hasMore}, поля участницы', async () => {
    const r = await call(`/api/club/${CLUB}/members`, ME);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      count: 3,
      hasMore: false,
      members: [
        { id: 'a1', name: 'Анна', avatarUrl: 'https://x/a.jpg', isAdmin: true },
        { id: 'u2', name: 'Вера', avatarUrl: null, isAdmin: false },
      ],
    });
  });

  test('фильтр: месяц клуба или admin, без бана/удалённых, без заблокированных мной', async () => {
    await call(`/api/club/${CLUB}/members`, ME);
    const filter = User.find.mock.calls[0][0];
    expect(filter.$or).toEqual([{ clubMonthsEntitled: '2026-11' }, { role: 'admin' }]);
    expect(filter.isBanned).toEqual({ $ne: true });
    expect(filter.isDeleted).toEqual({ $ne: true });
    expect(filter._id.$nin.map(String)).toEqual([BLOCKED]);
    // Сортировка: админы ('admin' < 'user') → имя; страница 50 (+1 для hasMore).
    expect(findQuery.calls.sort[0]).toEqual({ role: 1, name: 1, _id: 1 });
    expect(findQuery.calls.skip[0]).toBe(0);
    expect(findQuery.calls.limit[0]).toBe(51);
    // Счётчик — без учёта блокировок.
    expect(User.countDocuments.mock.calls[0][0]._id).toBeUndefined();
  });

  test('page=2 → skip 50; 51 строка → hasMore и ровно 50 в ответе', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ _id: `u${i}`, name: `N${i}`, role: 'user' }));
    User.find.mockImplementation(() => {
      findQuery = chain(rows);
      return findQuery;
    });
    const r = await call(`/api/club/${CLUB}/members?page=2`, ME);
    expect(findQuery.calls.skip[0]).toBe(50);
    expect(r.body.data.hasMore).toBe(true);
    expect(r.body.data.members).toHaveLength(50);
  });

  test('count кэшируется: второй запрос не считает заново', async () => {
    await call(`/api/club/${CLUB}/members`, ME);
    User.countDocuments.mockResolvedValue(99);
    const r = await call(`/api/club/${CLUB}/members`, ME);
    expect(User.countDocuments).toHaveBeenCalledTimes(1);
    expect(r.body.data.count).toBe(3);
  });

  test('без доступа к клубу → 403', async () => {
    const r = await call(`/api/club/${CLUB}/members`, STRANGER);
    expect(r.status).toBe(403);
    expect(User.find).not.toHaveBeenCalled();
  });

  test('page не число → 400', async () => {
    const r = await call(`/api/club/${CLUB}/members?page=abc`, ME);
    expect(r.status).toBe(400);
  });
});
