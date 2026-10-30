/**
 * Жалобы на пользовательский контент и модерация (UPDATES-PLAN A1, C2)
 * + лог отказов 4xx (B3).
 *
 * Проверяем:
 * - POST /api/reports — жалоба на отзыв (+1 reportCount) и на профиль,
 *   повтор не дублирует и не увеличивает счётчик, на своё — 400;
 * - POST /api/admin/reports/:id/action — hide_content скрывает отзыв,
 *   ban_user по жалобе на отзыв банит автора, hide_content не к отзыву — 400;
 * - POST /api/admin/reviews/:id/hide — скрытие отзыва Анной;
 * - logClientErrors — на 4xx пишет путь, статус, код ошибки, id пользователя,
 *   без тела запроса; на 2xx и 5xx молчит.
 *
 * БД не нужна: модели подменены jest.mock, запросы идут в мини-express.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/Review', () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  aggregate: jest.fn(),
}));
jest.mock('../src/models/Book', () => ({ updateOne: jest.fn() }));
jest.mock('../src/models/User', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../src/models/Report', () => ({ create: jest.fn(), findById: jest.fn() }));
jest.mock('../src/models/ChatMessage', () => ({ findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({}));
jest.mock('../src/models/QAQuestion', () => ({}));
jest.mock('../src/models/Quote', () => ({}));
jest.mock('../src/socket', () => ({ emitToClub: jest.fn() }));
jest.mock('../src/jobs/weekly-report', () => ({ runWeeklyReports: jest.fn() }));
jest.mock('../src/jobs/monthly-report', () => ({ runMonthlyReports: jest.fn() }));
jest.mock('../src/services/push.service', () => ({ sendToUser: jest.fn() }));
jest.mock('../src/middleware/subscription', () => ({
  requireAdmin: (_req, _res, next) => next(),
}));
// Авторизация: id пользователя — в заголовке x-test-user.
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
    optionalAuth: (req, _res, next) => {
      const id = req.headers['x-test-user'];
      req.user = id ? { userId: id } : null;
      return next();
    },
  };
});

const express = require('express');
const logger = require('../src/config/logger');
const Review = require('../src/models/Review');
const Book = require('../src/models/Book');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const contentReportRoutes = require('../src/routes/content-reports');
const adminRoutes = require('../src/routes/admin');
const { requireAuth } = require('../src/middleware/auth');
const { logClientErrors } = require('../src/middleware/request-log');
const { errorHandler, AppError } = require('../src/middleware/error');

/* ----------------------------- helpers ----------------------------- */

const ME = '64a000000000000000000001';
const AUTHOR = '64a000000000000000000002';
const REVIEW_ID = '64c000000000000000000001';
const BOOK_ID = '64b000000000000000000001';
const REPORT_ID = '64d000000000000000000001';

function chain(value) {
  const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  ['populate', 'sort', 'skip', 'limit', 'select', 'lean'].forEach((m) => {
    q[m] = jest.fn(() => q);
  });
  return q;
}

function reportDoc(fields) {
  const doc = { status: 'pending', clubMonthId: null, ...fields };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
}

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api', logClientErrors);
  app.use('/api/reports', contentReportRoutes);
  app.use('/api/admin', adminRoutes);
  // Для проверки лога: авторизованный 403 и 500.
  app.get('/api/test/forbidden', requireAuth, (_req, _res, next) =>
    next(new AppError('SUBSCRIPTION_REQUIRED', 'Нет доступа', 403))
  );
  app.get('/api/test/boom', (_req, _res, next) => next(new Error('boom')));
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
  Review.aggregate.mockResolvedValue([]);
  Book.updateOne.mockResolvedValue({});
  Review.updateOne.mockResolvedValue({});
});

async function call(method, path, { user, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (user) {
    headers['x-test-user'] = user;
  }
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

/* -------------------------- POST /api/reports ---------------------- */

describe('POST /api/reports', () => {
  test('жалоба на отзыв создаётся и увеличивает reportCount', async () => {
    Review.findById.mockReturnValue(chain({ _id: REVIEW_ID, userId: AUTHOR }));
    Report.create.mockResolvedValue({ _id: REPORT_ID });

    const res = await call('POST', '/api/reports', {
      user: ME,
      body: { targetType: 'review', targetId: REVIEW_ID, reason: 'offensive' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reported: true, reportId: REPORT_ID });
    expect(Report.create).toHaveBeenCalledWith({
      reporterUserId: ME,
      targetType: 'review',
      targetId: REVIEW_ID,
      reason: 'offensive',
      comment: '',
    });
    expect(Review.updateOne).toHaveBeenCalledWith(
      { _id: REVIEW_ID },
      { $inc: { reportCount: 1 } }
    );
  });

  test('повторная жалоба — успех без дубля и без +1 к счётчику', async () => {
    Review.findById.mockReturnValue(chain({ _id: REVIEW_ID, userId: AUTHOR }));
    Report.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    const res = await call('POST', '/api/reports', {
      user: ME,
      body: { targetType: 'review', targetId: REVIEW_ID, reason: 'spam' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ reported: true, duplicate: true });
    expect(Review.updateOne).not.toHaveBeenCalled();
  });

  test('на свой отзыв — 400', async () => {
    Review.findById.mockReturnValue(chain({ _id: REVIEW_ID, userId: ME }));
    const res = await call('POST', '/api/reports', {
      user: ME,
      body: { targetType: 'review', targetId: REVIEW_ID, reason: 'spam' },
    });
    expect(res.status).toBe(400);
    expect(Report.create).not.toHaveBeenCalled();
  });

  test('отзыв не найден — 404', async () => {
    Review.findById.mockReturnValue(chain(null));
    const res = await call('POST', '/api/reports', {
      user: ME,
      body: { targetType: 'review', targetId: REVIEW_ID, reason: 'spam' },
    });
    expect(res.status).toBe(404);
  });

  test('жалоба на профиль', async () => {
    User.findById.mockReturnValue(chain({ _id: AUTHOR, isDeleted: false }));
    Report.create.mockResolvedValue({ _id: REPORT_ID });

    const res = await call('POST', '/api/reports', {
      user: ME,
      body: { targetType: 'profile', targetId: AUTHOR, reason: 'inappropriate', comment: 'фото' },
    });

    expect(res.status).toBe(200);
    expect(Report.create).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'profile', targetId: AUTHOR, comment: 'фото' })
    );
  });

  test('на свой профиль — 400', async () => {
    const res = await call('POST', '/api/reports', {
      user: ME,
      body: { targetType: 'profile', targetId: ME, reason: 'spam' },
    });
    expect(res.status).toBe(400);
  });

  test.each([
    ['пост ленты (до R5)', { targetType: 'feed_post', targetId: REVIEW_ID, reason: 'spam' }],
    ['неизвестная причина', { targetType: 'review', targetId: REVIEW_ID, reason: 'boring' }],
    ['невалидный id', { targetType: 'review', targetId: 'x', reason: 'spam' }],
  ])('невалидное тело (%s) — 400', async (_label, body) => {
    const res = await call('POST', '/api/reports', { user: ME, body });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('без авторизации — 401', async () => {
    const res = await call('POST', '/api/reports', {
      body: { targetType: 'review', targetId: REVIEW_ID, reason: 'spam' },
    });
    expect(res.status).toBe(401);
  });
});

/* -------------------- админка: действия по жалобе ------------------ */

describe('POST /api/admin/reports/:id/action', () => {
  test('hide_content скрывает отзыв и пересчитывает рейтинг', async () => {
    const report = reportDoc({ targetType: 'review', targetId: REVIEW_ID });
    Report.findById.mockResolvedValue(report);
    Review.findByIdAndUpdate.mockReturnValue(
      chain({ _id: REVIEW_ID, bookId: BOOK_ID, isHidden: true })
    );

    const res = await call('POST', `/api/admin/reports/${REPORT_ID}/action`, {
      user: ME,
      body: { action: 'hide_content' },
    });

    expect(res.status).toBe(200);
    expect(Review.findByIdAndUpdate).toHaveBeenCalledWith(
      REVIEW_ID,
      { $set: { isHidden: true } },
      { new: true }
    );
    expect(Book.updateOne).toHaveBeenCalledWith(
      { _id: BOOK_ID },
      { $set: { rating: 0, reviewCount: 0 } }
    );
    expect(report.status).toBe('resolved');
    expect(report.actionTaken).toBe('hide_content');
    expect(report.save).toHaveBeenCalled();
  });

  test('hide_content не к отзыву — 400, жалоба не закрыта', async () => {
    const report = reportDoc({ targetType: 'message', targetId: REVIEW_ID });
    Report.findById.mockResolvedValue(report);

    const res = await call('POST', `/api/admin/reports/${REPORT_ID}/action`, {
      user: ME,
      body: { action: 'hide_content' },
    });

    expect(res.status).toBe(400);
    expect(report.save).not.toHaveBeenCalled();
  });

  test('ban_user по жалобе на отзыв банит автора отзыва', async () => {
    const report = reportDoc({ targetType: 'review', targetId: REVIEW_ID });
    Report.findById.mockResolvedValue(report);
    Review.findById.mockReturnValue(chain({ userId: AUTHOR }));
    User.updateOne.mockResolvedValue({});

    const res = await call('POST', `/api/admin/reports/${REPORT_ID}/action`, {
      user: ME,
      body: { action: 'ban_user' },
    });

    expect(res.status).toBe(200);
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: AUTHOR },
      { $set: { isBanned: true } }
    );
  });
});

describe('POST /api/admin/reviews/:id/hide', () => {
  test('скрывает отзыв', async () => {
    Review.findByIdAndUpdate.mockReturnValue(
      chain({ _id: REVIEW_ID, bookId: BOOK_ID, isHidden: true })
    );
    Review.aggregate.mockResolvedValue([{ avg: 4, count: 1 }]);

    const res = await call('POST', `/api/admin/reviews/${REVIEW_ID}/hide`, { user: ME });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      review: { id: REVIEW_ID, bookId: BOOK_ID, isHidden: true },
    });
    expect(Book.updateOne).toHaveBeenCalledWith(
      { _id: BOOK_ID },
      { $set: { rating: 4, reviewCount: 1 } }
    );
  });

  test('нет такого отзыва — 404', async () => {
    Review.findByIdAndUpdate.mockReturnValue(chain(null));
    const res = await call('POST', `/api/admin/reviews/${REVIEW_ID}/hide`, { user: ME });
    expect(res.status).toBe(404);
  });
});

/* ------------------------- B3: лог отказов 4xx --------------------- */

describe('logClientErrors', () => {
  function warnCalls() {
    return logger.warn.mock.calls.filter(([msg]) => msg === 'API 4xx');
  }

  test('403 — путь без query, код ошибки, id пользователя; тела нет', async () => {
    await call('GET', '/api/test/forbidden?token=secret', { user: ME });

    const calls = warnCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      method: 'GET',
      path: '/api/test/forbidden',
      status: 403,
      code: 'SUBSCRIPTION_REQUIRED',
      userId: ME,
    });
  });

  test('401 без авторизации — userId null, тело запроса не пишется', async () => {
    await call('POST', '/api/reports', {
      body: { targetType: 'review', targetId: REVIEW_ID, reason: 'spam', comment: 'секрет' },
    });

    const calls = warnCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ status: 401, code: 'UNAUTHORIZED', userId: null });
    expect(JSON.stringify(calls[0][1])).not.toContain('секрет');
  });

  test('2xx и 5xx не пишутся', async () => {
    Review.findByIdAndUpdate.mockReturnValue(
      chain({ _id: REVIEW_ID, bookId: BOOK_ID, isHidden: true })
    );
    await call('POST', `/api/admin/reviews/${REVIEW_ID}/hide`, { user: ME });
    await call('GET', '/api/test/boom');

    expect(warnCalls()).toHaveLength(0);
  });
});
