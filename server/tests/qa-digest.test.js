/**
 * Дайджест новых вопросов Анне (UPDATES-PLAN D6, 15.11.2026).
 *
 * Проверяем qa-digest.service и час cron:
 * - N > 0 → пуш всем role=admin, текст «N новых вопросов, самый популярный:
 *   «…»» (самый популярный по interestedUserIds, текст обрезан до 80),
 *   data { type: 'qa_digest', clubMonthId };
 * - нет вопросов / нет клуба → не шлём;
 * - отметка lastQaDigestAt не дала поставить (рестарт) → не шлём повторно;
 * - QA_DIGEST_HOUR_MSK: по умолчанию 10, мусор → 10.
 *
 * БД не нужна: модели подменены jest.mock.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/User', () => ({ find: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
jest.mock('../src/models/QAQuestion', () => ({ find: jest.fn() }));
jest.mock('../src/services/push.service', () => ({ sendToUsers: jest.fn() }));

const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const QAQuestion = require('../src/models/QAQuestion');
const pushService = require('../src/services/push.service');
const svc = require('../src/services/qa-digest.service');

const CLUB = '64c000000000000000000001';
const NOW = new Date('2026-11-16T07:00:00Z'); // 10:00 МСК

function chain(value) {
  const q = {
    calls: {},
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  ['sort', 'select', 'lean'].forEach((m) => {
    q[m] = jest.fn((...args) => {
      q.calls[m] = args;
      return q;
    });
  });
  return q;
}

const ADMINS = [{ _id: 'a1', role: 'admin', devices: [{ platform: 'ios', token: 't' }] }];

beforeEach(() => {
  jest.clearAllMocks();
  ClubMonth.findOne.mockReturnValue(chain({ _id: CLUB, year: 2026, month: 11 }));
  ClubMonth.updateOne.mockResolvedValue({ modifiedCount: 1 });
  User.find.mockReturnValue(chain(ADMINS));
  pushService.sendToUsers.mockResolvedValue({ total: 1, sent: 1 });
});

describe('тексты', () => {
  test('склонение «вопрос»', () => {
    expect(svc.newQuestionsLabel(1)).toBe('1 новый вопрос');
    expect(svc.newQuestionsLabel(3)).toBe('3 новых вопроса');
    expect(svc.newQuestionsLabel(5)).toBe('5 новых вопросов');
    expect(svc.newQuestionsLabel(11)).toBe('11 новых вопросов');
    expect(svc.newQuestionsLabel(22)).toBe('22 новых вопроса');
  });

  test('превью обрезается до 80 символов с многоточием, пробелы схлопываются', () => {
    const long = 'а'.repeat(200);
    const p = svc.questionPreview(long);
    expect(p.length).toBe(80);
    expect(p.endsWith('…')).toBe(true);
    expect(svc.questionPreview('  Как   читать\nмедленно? ')).toBe('Как читать медленно?');
  });

  test('самый популярный — по interestedUserIds, при равенстве ранний', () => {
    const qs = [
      { questionText: 'A', interestedUserIds: ['x'], createdAt: new Date('2026-11-15T10:00:00Z') },
      { questionText: 'B', interestedUserIds: ['x', 'y'], createdAt: new Date('2026-11-15T12:00:00Z') },
      { questionText: 'C', interestedUserIds: ['x', 'z'], createdAt: new Date('2026-11-15T11:00:00Z') },
    ];
    expect(svc.mostPopular(qs).questionText).toBe('C');
    expect(svc.mostPopular([{ questionText: 'D', createdAt: NOW }]).questionText).toBe('D');
  });
});

describe('sendQaDigest', () => {
  test('есть новые вопросы → пуш админам с самым популярным', async () => {
    QAQuestion.find.mockReturnValue(
      chain([
        { questionText: 'Первый', interestedUserIds: [], createdAt: NOW },
        { questionText: 'Популярный вопрос', interestedUserIds: ['u1', 'u2'], createdAt: NOW },
      ])
    );

    const r = await svc.sendQaDigest(NOW);

    expect(r.sent).toBe(1);
    expect(r.count).toBe(2);
    // Окно — последние 24 часа, текущий клуб.
    const filter = QAQuestion.find.mock.calls[0][0];
    expect(filter.clubMonthId).toBe(CLUB);
    expect(filter.createdAt.$gte).toEqual(new Date(NOW.getTime() - 24 * 3600 * 1000));
    // Получатели — role=admin без удалённых.
    expect(User.find.mock.calls[0][0]).toEqual({ role: 'admin', isDeleted: { $ne: true } });
    const [users, payload, key] = pushService.sendToUsers.mock.calls[0];
    expect(users).toBe(ADMINS);
    expect(key).toBeNull();
    expect(payload).toEqual({
      title: 'Новые вопросы в клубе',
      body: '2 новых вопроса, самый популярный: «Популярный вопрос»',
      data: { type: 'qa_digest', clubMonthId: CLUB },
    });
  });

  test('нет новых вопросов → не шлём и отметку не ставим', async () => {
    QAQuestion.find.mockReturnValue(chain([]));
    const r = await svc.sendQaDigest(NOW);
    expect(r).toEqual({ sent: 0, skipped: 'empty', count: 0 });
    expect(ClubMonth.updateOne).not.toHaveBeenCalled();
    expect(pushService.sendToUsers).not.toHaveBeenCalled();
  });

  test('нет текущего клуба → не шлём', async () => {
    ClubMonth.findOne.mockReturnValue(chain(null));
    const r = await svc.sendQaDigest(NOW);
    expect(r.skipped).toBe('no_club');
    expect(pushService.sendToUsers).not.toHaveBeenCalled();
  });

  test('повтор при рестарте: отметку уже поставили → не шлём', async () => {
    QAQuestion.find.mockReturnValue(chain([{ questionText: 'Q', interestedUserIds: [], createdAt: NOW }]));
    ClubMonth.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const r = await svc.sendQaDigest(NOW);
    expect(r.skipped).toBe('already_sent');
    expect(pushService.sendToUsers).not.toHaveBeenCalled();
    // Отметка — атомарно, с окном 12 часов.
    const [filter, update] = ClubMonth.updateOne.mock.calls[0];
    expect(filter._id).toBe(CLUB);
    expect(filter.$or[0]).toEqual({ lastQaDigestAt: null });
    expect(filter.$or[1].lastQaDigestAt.$lte).toEqual(new Date(NOW.getTime() - 12 * 3600 * 1000));
    expect(update).toEqual({ $set: { lastQaDigestAt: NOW } });
  });
});

describe('ClubMonth.lastQaDigestAt', () => {
  test('поле в схеме, по умолчанию null', () => {
    const Real = jest.requireActual('../src/models/ClubMonth');
    expect(Real.schema.path('lastQaDigestAt')).toBeDefined();
    expect(Real.schema.path('lastQaDigestAt').defaultValue).toBeNull();
  });
});

describe('час дайджеста (QA_DIGEST_HOUR_MSK)', () => {
  test('по умолчанию 10, из env — 0..23, мусор → 10', () => {
    const { qaDigestHour } = jest.requireActual('../src/jobs/push-scheduler');
    expect(qaDigestHour({})).toBe(10);
    expect(qaDigestHour({ QA_DIGEST_HOUR_MSK: '9' })).toBe(9);
    expect(qaDigestHour({ QA_DIGEST_HOUR_MSK: '0' })).toBe(0);
    expect(qaDigestHour({ QA_DIGEST_HOUR_MSK: '24' })).toBe(10);
    expect(qaDigestHour({ QA_DIGEST_HOUR_MSK: 'abc' })).toBe(10);
  });
});
