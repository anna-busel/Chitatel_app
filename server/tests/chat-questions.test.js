/**
 * «Вопрос Анне» в чате клуба (решение Анны 15.11.2026).
 *
 * Проверяем:
 * - схема: ChatMessage.isQuestion (default false) + индекс
 *   {clubMonthId, isQuestion, createdAt}; ChatReadState.questionsSeenAt;
 * - POST /chat с isQuestion: 3 в неделю ок, 4-й → 429 QUESTION_LIMIT,
 *   сброс в понедельник 00:00 МСК, обычные сообщения без лимита, у админа
 *   флаг игнорируется (без проверки лимита, isQuestion=false);
 * - GET /chat/questions: только вопросы, новые сверху, страницы, newCount от
 *   questionsSeenAt, без доступа — 403;
 * - POST /chat/questions/seen — questionsSeenAt = now (upsert);
 * - GET /chat/questions/remaining.
 *
 * БД не нужна: модели подменены jest.mock, запросы идут в мини-express.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/ChatMessage', () => ({
  ALLOWED_REACTIONS: [],
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../src/models/ChatReadState', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/models/QAQuestion', () => ({}));
jest.mock('../src/models/User', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/models/Report', () => ({}));
jest.mock('../src/models/Book', () => ({}));
jest.mock('../src/socket', () => ({ emitToClub: jest.fn() }));
jest.mock('../src/services/image.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
jest.mock('../src/services/voice.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
jest.mock('../src/services/club-chat-push.service', () => ({
  notifyAnnaMessage: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/services/chat-unread.service', () => ({}));
jest.mock('../src/services/push.service', () => ({ sendToUser: jest.fn() }));
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
  };
});

const express = require('express');
const ChatMessage = require('../src/models/ChatMessage');
const ChatReadState = require('../src/models/ChatReadState');
const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const { emitToClub } = require('../src/socket');
const clubRoutes = require('../src/routes/club');
const { errorHandler } = require('../src/middleware/error');

/* ----------------------------- helpers ----------------------------- */

const ME = '64a000000000000000000001';
const ADMIN = '64a000000000000000000009';
const STRANGER = '64a000000000000000000007';
const BLOCKED = '64a000000000000000000003';
const CLUB = '64c000000000000000000001';
const M1 = '64e000000000000000000001';

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
  name: 'Участница',
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
  ['populate', 'sort', 'skip', 'limit', 'select', 'lean'].forEach((m) => {
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
  app.set('io', { fake: true });
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

beforeEach(() => {
  jest.clearAllMocks();
  USERS = {
    [ME]: subscriber(),
    [ADMIN]: subscriber({ role: 'admin', name: 'Анна', clubMonthsEntitled: [] }),
    [STRANGER]: subscriber({ clubMonthsEntitled: ['2026-10'] }),
  };
  User.findById.mockImplementation((id) => chain(USERS[String(id)] || null));
  User.find.mockReturnValue(chain([]));
  ClubMonth.findById.mockImplementation((id) =>
    chain(String(id) === CLUB ? { ...CLUB_DOC } : null)
  );
  ClubMonth.updateOne.mockResolvedValue({});
  ChatReadState.updateOne.mockResolvedValue({});
  ChatReadState.findOne.mockReturnValue(chain(null));
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

/* ------------------------------ схема ------------------------------ */

describe('схема', () => {
  test('ChatMessage.isQuestion: по умолчанию false, индекс {clubMonthId, isQuestion, createdAt}', () => {
    const Real = jest.requireActual('../src/models/ChatMessage');
    const doc = new Real({ clubMonthId: CLUB, userId: ME, text: 'x' });
    expect(doc.isQuestion).toBe(false);
    const keys = Real.schema.indexes().map(([k]) => Object.keys(k).join(','));
    expect(keys).toContain('clubMonthId,isQuestion,createdAt');
  });

  test('ChatReadState.questionsSeenAt: по умолчанию null', () => {
    const Real = jest.requireActual('../src/models/ChatReadState');
    expect(Real.schema.path('questionsSeenAt').defaultValue).toBeNull();
  });
});

/* ------------------------------ лимит ------------------------------ */

describe('POST /chat с isQuestion — лимит 3 в неделю', () => {
  // Мои сообщения-вопросы: countDocuments считает по фильтру лимита.
  let myQuestionsAt;

  beforeEach(() => {
    myQuestionsAt = [];
    ChatMessage.countDocuments.mockImplementation(async (filter) =>
      myQuestionsAt.filter((d) => d >= filter.createdAt.$gte).length
    );
    ChatMessage.create.mockImplementation(async (doc) => ({ _id: M1, ...doc }));
    ChatMessage.findById.mockImplementation(() =>
      chain({
        _id: M1,
        clubMonthId: CLUB,
        userId: { _id: ME, name: 'Участница' },
        type: 'text',
        text: 'Вопрос',
        isQuestion: ChatMessage.create.mock.calls.length
          ? ChatMessage.create.mock.calls[0][0].isQuestion
          : false,
      })
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const send = (user = ME, isQuestion = true) =>
    call('POST', `/api/club/${CLUB}/chat`, {
      user,
      body: { type: 'text', text: 'Как читать медленно?', isQuestion },
    });

  test('вопрос: 201, isQuestion в сообщении и в сокете', async () => {
    const res = await send();
    expect(res.status).toBe(201);
    expect(ChatMessage.create.mock.calls[0][0].isQuestion).toBe(true);
    expect(res.body.data.message.isQuestion).toBe(true);
    expect(emitToClub).toHaveBeenCalledWith(
      expect.anything(),
      CLUB,
      'chat:new_message',
      { message: expect.objectContaining({ isQuestion: true }) }
    );
    // Счёт — мои вопросы этого клуба, не удалённые.
    const [filter] = ChatMessage.countDocuments.mock.calls[0];
    expect(String(filter.userId)).toBe(ME);
    expect(String(filter.clubMonthId)).toBe(CLUB);
    expect(filter.isQuestion).toBe(true);
    expect(filter.deletedAt).toBeNull();
  });

  test('3-й ок, 4-й → 429 QUESTION_LIMIT, сообщение не создаётся', async () => {
    myQuestionsAt = [new Date(), new Date()];
    expect((await send()).status).toBe(201);

    myQuestionsAt = [new Date(), new Date(), new Date()];
    ChatMessage.create.mockClear();
    const res = await send();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('QUESTION_LIMIT');
    expect(ChatMessage.create).not.toHaveBeenCalled();
  });

  test('сброс в понедельник 00:00 МСК', async () => {
    myQuestionsAt = [
      new Date('2026-11-15T17:00:00Z'),
      new Date('2026-11-15T18:00:00Z'),
      new Date('2026-11-15T20:00:00Z'),
    ];
    // вс 15.11 23:59 МСК — ещё та же неделя.
    jest.useFakeTimers({ now: new Date('2026-11-15T20:59:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
    expect((await send()).status).toBe(429);
    // пн 16.11 00:00 МСК — новая неделя.
    jest.setSystemTime(new Date('2026-11-15T21:00:00Z'));
    expect((await send()).status).toBe(201);
  });

  test('обычные сообщения не ограничены и не считаются', async () => {
    myQuestionsAt = [new Date(), new Date(), new Date()];
    const res = await send(ME, false);
    expect(res.status).toBe(201);
    expect(ChatMessage.countDocuments).not.toHaveBeenCalled();
    expect(ChatMessage.create.mock.calls[0][0].isQuestion).toBe(false);
  });

  test('без поля isQuestion — обычное сообщение (старые клиенты)', async () => {
    const res = await call('POST', `/api/club/${CLUB}/chat`, {
      user: ME,
      body: { type: 'text', text: 'Привет' },
    });
    expect(res.status).toBe(201);
    expect(ChatMessage.create.mock.calls[0][0].isQuestion).toBe(false);
  });

  test('админ: isQuestion игнорируется, лимита нет', async () => {
    myQuestionsAt = [new Date(), new Date(), new Date(), new Date()];
    const res = await send(ADMIN, true);
    expect(res.status).toBe(201);
    expect(ChatMessage.countDocuments).not.toHaveBeenCalled();
    expect(ChatMessage.create.mock.calls[0][0].isQuestion).toBe(false);
  });

  test('GET /chat/questions/remaining: остаток и weeklyLimit, у админа null', async () => {
    myQuestionsAt = [new Date()];
    const res = await call('GET', `/api/club/${CLUB}/chat/questions/remaining`, { user: ME });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ remainingThisWeek: 2, weeklyLimit: 3 });

    myQuestionsAt = [new Date(), new Date(), new Date(), new Date()];
    const zero = await call('GET', `/api/club/${CLUB}/chat/questions/remaining`, { user: ME });
    expect(zero.body.data.remainingThisWeek).toBe(0);

    const admin = await call('GET', `/api/club/${CLUB}/chat/questions/remaining`, { user: ADMIN });
    expect(admin.body.data).toEqual({ remainingThisWeek: null, weeklyLimit: 3 });
  });
});

/* ------------------------- список и newCount ------------------------ */

describe('GET /chat/questions', () => {
  const q = (i) => ({
    _id: `64e0000000000000000000${String(10 + i)}`,
    clubMonthId: CLUB,
    userId: { _id: ME, name: 'Участница' },
    type: 'text',
    text: `Вопрос ${i}`,
    isQuestion: true,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
  });

  test('только вопросы клуба, новые сверху, без заблокированных; newCount от questionsSeenAt', async () => {
    USERS[ADMIN].blockedUsers = [BLOCKED];
    const seenAt = new Date('2026-11-10T00:00:00Z');
    ChatReadState.findOne.mockReturnValue(chain({ questionsSeenAt: seenAt }));
    const findChain = chain([q(2), q(1)]);
    ChatMessage.find.mockReturnValue(findChain);
    ChatMessage.countDocuments.mockResolvedValue(1);

    const res = await call('GET', `/api/club/${CLUB}/chat/questions`, { user: ADMIN });

    expect(res.status).toBe(200);
    expect(res.body.data.questions.map((m) => m.text)).toEqual(['Вопрос 2', 'Вопрос 1']);
    expect(res.body.data.questions[0]).toMatchObject({
      isQuestion: true,
      userId: { _id: ME, name: 'Участница' },
    });
    expect(res.body.data.hasMore).toBe(false);
    expect(res.body.data.newCount).toBe(1);

    const [filter] = ChatMessage.find.mock.calls[0];
    expect(filter).toMatchObject({
      clubMonthId: CLUB,
      isQuestion: true,
      isHidden: { $ne: true },
      deletedAt: null,
    });
    expect(filter.userId.$nin.map(String)).toEqual([BLOCKED]);
    expect(findChain.calls.sort).toEqual([{ createdAt: -1 }]);
    expect(findChain.calls.skip).toEqual([0]);
    expect(findChain.calls.limit).toEqual([21]);

    const [countFilter] = ChatMessage.countDocuments.mock.calls[0];
    expect(countFilter.isQuestion).toBe(true);
    expect(countFilter.createdAt).toEqual({ $gt: seenAt });
    expect(String(ChatReadState.findOne.mock.calls[0][0].userId)).toBe(ADMIN);
  });

  test('без отметки — newCount по всем вопросам; страницы и hasMore', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => q(i));
    const findChain = chain(rows);
    ChatMessage.find.mockReturnValue(findChain);
    ChatMessage.countDocuments.mockResolvedValue(30);

    const res = await call('GET', `/api/club/${CLUB}/chat/questions?page=2`, { user: ME });

    expect(res.status).toBe(200);
    expect(res.body.data.questions).toHaveLength(20);
    expect(res.body.data.hasMore).toBe(true);
    expect(res.body.data.newCount).toBe(30);
    expect(findChain.calls.skip).toEqual([20]);
    expect(ChatMessage.countDocuments.mock.calls[0][0].createdAt).toBeUndefined();
  });

  test('без доступа к клубу — 403', async () => {
    const res = await call('GET', `/api/club/${CLUB}/chat/questions`, { user: STRANGER });
    expect(res.status).toBe(403);
    expect(ChatMessage.find).not.toHaveBeenCalled();
  });
});

/* ------------------------------- seen ------------------------------- */

describe('POST /chat/questions/seen', () => {
  test('ставит questionsSeenAt = now (upsert)', async () => {
    const before = Date.now();
    const res = await call('POST', `/api/club/${CLUB}/chat/questions/seen`, { user: ADMIN });
    expect(res.status).toBe(200);

    const [filter, update, opts] = ChatReadState.updateOne.mock.calls[0];
    expect(String(filter.userId)).toBe(ADMIN);
    expect(String(filter.clubMonthId)).toBe(CLUB);
    expect(update.$set.questionsSeenAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(opts).toEqual({ upsert: true });
    expect(new Date(res.body.data.questionsSeenAt).getTime()).toBe(
      update.$set.questionsSeenAt.getTime()
    );
  });

  test('без доступа — 403, отметку не ставим', async () => {
    const res = await call('POST', `/api/club/${CLUB}/chat/questions/seen`, { user: STRANGER });
    expect(res.status).toBe(403);
    expect(ChatReadState.updateOne).not.toHaveBeenCalled();
  });
});
