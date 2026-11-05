/**
 * Правила сообщества (UPDATES-PLAN A3, сервер; 05.11.2026).
 *
 * - POST /api/profile/ugc-rules ставит User.ugcRulesAcceptedAt (дату первого
 *   согласия не перезаписывает);
 * - GET /api/profile отдаёт ugcRulesAcceptedAt и authProvider (null у старых
 *   аккаунтов без поля), без passwordHash/refreshTokens.
 * Проверка в отзывах (403 UGC_RULES_REQUIRED) — в reviews.test.js.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
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
  };
});

const express = require('express');
const User = require('../src/models/User');
const profileRoutes = require('../src/routes/profile');
const { errorHandler } = require('../src/middleware/error');

const ME = '64a000000000000000000001';

function chain(value) {
  const q = {
    calls: {},
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  ['select', 'lean'].forEach((m) => {
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
  app.use('/api/profile', profileRoutes);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  User.updateOne.mockResolvedValue({});
});

async function call(method, path, { user } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = user;
  const res = await fetch(baseUrl + path, { method, headers });
  return { status: res.status, body: await res.json() };
}

describe('POST /api/profile/ugc-rules', () => {
  test('ставит дату согласия только если её ещё нет, отдаёт её', async () => {
    const at = new Date('2026-11-05T10:00:00Z');
    User.findById.mockReturnValue(chain({ _id: ME, ugcRulesAcceptedAt: at }));

    const res = await call('POST', '/api/profile/ugc-rules', { user: ME });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { ugcRulesAcceptedAt: at.toISOString() },
    });
    const [filter, update] = User.updateOne.mock.calls[0];
    expect(filter).toMatchObject({ _id: ME, ugcRulesAcceptedAt: null });
    expect(update.$set.ugcRulesAcceptedAt).toBeInstanceOf(Date);
  });

  test('удалённый аккаунт — 404', async () => {
    User.findById.mockReturnValue(chain({ _id: ME, isDeleted: true }));
    const res = await call('POST', '/api/profile/ugc-rules', { user: ME });
    expect(res.status).toBe(404);
  });

  test('без входа — 401', async () => {
    const res = await call('POST', '/api/profile/ugc-rules');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/profile', () => {
  test('старый аккаунт без полей — ugcRulesAcceptedAt и authProvider = null', async () => {
    User.findById.mockReturnValue(chain({ _id: ME, name: 'Мария' }));

    const res = await call('GET', '/api/profile', { user: ME });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      name: 'Мария',
      ugcRulesAcceptedAt: null,
      authProvider: null,
    });
    const q = User.findById.mock.results[0].value;
    expect(q.calls.select[0]).toBe('-passwordHash -refreshTokens');
  });

  test('почтовый вход с согласием — поля как есть', async () => {
    const at = '2026-11-05T10:00:00.000Z';
    User.findById.mockReturnValue(
      chain({ _id: ME, authProvider: 'email', ugcRulesAcceptedAt: new Date(at) })
    );

    const res = await call('GET', '/api/profile', { user: ME });

    expect(res.body.data.user).toMatchObject({ authProvider: 'email', ugcRulesAcceptedAt: at });
  });
});
