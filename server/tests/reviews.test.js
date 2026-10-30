/**
 * Отзывы на разборы (UPDATES-PLAN C1/C2, A4 для отзывов).
 *
 * Проверяем:
 * - recomputeBookRating — среднее только по видимым, округление, 0 без отзывов;
 * - deleteUserReviews — удаление аккаунта стирает отзывы и пересчитывает книги;
 * - GET/POST/DELETE /api/books/:id/reviews — фильтр заблокированных, право
 *   оставить отзыв через userHasBookAccess, upsert своего, удаление своего.
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
  aggregate: jest.fn(),
  distinct: jest.fn(),
  deleteMany: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../src/models/Book', () => ({ updateOne: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/services/book-access.service', () => ({
  userHasBookAccess: jest.fn(),
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
const Review = require('../src/models/Review');
const Book = require('../src/models/Book');
const User = require('../src/models/User');
const { userHasBookAccess } = require('../src/services/book-access.service');
const {
  recomputeBookRating,
  deleteUserReviews,
  hideReview,
} = require('../src/services/review.service');
const reviewRoutes = require('../src/routes/reviews');
const { errorHandler } = require('../src/middleware/error');

/* ----------------------------- helpers ----------------------------- */

const BOOK_ID = '64b000000000000000000001';
const ME = '64a000000000000000000001';
const OTHER = '64a000000000000000000002';
const BLOCKED = '64a000000000000000000003';

// Цепочка mongoose-запроса: populate/sort/skip/limit/select/lean → тот же объект,
// await → value. calls — что вызывали (для проверок).
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

function paidBook(extra = {}) {
  return { _id: BOOK_ID, isFree: false, rating: 4.5, reviewCount: 2, ...extra };
}

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/books/:id/reviews', reviewRoutes);
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

/* ------------------------ recomputeBookRating ---------------------- */

describe('recomputeBookRating', () => {
  test('среднее по видимым отзывам, округление до 0,1', async () => {
    Review.aggregate.mockResolvedValue([{ avg: 13 / 3, count: 3 }]);

    const result = await recomputeBookRating(BOOK_ID);

    expect(result).toEqual({ rating: 4.3, reviewCount: 3 });
    const pipeline = Review.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.isHidden).toBe(false);
    expect(String(pipeline[0].$match.bookId)).toBe(BOOK_ID);
    expect(Book.updateOne).toHaveBeenCalledWith(
      { _id: BOOK_ID },
      { $set: { rating: 4.3, reviewCount: 3 } }
    );
  });

  test('нет видимых отзывов — рейтинг 0', async () => {
    Review.aggregate.mockResolvedValue([]);
    const result = await recomputeBookRating(BOOK_ID);
    expect(result).toEqual({ rating: 0, reviewCount: 0 });
    expect(Book.updateOne).toHaveBeenCalledWith(
      { _id: BOOK_ID },
      { $set: { rating: 0, reviewCount: 0 } }
    );
  });
});

describe('hideReview', () => {
  test('скрывает и пересчитывает рейтинг книги', async () => {
    Review.findByIdAndUpdate.mockReturnValue(
      chain({ _id: 'r1', bookId: BOOK_ID, isHidden: true })
    );
    const review = await hideReview('r1');
    expect(review.isHidden).toBe(true);
    expect(Review.findByIdAndUpdate).toHaveBeenCalledWith(
      'r1',
      { $set: { isHidden: true } },
      { new: true }
    );
    expect(Book.updateOne).toHaveBeenCalledTimes(1);
  });

  test('нет отзыва — null, рейтинг не трогаем', async () => {
    Review.findByIdAndUpdate.mockReturnValue(chain(null));
    expect(await hideReview('r1')).toBeNull();
    expect(Book.updateOne).not.toHaveBeenCalled();
  });
});

describe('deleteUserReviews (удаление аккаунта)', () => {
  test('стирает отзывы и пересчитывает каждую затронутую книгу', async () => {
    const B2 = '64b000000000000000000002';
    Review.distinct.mockResolvedValue([BOOK_ID, B2]);
    Review.deleteMany.mockResolvedValue({ deletedCount: 2 });

    const n = await deleteUserReviews(ME);

    expect(n).toBe(2);
    expect(Review.deleteMany).toHaveBeenCalledWith({ userId: ME });
    expect(Book.updateOne).toHaveBeenCalledTimes(2);
  });

  test('нет отзывов — ничего не делает', async () => {
    Review.distinct.mockResolvedValue([]);
    expect(await deleteUserReviews(ME)).toBe(0);
    expect(Review.deleteMany).not.toHaveBeenCalled();
    expect(Book.updateOne).not.toHaveBeenCalled();
  });
});

/* ------------------------------ GET ------------------------------- */

describe('GET /api/books/:id/reviews', () => {
  const now = new Date('2026-11-01T10:00:00Z');
  const otherReview = {
    _id: 'r2',
    rating: 5,
    text: 'Отлично',
    createdAt: now,
    updatedAt: now,
    userId: { _id: OTHER, name: 'Оля', avatarUrl: null },
  };

  test('без авторизации — только видимые, без myReview', async () => {
    Book.findOne.mockReturnValue(chain(paidBook()));
    const findQ = chain([otherReview]);
    Review.find.mockReturnValue(findQ);
    Review.countDocuments.mockResolvedValue(1);

    const res = await call('GET', `/api/books/${BOOK_ID}/reviews`);

    expect(res.status).toBe(200);
    expect(Review.find).toHaveBeenCalledWith({ bookId: BOOK_ID, isHidden: false });
    expect(res.body.data).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      hasMore: false,
      rating: 4.5,
      reviewCount: 2,
      myReview: null,
    });
    expect(res.body.data.items[0]).toEqual({
      id: 'r2',
      rating: 5,
      text: 'Отлично',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      isMine: false,
      author: { id: OTHER, name: 'Оля', avatarUrl: null },
    });
  });

  test('с авторизацией — без заблокированных мной авторов, мой отзыв отдельно', async () => {
    Book.findOne.mockReturnValue(chain(paidBook()));
    User.findById.mockReturnValue(chain({ blockedUsers: [BLOCKED] }));
    Review.findOne.mockReturnValue(
      chain({
        _id: 'r1',
        rating: 3,
        text: 'Моё',
        isHidden: true,
        createdAt: now,
        updatedAt: now,
        userId: { _id: ME, name: 'Я', avatarUrl: null },
      })
    );
    const findQ = chain([otherReview]);
    Review.find.mockReturnValue(findQ);
    Review.countDocuments.mockResolvedValue(45);

    const res = await call('GET', `/api/books/${BOOK_ID}/reviews?page=2`, { user: ME });

    expect(res.status).toBe(200);
    expect(Review.find).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      isHidden: false,
      userId: { $nin: [BLOCKED] },
    });
    expect(findQ.calls.skip).toEqual([20]);
    expect(res.body.data.hasMore).toBe(true);
    expect(res.body.data.myReview).toMatchObject({ id: 'r1', isMine: true, isHidden: true });
  });

  test('неопубликованный/несуществующий разбор — 404', async () => {
    Book.findOne.mockReturnValue(chain(null));
    const res = await call('GET', `/api/books/${BOOK_ID}/reviews`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BOOK_NOT_FOUND');
  });
});

/* ------------------------------ POST ------------------------------ */

describe('POST /api/books/:id/reviews', () => {
  function mockUpsert(review) {
    Review.findOneAndUpdate.mockReturnValue(chain(review));
  }

  test('без доступа к разбору — 403, отзыв не создаётся', async () => {
    Book.findOne.mockReturnValue(chain(paidBook()));
    User.findById.mockReturnValue(chain({ _id: ME, role: 'user' }));
    userHasBookAccess.mockResolvedValue(false);

    const res = await call('POST', `/api/books/${BOOK_ID}/reviews`, {
      user: ME,
      body: { rating: 5, text: 'Хочу' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PURCHASE_REQUIRED');
    expect(userHasBookAccess).toHaveBeenCalledTimes(1);
    expect(Review.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('с доступом — upsert своего отзыва, isHidden не трогаем, рейтинг пересчитан', async () => {
    Book.findOne.mockReturnValue(chain(paidBook()));
    User.findById.mockReturnValue(chain({ _id: ME, role: 'user' }));
    userHasBookAccess.mockResolvedValue(true);
    Review.aggregate.mockResolvedValue([{ avg: 4, count: 3 }]);
    mockUpsert({
      _id: 'r1',
      rating: 4,
      text: 'Хорошо',
      isHidden: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: { _id: ME, name: 'Я', avatarUrl: null },
    });

    const res = await call('POST', `/api/books/${BOOK_ID}/reviews`, {
      user: ME,
      body: { rating: 4, text: '  Хорошо  ' },
    });

    expect(res.status).toBe(200);
    const [filter, update, opts] = Review.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ bookId: BOOK_ID, userId: ME });
    expect(update).toEqual({ $set: { rating: 4, text: 'Хорошо' } });
    expect(opts).toMatchObject({ upsert: true, new: true });
    expect(res.body.data).toMatchObject({
      rating: 4,
      reviewCount: 3,
      review: { id: 'r1', rating: 4, isMine: true, isHidden: false },
    });
  });

  test('бесплатный разбор — доступ без userHasBookAccess', async () => {
    Book.findOne.mockReturnValue(chain(paidBook({ isFree: true })));
    User.findById.mockReturnValue(chain({ _id: ME, role: 'user' }));
    mockUpsert({ _id: 'r1', rating: 5, text: '', userId: { _id: ME, name: 'Я' } });

    const res = await call('POST', `/api/books/${BOOK_ID}/reviews`, {
      user: ME,
      body: { rating: 5 },
    });

    expect(res.status).toBe(200);
    expect(userHasBookAccess).not.toHaveBeenCalled();
  });

  test('забаненная участница — 403', async () => {
    Book.findOne.mockReturnValue(chain(paidBook({ isFree: true })));
    User.findById.mockReturnValue(chain({ _id: ME, isBanned: true }));

    const res = await call('POST', `/api/books/${BOOK_ID}/reviews`, {
      user: ME,
      body: { rating: 5 },
    });

    expect(res.status).toBe(403);
    expect(Review.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    ['оценка 0', { rating: 0 }],
    ['оценка 6', { rating: 6 }],
    ['дробная оценка', { rating: 4.5 }],
    ['текст длиннее 1000', { rating: 5, text: 'а'.repeat(1001) }],
    ['без оценки', { text: 'без оценки' }],
  ])('невалидное тело (%s) — 400', async (_label, body) => {
    const res = await call('POST', `/api/books/${BOOK_ID}/reviews`, { user: ME, body });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('без авторизации — 401', async () => {
    const res = await call('POST', `/api/books/${BOOK_ID}/reviews`, { body: { rating: 5 } });
    expect(res.status).toBe(401);
  });
});

/* ----------------------------- DELETE ----------------------------- */

describe('DELETE /api/books/:id/reviews/mine', () => {
  test('удаляет свой отзыв и пересчитывает рейтинг', async () => {
    Book.findOne.mockReturnValue(chain(paidBook()));
    Review.findOneAndDelete.mockReturnValue(chain({ _id: 'r1' }));
    Review.aggregate.mockResolvedValue([{ avg: 5, count: 1 }]);

    const res = await call('DELETE', `/api/books/${BOOK_ID}/reviews/mine`, { user: ME });

    expect(res.status).toBe(200);
    expect(Review.findOneAndDelete).toHaveBeenCalledWith({ bookId: BOOK_ID, userId: ME });
    expect(res.body.data).toEqual({ deleted: true, rating: 5, reviewCount: 1 });
  });

  test('отзыва нет — успех, deleted: false, рейтинг не пересчитываем', async () => {
    Book.findOne.mockReturnValue(chain(paidBook()));
    Review.findOneAndDelete.mockReturnValue(chain(null));

    const res = await call('DELETE', `/api/books/${BOOK_ID}/reviews/mine`, { user: ME });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: false, rating: 4.5, reviewCount: 2 });
    expect(Book.updateOne).not.toHaveBeenCalled();
  });
});
