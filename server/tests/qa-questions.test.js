/**
 * Раздел «Вопросы» клуба (UPDATES-PLAN D1–D5, 13.11.2026).
 *
 * Проверяем:
 * - D1: схема QAQuestion — interestedUserIds/status по умолчанию, индекс
 *   {clubMonthId, status, createdAt}; старые документы без status;
 * - mskWeekStart — границы недели пн 00:00 МСК;
 * - D2: лимит 3 в неделю в клубе, 4-й → 429 QUESTION_LIMIT, сброс в
 *   понедельник 00:00 МСК, админ без лимита, remainingThisWeek;
 * - D3: toggle «тоже интересно» ($addToSet/$pull с условием), сокет,
 *   права = доступ к клубу вопроса;
 * - D4: статусы podcast/answered из админки и из приложения, пуш автору
 *   (type qa_answer) один раз, старый формат /admin/qa/:id/answer;
 * - D5: список — sort=interest|new, status, порядок по умолчанию для
 *   старых клиентов, у админа — interest; без массива interestedUserIds.
 *
 * БД не нужна: модели подменены jest.mock, запросы идут в мини-express.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/QAQuestion', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/ChatMessage', () => ({ ALLOWED_REACTIONS: [] }));
jest.mock('../src/models/Report', () => ({}));
jest.mock('../src/models/Book', () => ({}));
jest.mock('../src/models/Quote', () => ({}));
jest.mock('../src/models/Review', () => ({}));
jest.mock('../src/services/review.service', () => ({ hideReview: jest.fn() }));
jest.mock('../src/jobs/weekly-report', () => ({ runWeeklyReports: jest.fn() }));
jest.mock('../src/jobs/monthly-report', () => ({ runMonthlyReports: jest.fn() }));
jest.mock('../src/socket', () => ({ emitToClub: jest.fn() }));
jest.mock('../src/services/image.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
jest.mock('../src/services/voice.service', () => ({ MAX_FILE_SIZE_BYTES: 1024 }));
jest.mock('../src/services/club-chat-push.service', () => ({}));
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
    optionalAuth: (req, _res, next) => {
      const id = req.headers['x-test-user'];
      req.user = id ? { userId: id } : null;
      return next();
    },
  };
});

const express = require('express');
const QAQuestion = require('../src/models/QAQuestion');
const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const { emitToClub } = require('../src/socket');
const pushService = require('../src/services/push.service');
const qaService = require('../src/services/qa.service');
const clubRoutes = require('../src/routes/club');
const adminRoutes = require('../src/routes/admin');
const { errorHandler } = require('../src/middleware/error');

/* ----------------------------- helpers ----------------------------- */

const ME = '64a000000000000000000001';
const OTHER = '64a000000000000000000002';
const ADMIN = '64a000000000000000000009';
const STRANGER = '64a000000000000000000007';
const BLOCKED = '64a000000000000000000003';
const CLUB = '64c000000000000000000001';
const Q1 = '64d000000000000000000001';
const Q2 = '64d000000000000000000002';
const Q3 = '64d000000000000000000003';

const CLUB_DOC = {
  _id: CLUB,
  year: 2026,
  month: 11,
  // Широкие даты: клуб «текущий» при любой подменённой дате теста.
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

// Цепочка mongoose-запроса: populate/sort/skip/limit/select/lean → тот же
// объект, await → value. calls — что вызывали.
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
const io = { fake: true };

beforeAll((done) => {
  const app = express();
  app.set('io', io);
  app.use(express.json());
  app.use('/api/club', clubRoutes);
  app.use('/api/admin', adminRoutes);
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
    [OTHER]: subscriber(),
    [ADMIN]: subscriber({ role: 'admin', clubMonthsEntitled: [] }),
    [STRANGER]: subscriber({ clubMonthsEntitled: ['2026-10'] }),
  };
  User.findById.mockImplementation((id) => chain(USERS[String(id)] || null));
  ClubMonth.findById.mockImplementation((id) =>
    chain(String(id) === CLUB ? { ...CLUB_DOC } : null)
  );
  pushService.sendToUser.mockResolvedValue(true);
  QAQuestion.updateOne.mockResolvedValue({});
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

/* ------------------------------- D1 -------------------------------- */

describe('D1: схема QAQuestion', () => {
  const Real = jest.requireActual('../src/models/QAQuestion');

  test('новый вопрос: status open, interestedUserIds []', () => {
    const doc = new Real({ clubMonthId: CLUB, userId: ME, questionText: 'Вопрос?' });
    expect(doc.status).toBe('open');
    expect(doc.interestedUserIds.toObject()).toEqual([]);
    expect(doc.validateSync()).toBeUndefined();
  });

  test('status только open|podcast|answered', () => {
    const doc = new Real({
      clubMonthId: CLUB,
      userId: ME,
      questionText: 'Вопрос?',
      status: 'closed',
    });
    expect(doc.validateSync().errors.status).toBeDefined();
  });

  test('индекс {clubMonthId, status, createdAt}', () => {
    const keys = Real.schema.indexes().map(([k]) => Object.keys(k).join(','));
    expect(keys).toContain('clubMonthId,status,createdAt');
  });

  test('старые документы без status: без ответа — open, с ответом — answered', () => {
    expect(qaService.effectiveStatus({ answeredAt: null })).toBe('open');
    expect(qaService.effectiveStatus({ answeredAt: new Date() })).toBe('answered');
    expect(qaService.effectiveStatus({ status: 'podcast', answeredAt: null })).toBe('podcast');
  });

  test('serializeQuestion: без массива, с interestCount/interestedByMe/status', () => {
    const out = qaService.serializeQuestion(
      { _id: Q1, questionText: 'x', interestedUserIds: [OTHER, ME], answeredAt: null },
      ME
    );
    expect(out.interestedUserIds).toBeUndefined();
    expect(out).toMatchObject({ _id: Q1, interestCount: 2, interestedByMe: true, status: 'open' });
    // старый документ без массива
    expect(qaService.serializeQuestion({ _id: Q1 }, ME)).toMatchObject({
      interestCount: 0,
      interestedByMe: false,
    });
  });
});

/* --------------------------- mskWeekStart -------------------------- */

describe('mskWeekStart — неделя пн–вс по Москве', () => {
  const ws = (iso) => qaService.mskWeekStart(new Date(iso)).toISOString();

  test('понедельник 00:00 МСК = воскресенье 21:00 UTC', () => {
    // 16.11.2026 — понедельник.
    expect(ws('2026-11-15T21:00:00.000Z')).toBe('2026-11-15T21:00:00.000Z');
  });

  test('за миллисекунду до — ещё прошлая неделя', () => {
    expect(ws('2026-11-15T20:59:59.999Z')).toBe('2026-11-08T21:00:00.000Z');
  });

  test('воскресенье 23:59 МСК — та же неделя', () => {
    expect(ws('2026-11-22T20:59:00.000Z')).toBe('2026-11-15T21:00:00.000Z');
  });

  test('середина недели', () => {
    // пт 13.11.2026 12:00 МСК
    expect(ws('2026-11-13T09:00:00.000Z')).toBe('2026-11-08T21:00:00.000Z');
  });

  test('через границу месяца и года', () => {
    // чт 31.12.2026 → пн 28.12.2026
    expect(ws('2026-12-31T12:00:00.000Z')).toBe('2026-12-27T21:00:00.000Z');
    // пн 04.01.2027 00:30 МСК
    expect(ws('2027-01-03T21:30:00.000Z')).toBe('2027-01-03T21:00:00.000Z');
  });
});

/* ------------------------------- D2 -------------------------------- */

describe('D2: лимит 3 вопроса в неделю', () => {
  // Хранилище «моих вопросов»: countDocuments считает по $gte из фильтра.
  let myQuestionsAt;

  beforeEach(() => {
    myQuestionsAt = [];
    QAQuestion.countDocuments.mockImplementation(async (filter) =>
      myQuestionsAt.filter((d) => d >= filter.createdAt.$gte).length
    );
    QAQuestion.find.mockReturnValue(chain([]));
    QAQuestion.create.mockImplementation(async (doc) => ({ _id: Q1, ...doc }));
    QAQuestion.findById.mockReturnValue(
      chain({
        _id: Q1,
        clubMonthId: CLUB,
        userId: { _id: ME, name: 'Я' },
        questionText: 'Новый вопрос',
        status: 'open',
        interestedUserIds: [],
        answerText: null,
        answeredAt: null,
      })
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const ask = (user = ME) =>
    call('POST', `/api/club/${CLUB}/qa`, { user, body: { questionText: 'Новый вопрос' } });

  test('первый вопрос: 201, старый формат + remainingThisWeek', async () => {
    const res = await ask();
    expect(res.status).toBe(201);
    expect(res.body.data.question).toMatchObject({
      _id: Q1,
      questionText: 'Новый вопрос',
      userId: { _id: ME, name: 'Я' },
      answerText: null,
      status: 'open',
      interestCount: 0,
      interestedByMe: false,
    });
    expect(res.body.data.question.interestedUserIds).toBeUndefined();
    expect(res.body.data.remainingThisWeek).toBe(2);
    expect(res.body.data.weeklyLimit).toBe(3);
    // Считаем только мои вопросы в этом клубе.
    const [filter] = QAQuestion.countDocuments.mock.calls[0];
    expect(String(filter.userId)).toBe(ME);
    expect(String(filter.clubMonthId)).toBe(CLUB);
  });

  test('3 за неделю → 4-й 429 QUESTION_LIMIT, вопрос не создаётся', async () => {
    myQuestionsAt = [new Date(), new Date(), new Date()];
    const res = await ask();
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('QUESTION_LIMIT');
    expect(res.body.error.message).toBe('На этой неделе можно задать ещё 0 вопросов');
    expect(QAQuestion.create).not.toHaveBeenCalled();
  });

  test('сброс в понедельник 00:00 МСК', async () => {
    // Три вопроса в воскресенье 15.11 вечером по Москве.
    myQuestionsAt = [
      new Date('2026-11-15T17:00:00Z'),
      new Date('2026-11-15T18:00:00Z'),
      new Date('2026-11-15T20:00:00Z'),
    ];
    jest.useFakeTimers({
      now: new Date('2026-11-15T20:59:59.000Z'), // вс 23:59:59 МСК
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'hrtime',
        'performance',
      ],
    });
    expect((await ask()).status).toBe(429);

    jest.setSystemTime(new Date('2026-11-15T21:00:00.000Z')); // пн 00:00 МСК
    const res = await ask();
    expect(res.status).toBe(201);
    expect(res.body.data.remainingThisWeek).toBe(2);
  });

  test('админ не ограничен, remainingThisWeek = null', async () => {
    myQuestionsAt = [new Date(), new Date(), new Date(), new Date()];
    const res = await ask(ADMIN);
    expect(res.status).toBe(201);
    expect(res.body.data.remainingThisWeek).toBeNull();
    expect(QAQuestion.countDocuments).not.toHaveBeenCalled();
  });

  test('список отдаёт remainingThisWeek', async () => {
    myQuestionsAt = [new Date()];
    const res = await call('GET', `/api/club/${CLUB}/qa`, { user: ME });
    expect(res.status).toBe(200);
    expect(res.body.data.remainingThisWeek).toBe(2);
    expect(res.body.data.weeklyLimit).toBe(3);
  });

  test('без доступа к клубу — 403, лимит не считается', async () => {
    const res = await ask(STRANGER);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(QAQuestion.countDocuments).not.toHaveBeenCalled();
  });
});

/* ------------------------------- D3 -------------------------------- */

describe('D3: «тоже интересно»', () => {
  beforeEach(() => {
    QAQuestion.findById.mockReturnValue(chain({ _id: Q1, clubMonthId: CLUB }));
  });

  test('не отмечала → $addToSet с условием $ne, interested=true, сокет', async () => {
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(
      chain({ _id: Q1, clubMonthId: CLUB, interestedUserIds: [OTHER, ME] })
    );

    const res = await call('POST', `/api/club/qa/${Q1}/interest`, { user: ME });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ interested: true, interestCount: 2 });
    const [filter, update] = QAQuestion.findOneAndUpdate.mock.calls[0];
    expect(String(filter._id)).toBe(Q1);
    expect(String(filter.interestedUserIds.$ne)).toBe(ME);
    expect(String(update.$addToSet.interestedUserIds)).toBe(ME);
    expect(QAQuestion.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(emitToClub).toHaveBeenCalledWith(io, CLUB, 'qa:updated', {
      questionId: Q1,
      clubMonthId: CLUB,
      interestCount: 2,
    });
  });

  test('уже отмечала → $pull с условием наличия, interested=false', async () => {
    QAQuestion.findOneAndUpdate
      .mockReturnValueOnce(chain(null))
      .mockReturnValueOnce(chain({ _id: Q1, clubMonthId: CLUB, interestedUserIds: [OTHER] }));

    const res = await call('POST', `/api/club/qa/${Q1}/interest`, { user: ME });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ interested: false, interestCount: 1 });
    const [filter, update] = QAQuestion.findOneAndUpdate.mock.calls[1];
    expect(String(filter.interestedUserIds)).toBe(ME);
    expect(String(update.$pull.interestedUserIds)).toBe(ME);
    expect(emitToClub.mock.calls[0][3].interestCount).toBe(1);
  });

  test('нет доступа к клубу вопроса → 403, ничего не меняется', async () => {
    const res = await call('POST', `/api/club/qa/${Q1}/interest`, { user: STRANGER });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(QAQuestion.findOneAndUpdate).not.toHaveBeenCalled();
    expect(emitToClub).not.toHaveBeenCalled();
  });

  test('забаненная → 403 CLUB_BLOCKED', async () => {
    USERS[ME].isBanned = true;
    const res = await call('POST', `/api/club/qa/${Q1}/interest`, { user: ME });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CLUB_BLOCKED');
  });

  test('нет вопроса → 404, кривой id → 400', async () => {
    QAQuestion.findById.mockReturnValue(chain(null));
    expect((await call('POST', `/api/club/qa/${Q1}/interest`, { user: ME })).status).toBe(404);
    expect((await call('POST', '/api/club/qa/bad/interest', { user: ME })).status).toBe(400);
  });
});

/* ------------------------------- D4 -------------------------------- */

describe('D4: статусы и пуш автору', () => {
  const openQ = (extra = {}) => ({
    _id: Q1,
    clubMonthId: CLUB,
    userId: OTHER,
    questionText: 'Вопрос',
    answerText: null,
    answeredAt: null,
    status: 'open',
    interestedUserIds: [],
    ...extra,
  });

  test('админка: «В подкаст» → status podcast, пуш автору qa_answer', async () => {
    QAQuestion.findById
      .mockReturnValueOnce(chain(openQ()))
      .mockReturnValueOnce(chain(openQ({ status: 'podcast' })));
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(openQ()));

    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { status: 'podcast' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.question.status).toBe('podcast');
    const [filter, update] = QAQuestion.findOneAndUpdate.mock.calls[0];
    expect(filter.status).toEqual({ $ne: 'podcast' });
    expect(update.$set).toEqual({ status: 'podcast' });
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
    const [to, payload, key] = pushService.sendToUser.mock.calls[0];
    expect(String(to)).toBe(OTHER);
    expect(payload.body).toBe('Анна возьмёт ваш вопрос в подкаст');
    expect(payload.data).toMatchObject({ type: 'qa_answer', questionId: Q1, status: 'podcast' });
    expect(key).toBe('chatMessages');
  });

  test('повторный «В подкаст» — без пуша', async () => {
    QAQuestion.findById.mockReturnValue(chain(openQ({ status: 'podcast' })));
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(null));

    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { status: 'podcast' },
    });

    expect(res.status).toBe(200);
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  test('ответ текстом: answered + answeredAt, пуш «Анна ответила»', async () => {
    QAQuestion.findById.mockReturnValue(chain(openQ()));
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(openQ()));

    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { status: 'answered', answerText: 'Ответ' },
    });

    expect(res.status).toBe(200);
    const [filter, update] = QAQuestion.findOneAndUpdate.mock.calls[0];
    expect(filter.answeredAt).toBeNull();
    expect(update.$set).toMatchObject({
      status: 'answered',
      answerText: 'Ответ',
      answeredByUserId: ADMIN,
    });
    expect(update.$set.answeredAt).toBeInstanceOf(Date);
    const [, payload] = pushService.sendToUser.mock.calls[0];
    expect(payload.title).toBe('Анна ответила на ваш вопрос');
    expect(payload.body).toBe('Ответ');
    expect(payload.data).toMatchObject({ type: 'qa_answer', status: 'answered' });
  });

  test('answered без текста и без прежнего ответа → 400', async () => {
    QAQuestion.findById.mockReturnValue(chain(openQ()));
    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { status: 'answered' },
    });
    expect(res.status).toBe(400);
    expect(QAQuestion.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('правка уже данного ответа (status answered) — без пуша', async () => {
    const answered = openQ({ status: 'answered', answerText: 'Было', answeredAt: new Date() });
    QAQuestion.findById.mockReturnValue(chain(answered));
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(null));

    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { status: 'answered', answerText: 'Стало' },
    });

    expect(res.status).toBe(200);
    expect(QAQuestion.updateOne).toHaveBeenCalledWith(
      { _id: Q1 },
      { $set: { status: 'answered', answeredByUserId: ADMIN, answerText: 'Стало' } }
    );
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  test('старый формат (без status): ответ, populated вопрос, пуш', async () => {
    QAQuestion.findById
      .mockReturnValueOnce(chain(openQ()))
      .mockReturnValueOnce(
        chain(
          openQ({
            userId: { _id: OTHER, name: 'Участница' },
            answerText: 'Ответ',
            answeredAt: new Date(),
            answeredByUserId: { _id: ADMIN, name: 'Анна' },
            status: 'answered',
          })
        )
      );
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(openQ()));

    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { answerText: 'Ответ' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.question).toMatchObject({
      _id: Q1,
      answerText: 'Ответ',
      userId: { _id: OTHER, name: 'Участница' },
      answeredByUserId: { _id: ADMIN, name: 'Анна' },
      status: 'answered',
    });
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
  });

  test('старый формат: уже отвечено → 409, как раньше', async () => {
    QAQuestion.findById.mockReturnValue(
      chain(openQ({ status: undefined, answerText: 'Было', answeredAt: new Date() }))
    );
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(null));

    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { answerText: 'Ещё' },
    });

    expect(res.status).toBe(409);
    expect(QAQuestion.updateOne).not.toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  test('старый формат: без answerText → 400', async () => {
    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, { user: ADMIN, body: {} });
    expect(res.status).toBe(400);
  });

  test('не админ в /api/admin → 403', async () => {
    const res = await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ME,
      body: { status: 'podcast' },
    });
    expect(res.status).toBe(403);
  });

  test('свой вопрос админа — пуш себе не шлём', async () => {
    QAQuestion.findById.mockReturnValue(chain(openQ({ userId: ADMIN })));
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(openQ({ userId: ADMIN })));
    await call('POST', `/api/admin/qa/${Q1}/answer`, {
      user: ADMIN,
      body: { status: 'podcast' },
    });
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  test('из приложения: POST /api/club/qa/:id/status — Анна, podcast', async () => {
    QAQuestion.findById.mockReturnValue(chain(openQ()));
    QAQuestion.findOneAndUpdate.mockReturnValueOnce(chain(openQ()));

    const res = await call('POST', `/api/club/qa/${Q1}/status`, {
      user: ADMIN,
      body: { status: 'podcast' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.question._id).toBe(Q1);
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
    expect(pushService.sendToUser.mock.calls[0][1].data.type).toBe('qa_answer');
  });

  test('из приложения: участница → 403, ничего не меняется', async () => {
    QAQuestion.findById.mockReturnValue(chain(openQ()));
    const res = await call('POST', `/api/club/qa/${Q1}/status`, {
      user: ME,
      body: { status: 'podcast' },
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(QAQuestion.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('из приложения: неверный статус → 400', async () => {
    const res = await call('POST', `/api/club/qa/${Q1}/status`, {
      user: ADMIN,
      body: { status: 'open' },
    });
    expect(res.status).toBe(400);
  });
});

/* ------------------------------- D5 -------------------------------- */

describe('D5: список вопросов', () => {
  const t = (d) => new Date(`2026-11-${d}T10:00:00Z`);
  // Порядок «из базы» (sort answeredAt:-1, createdAt:-1).
  const fromDb = () => [
    {
      _id: Q3,
      userId: { _id: OTHER },
      createdAt: t(10),
      answeredAt: t(12),
      answerText: 'Ответ',
      // старый документ: ни status, ни interestedUserIds
    },
    { _id: Q2, userId: { _id: OTHER }, createdAt: t(11), answeredAt: null, status: 'open', interestedUserIds: [ME, OTHER] },
    { _id: Q1, userId: { _id: ME }, createdAt: t(9), answeredAt: null, status: 'podcast', interestedUserIds: [OTHER, ADMIN] },
  ];

  beforeEach(() => {
    QAQuestion.countDocuments.mockResolvedValue(0);
  });

  test('без sort у участницы — прежний порядок, новые поля, без массива', async () => {
    const q = chain(fromDb());
    QAQuestion.find.mockReturnValue(q);

    const res = await call('GET', `/api/club/${CLUB}/qa`, { user: ME });

    expect(res.status).toBe(200);
    expect(q.calls.sort[0]).toEqual({ answeredAt: -1, createdAt: -1 });
    const list = res.body.data.questions;
    expect(list.map((x) => x._id)).toEqual([Q3, Q2, Q1]);
    expect(list[0]).toMatchObject({ status: 'answered', interestCount: 0, interestedByMe: false, answerText: 'Ответ' });
    expect(list[1]).toMatchObject({ status: 'open', interestCount: 2, interestedByMe: true });
    expect(list[2]).toMatchObject({ status: 'podcast', interestCount: 2, interestedByMe: false });
    list.forEach((x) => expect(x.interestedUserIds).toBeUndefined());
  });

  test('sort=interest — по числу «интересно», при равенстве новые', async () => {
    QAQuestion.find.mockReturnValue(chain(fromDb()));
    const res = await call('GET', `/api/club/${CLUB}/qa?sort=interest`, { user: ME });
    expect(res.body.data.questions.map((x) => x._id)).toEqual([Q2, Q1, Q3]);
  });

  test('sort=new — новые сверху', async () => {
    QAQuestion.find.mockReturnValue(chain(fromDb()));
    const res = await call('GET', `/api/club/${CLUB}/qa?sort=new`, { user: ME });
    expect(res.body.data.questions.map((x) => x._id)).toEqual([Q2, Q3, Q1]);
  });

  test('у админа по умолчанию sort=interest', async () => {
    QAQuestion.find.mockReturnValue(chain(fromDb()));
    const res = await call('GET', `/api/club/${CLUB}/qa`, { user: ADMIN });
    expect(res.status).toBe(200);
    expect(res.body.data.questions.map((x) => x._id)).toEqual([Q2, Q1, Q3]);
    expect(res.body.data.questions[1].interestedByMe).toBe(true);
    expect(res.body.data.remainingThisWeek).toBeNull();
  });

  test('status=open учитывает старые документы без status', async () => {
    QAQuestion.find.mockReturnValue(chain([]));
    await call('GET', `/api/club/${CLUB}/qa?status=open`, { user: ME });
    const [filter] = QAQuestion.find.mock.calls[0];
    expect(filter.$and).toEqual([
      { clubMonthId: CLUB },
      { $or: [{ status: 'open' }, { status: null, answeredAt: null }] },
    ]);
  });

  test('status=answered и заблокированные авторы', async () => {
    USERS[ME].blockedUsers = [BLOCKED];
    QAQuestion.find.mockReturnValue(chain([]));
    await call('GET', `/api/club/${CLUB}/qa?status=answered`, { user: ME });
    const [filter] = QAQuestion.find.mock.calls[0];
    expect(filter.$and).toEqual([
      { clubMonthId: CLUB },
      { userId: { $nin: [BLOCKED] } },
      { $or: [{ status: 'answered' }, { status: null, answeredAt: { $ne: null } }] },
    ]);
  });

  test('без фильтров — прежний фильтр запроса', async () => {
    QAQuestion.find.mockReturnValue(chain([]));
    await call('GET', `/api/club/${CLUB}/qa`, { user: ME });
    expect(QAQuestion.find.mock.calls[0][0]).toEqual({ clubMonthId: CLUB });
  });

  test('неверный sort/status → 400; без доступа → 403', async () => {
    expect((await call('GET', `/api/club/${CLUB}/qa?sort=top`, { user: ME })).status).toBe(400);
    expect((await call('GET', `/api/club/${CLUB}/qa?status=x`, { user: ME })).status).toBe(400);
    expect((await call('GET', `/api/club/${CLUB}/qa`, { user: STRANGER })).status).toBe(403);
  });
});
