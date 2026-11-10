/**
 * Непрочитанные в чате клуба (UPDATES-PLAN V1, 10.11.2026).
 *
 * Проверяем chat-unread.service:
 * - markRead — монотонность (createdAt из БД, старое не откатывает), E11000;
 * - countUnread — фильтр без своих/скрытых/удалённых/заблокированных,
 *   lastReadAt или окно 7 дней, cap 99;
 * - unreadForUser — только клубы с доступом (computeClubAccess), бан → пусто,
 *   total ≤ 99.
 *
 * БД не нужна: модели подменены jest.mock.
 */

process.env.TZ = 'Europe/Moscow';

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({ find: jest.fn() }));
jest.mock('../src/models/ChatMessage', () => ({
  findOne: jest.fn(),
  countDocuments: jest.fn(),
}));
jest.mock('../src/models/ChatReadState', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
}));

const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const ChatMessage = require('../src/models/ChatMessage');
const ChatReadState = require('../src/models/ChatReadState');
const svc = require('../src/services/chat-unread.service');

const ME = '64a000000000000000000001';
const BLOCKED = '64a000000000000000000003';
const CLUB = '64c000000000000000000001';
const MSG_OLD = '64d000000000000000000001';
const MSG_NEW = '64d000000000000000000002';

// Цепочка mongoose-запроса: select/sort/limit/lean → тот же объект, await → value.
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

beforeEach(() => {
  jest.clearAllMocks();
});

/* ------------------------------ markRead ---------------------------- */

describe('markRead', () => {
  test('нет записи — создаёт с createdAt сообщения из БД', async () => {
    const createdAt = new Date('2026-11-10T10:00:00Z');
    ChatMessage.findOne.mockReturnValue(chain({ _id: MSG_NEW, createdAt }));
    ChatReadState.findOneAndUpdate.mockReturnValue(
      chain({ lastReadAt: createdAt, lastReadMessageId: MSG_NEW })
    );

    const res = await svc.markRead(ME, CLUB, [MSG_NEW]);

    expect(res).toEqual({ lastReadAt: createdAt, lastReadMessageId: MSG_NEW });
    const [filter, update, opts] = ChatReadState.findOneAndUpdate.mock.calls[0];
    expect(filter.userId).toBe(ME);
    expect(filter.clubMonthId).toBe(CLUB);
    // Обновляем только если сохранённое старее — монотонность.
    expect(filter.$or).toEqual([
      { lastReadAt: null },
      { lastReadAt: { $lt: createdAt } },
    ]);
    expect(update.$set).toEqual({ lastReadAt: createdAt, lastReadMessageId: MSG_NEW });
    expect(opts).toMatchObject({ upsert: true, new: true });
    // Сообщение ищется только в этом клубе.
    expect(ChatMessage.findOne.mock.calls[0][0]).toMatchObject({ clubMonthId: CLUB });
  });

  test('сохранённое новее — не откатывает (E11000 на upsert → текущее состояние)', async () => {
    const olderMsgAt = new Date('2026-11-09T10:00:00Z');
    const savedAt = new Date('2026-11-10T10:00:00Z');
    ChatMessage.findOne.mockReturnValue(chain({ _id: MSG_OLD, createdAt: olderMsgAt }));
    ChatReadState.findOneAndUpdate.mockReturnValue({
      lean: () => Promise.reject(Object.assign(new Error('dup'), { code: 11000 })),
    });
    ChatReadState.findOne.mockReturnValue(
      chain({ lastReadAt: savedAt, lastReadMessageId: MSG_NEW })
    );

    const res = await svc.markRead(ME, CLUB, [MSG_OLD]);

    expect(res).toEqual({ lastReadAt: savedAt, lastReadMessageId: MSG_NEW });
  });

  test('без upsert-ошибки и без совпадения — тоже отдаёт текущее, не меняя', async () => {
    const savedAt = new Date('2026-11-10T10:00:00Z');
    ChatMessage.findOne.mockReturnValue(
      chain({ _id: MSG_OLD, createdAt: new Date('2026-11-01T00:00:00Z') })
    );
    ChatReadState.findOneAndUpdate.mockReturnValue(chain(null));
    ChatReadState.findOne.mockReturnValue(
      chain({ lastReadAt: savedAt, lastReadMessageId: MSG_NEW })
    );

    const res = await svc.markRead(ME, CLUB, [MSG_OLD]);
    expect(res.lastReadAt).toBe(savedAt);
    expect(res.lastReadMessageId).toBe(MSG_NEW);
  });

  test('несколько id (клиент 1.0.4) — берётся самое новое', async () => {
    const createdAt = new Date('2026-11-10T10:00:00Z');
    const q = chain({ _id: MSG_NEW, createdAt });
    ChatMessage.findOne.mockReturnValue(q);
    ChatReadState.findOneAndUpdate.mockReturnValue(
      chain({ lastReadAt: createdAt, lastReadMessageId: MSG_NEW })
    );

    await svc.markRead(ME, CLUB, [MSG_OLD, MSG_NEW]);

    expect(ChatMessage.findOne.mock.calls[0][0]._id).toEqual({ $in: [MSG_OLD, MSG_NEW] });
    expect(q.calls.sort).toEqual([{ createdAt: -1 }]);
  });

  test('сообщение не из этого клуба / не найдено — null, состояние не трогаем', async () => {
    ChatMessage.findOne.mockReturnValue(chain(null));
    expect(await svc.markRead(ME, CLUB, [MSG_NEW])).toBeNull();
    expect(ChatReadState.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('невалидные id — null без запросов', async () => {
    expect(await svc.markRead(ME, CLUB, ['abc'])).toBeNull();
    expect(ChatMessage.findOne).not.toHaveBeenCalled();
  });

  test('другая ошибка БД пробрасывается', async () => {
    ChatMessage.findOne.mockReturnValue(
      chain({ _id: MSG_NEW, createdAt: new Date() })
    );
    ChatReadState.findOneAndUpdate.mockReturnValue({
      lean: () => Promise.reject(new Error('boom')),
    });
    await expect(svc.markRead(ME, CLUB, [MSG_NEW])).rejects.toThrow('boom');
  });
});

/* ----------------------------- countUnread -------------------------- */

describe('countUnread', () => {
  const NOW = new Date('2026-11-10T12:00:00Z');

  test('фильтр: видимые, не свои, не заблокированные, новее lastReadAt; cap в запросе', async () => {
    ChatMessage.countDocuments.mockResolvedValue(12);
    const lastReadAt = new Date('2026-11-10T09:00:00Z');

    const n = await svc.countUnread({
      userId: ME,
      clubMonthId: CLUB,
      lastReadAt,
      blockedIds: [BLOCKED],
      now: NOW,
    });

    expect(n).toBe(12);
    const [filter, opts] = ChatMessage.countDocuments.mock.calls[0];
    expect(filter).toEqual({
      clubMonthId: CLUB,
      isHidden: { $ne: true },
      deletedAt: null,
      createdAt: { $gt: lastReadAt },
      userId: { $nin: [ME, BLOCKED] },
    });
    expect(opts).toEqual({ limit: 99 });
  });

  test('без записи о прочитанном — только последние 7 дней', async () => {
    ChatMessage.countDocuments.mockResolvedValue(3);
    await svc.countUnread({ userId: ME, clubMonthId: CLUB, now: NOW });
    const [filter] = ChatMessage.countDocuments.mock.calls[0];
    expect(filter.createdAt.$gt.getTime()).toBe(
      NOW.getTime() - 7 * 24 * 60 * 60 * 1000
    );
    expect(filter.userId).toEqual({ $nin: [ME] });
  });

  test('cap 99, даже если БД вернула больше', async () => {
    ChatMessage.countDocuments.mockResolvedValue(500);
    const n = await svc.countUnread({ userId: ME, clubMonthId: CLUB, now: NOW });
    expect(n).toBe(99);
  });
});

/* ---------------------------- unreadForUser ------------------------- */

describe('unreadForUser', () => {
  const NOW = new Date('2026-11-15T12:00:00Z');
  const nov = {
    _id: '64c0000000000000000000a1',
    year: 2026,
    month: 11,
    startsAt: new Date(Date.UTC(2026, 10, 1)),
    endsAt: new Date(Date.UTC(2026, 10, 30, 23, 59, 59, 999)),
  };
  const oct = {
    _id: '64c0000000000000000000a2',
    year: 2026,
    month: 10,
    startsAt: new Date(Date.UTC(2026, 9, 1)),
    endsAt: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)),
  };
  const sep = {
    _id: '64c0000000000000000000a3',
    year: 2026,
    month: 9,
    startsAt: new Date(Date.UTC(2026, 8, 1)),
    endsAt: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)),
  };

  function member(extra = {}) {
    return {
      _id: ME,
      role: 'user',
      subscriptionStatus: 'basic',
      subscriptionPlan: 'monthly',
      subscriptionExpiresAt: new Date('2026-12-05T00:00:00Z'),
      clubMonthsEntitled: ['2026-10', '2026-11'],
      blockedUsers: [BLOCKED],
      ...extra,
    };
  }

  test('считает только клубы с доступом; заблокированные уходят в фильтр', async () => {
    User.findById.mockReturnValue(chain(member()));
    // Сентябрь не оплачен — computeClubAccess его не пустит.
    ClubMonth.find.mockReturnValue(chain([nov, oct, sep]));
    ChatReadState.find.mockReturnValue(
      chain([{ clubMonthId: nov._id, lastReadAt: new Date('2026-11-15T10:00:00Z') }])
    );
    ChatMessage.countDocuments.mockImplementation((filter) =>
      Promise.resolve(String(filter.clubMonthId) === nov._id ? 5 : 2)
    );

    const res = await svc.unreadForUser(ME, NOW);

    expect(res.items).toEqual([
      { clubMonthId: nov._id, unread: 5 },
      { clubMonthId: oct._id, unread: 2 },
    ]);
    expect(res.total).toBe(7);
    const filters = ChatMessage.countDocuments.mock.calls.map((c) => c[0]);
    expect(filters.every((f) => f.userId.$nin.includes(BLOCKED))).toBe(true);
    expect(filters.every((f) => f.userId.$nin.includes(ME))).toBe(true);
    // Октябрь без записи — окно 7 дней.
    const octFilter = filters.find((f) => String(f.clubMonthId) === oct._id);
    expect(octFilter.createdAt.$gt.getTime()).toBe(
      NOW.getTime() - 7 * 24 * 60 * 60 * 1000
    );
    // Будущие клубы не берём.
    expect(ClubMonth.find.mock.calls[0][0].startsAt).toEqual({ $lte: NOW });
  });

  test('total не больше 99', async () => {
    User.findById.mockReturnValue(chain(member()));
    ClubMonth.find.mockReturnValue(chain([nov, oct]));
    ChatReadState.find.mockReturnValue(chain([]));
    ChatMessage.countDocuments.mockResolvedValue(99);

    const res = await svc.unreadForUser(ME, NOW);
    expect(res.items.map((i) => i.unread)).toEqual([99, 99]);
    expect(res.total).toBe(99);
  });

  test('бан — пусто, без запросов клубов', async () => {
    User.findById.mockReturnValue(chain(member({ isBanned: true })));
    expect(await svc.unreadForUser(ME, NOW)).toEqual({ items: [], total: 0 });
    expect(ClubMonth.find).not.toHaveBeenCalled();
  });

  test('без доступа (не оплачено) — пусто', async () => {
    User.findById.mockReturnValue(
      chain(member({ subscriptionStatus: 'free', clubMonthsEntitled: [] }))
    );
    ClubMonth.find.mockReturnValue(chain([nov, oct]));
    expect(await svc.unreadForUser(ME, NOW)).toEqual({ items: [], total: 0 });
    expect(ChatMessage.countDocuments).not.toHaveBeenCalled();
  });

  test('админ — только текущий и архивное окно', async () => {
    User.findById.mockReturnValue(chain(member({ role: 'admin' })));
    ClubMonth.find.mockReturnValue(chain([nov, oct, sep]));
    ChatReadState.find.mockReturnValue(chain([]));
    ChatMessage.countDocuments.mockResolvedValue(1);

    const res = await svc.unreadForUser(ME, NOW);
    // Сентябрь: окно до 31.10 — уже закрыто.
    expect(res.items.map((i) => i.clubMonthId)).toEqual([nov._id, oct._id]);
  });

  test('«чат остаётся» — старый клуб попадает в кандидаты', async () => {
    User.findById.mockReturnValue(chain(member({ clubChatForever: ['2026-9'] })));
    ClubMonth.find.mockReturnValue(chain([]));
    await svc.unreadForUser(ME, NOW);
    expect(ClubMonth.find.mock.calls[0][0].$or).toContainEqual({ year: 2026, month: 9 });
  });
});
