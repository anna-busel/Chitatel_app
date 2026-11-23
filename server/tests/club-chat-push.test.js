/**
 * Пуши чата клуба.
 *
 * Проверяем services/club-chat-push.service.js:
 * - пуш о КАЖДОМ сообщении в чате (решение Анны 15.11.2026): получатели —
 *   все с доступом к клубу (computeClubAccess, плюс админы как в E1), без
 *   автора, без заблокировавших автора, без исключённых (reply/mention,
 *   онлайн в комнате); настройки clubAll / clubAnna (chatMessages гейтит
 *   push.sendToUsers); старые аккаунты без полей — получают; один пуш на
 *   получателя; текст для фото/голосового; скрытые/удалённые — без пуша;
 * - вечерняя сводка: склонение, N=0 не шлёт, повтор отсекается.
 *
 * БД не нужна: модели и push.service подменены jest.mock.
 */

jest.mock('../src/models/User', () => ({ find: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({
  updateOne: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../src/models/ChatMessage', () => ({ countDocuments: jest.fn() }));
jest.mock('../src/services/push.service', () => ({
  sendToUsers: jest.fn(async (users) => ({ total: users.length, sent: users.length })),
}));

const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const ChatMessage = require('../src/models/ChatMessage');
const push = require('../src/services/push.service');
const svc = require('../src/services/club-chat-push.service');

const NOW = new Date(Date.UTC(2026, 10, 10, 15, 0, 0)); // 10 ноября 2026
const NOV = {
  _id: 'club-nov',
  year: 2026,
  month: 11,
  title: 'Бегство от свободы',
  startsAt: new Date(Date.UTC(2026, 10, 1)),
  endsAt: new Date(Date.UTC(2026, 10, 30, 23, 59, 59, 999)),
};
const OCT = {
  _id: 'club-oct',
  year: 2026,
  month: 10,
  startsAt: new Date(Date.UTC(2026, 9, 1)),
  endsAt: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)),
};

const ANNA = { _id: 'anna', role: 'admin', name: 'Анна' };
const MEMBER = { _id: 'm1', role: 'user', name: 'Оля' };

function reader(id, extra = {}) {
  return {
    _id: id,
    role: 'user',
    subscriptionStatus: 'basic',
    subscriptionExpiresAt: new Date(Date.UTC(2026, 11, 5)),
    clubMonthsEntitled: ['2026-11'],
    devices: [{ platform: 'ios', token: `t-${id}` }],
    pushSettings: {},
    ...extra,
  };
}

// User.find(...).select().sort().limit().lean() — одна страница.
function mockUsers(users) {
  User.find.mockReturnValue({
    select: () => ({ sort: () => ({ limit: () => ({ lean: async () => users }) }) }),
  });
}

function sentIds() {
  return push.sendToUsers.mock.calls.flatMap(([users]) => users.map((u) => u._id));
}

beforeEach(() => {
  jest.clearAllMocks();
  ClubMonth.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('пуш о новом сообщении в чате клуба', () => {
  const memberMsg = { _id: 'msg1', type: 'text', text: '  Мне понравилась глава  ', userId: 'm1' };
  const annaMsg = { _id: 'msg2', type: 'text', text: 'Девочки, завтра эфир!', userId: 'anna' };

  test('сообщение участницы — всем с доступом, кроме автора; текст «Имя: текст»', async () => {
    mockUsers([reader('r1'), reader('m1'), reader('anna', { role: 'admin', clubMonthsEntitled: [] })]);
    const r = await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: memberMsg, now: NOW });

    expect(r.sent).toBe(2);
    expect(sentIds()).toEqual(['r1', 'anna']);
    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
    const [, payload, key] = push.sendToUsers.mock.calls[0];
    expect(key).toBe('chatMessages');
    expect(payload).toEqual({
      title: 'Бегство от свободы',
      body: 'Оля: Мне понравилась глава',
      data: { type: 'mention', clubMonthId: 'club-nov', messageId: 'msg1' },
      threadId: 'club-club-nov',
    });
    // Кандидаты — как список участниц E1: месяц клуба или админ, без бана/
    // удалённых, с устройством; без тех, кто заблокировал автора.
    const filter = User.find.mock.calls[0][0];
    const [members, hasDevice] = filter.$and;
    expect(members.$or).toEqual([{ clubMonthsEntitled: '2026-11' }, { role: 'admin', staffOnly: { $ne: true } }]);
    expect(members.isBanned).toEqual({ $ne: true });
    expect(members.isDeleted).toEqual({ $ne: true });
    expect(hasDevice.$or).toHaveLength(2);
    expect(filter.blockedUsers).toEqual({ $ne: 'm1' });
  });

  test('сообщение Анны — прежний текст, один пуш на получателя', async () => {
    mockUsers([
      reader('r1'),
      reader('r2', { pushSettings: { clubAll: true, clubAnna: true } }),
      reader('anna', { role: 'admin' }),
    ]);
    await svc.notifyChatMessage({ club: NOV, author: ANNA, message: annaMsg, now: NOW });

    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
    expect(sentIds()).toEqual(['r1', 'r2']);
    const [, payload] = push.sendToUsers.mock.calls[0];
    expect(payload.title).toBe('Анна написала в чате клуба');
    expect(payload.body).toBe('Девочки, завтра эфир!');
    expect(payload.data).toEqual({ type: 'mention', clubMonthId: 'club-nov', messageId: 'msg2' });
  });

  test('настройки: clubAll=false — только сообщения Анны при clubAnna; оба false — ничего', async () => {
    const users = [
      reader('all'), // старый аккаунт без полей — получает всё
      reader('annaOnly', { pushSettings: { clubAll: false } }),
      reader('none', { pushSettings: { clubAll: false, clubAnna: false } }),
      reader('allNoAnna', { pushSettings: { clubAnna: false } }),
    ];
    mockUsers(users);
    await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: memberMsg, now: NOW });
    expect(sentIds()).toEqual(['all', 'allNoAnna']);

    jest.clearAllMocks();
    mockUsers(users);
    await svc.notifyChatMessage({ club: NOV, author: ANNA, message: annaMsg, now: NOW });
    expect(sentIds()).toEqual(['all', 'annaOnly', 'allNoAnna']);
  });

  test('chatMessages=false — отсекает sendToUsers (гейт передаётся)', async () => {
    mockUsers([reader('r1', { pushSettings: { chatMessages: false } })]);
    await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: memberMsg, now: NOW });
    expect(push.sendToUsers.mock.calls[0][2]).toBe('chatMessages');
  });

  test('старый аккаунт: pushSettings нет совсем — получает', async () => {
    mockUsers([reader('old', { pushSettings: undefined })]);
    await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: memberMsg, now: NOW });
    expect(sentIds()).toEqual(['old']);
  });

  test('исключённые (reply/mention, онлайн в комнате) — не получают', async () => {
    mockUsers([reader('r1'), reader('r2'), reader('r3')]);
    await svc.notifyChatMessage({
      club: NOV,
      author: MEMBER,
      message: memberMsg,
      excludeUserIds: ['r2', 'r3'],
      now: NOW,
    });
    expect(sentIds()).toEqual(['r1']);
  });

  test('доступ по computeClubAccess: архивное окно — да, истёкшая подписка — нет', async () => {
    mockUsers([
      reader('arch', { clubMonthsEntitled: ['2026-10'], subscriptionExpiresAt: new Date(Date.UTC(2026, 9, 31)) }),
    ]);
    await svc.notifyChatMessage({ club: OCT, author: MEMBER, message: memberMsg, now: NOW });
    expect(sentIds()).toEqual(['arch']);

    jest.clearAllMocks();
    mockUsers([reader('expired', { subscriptionExpiresAt: new Date(Date.UTC(2026, 10, 5)) })]);
    await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: memberMsg, now: NOW });
    expect(sentIds()).toEqual([]);
  });

  test('скрытое или удалённое сообщение — пуша нет', async () => {
    mockUsers([reader('r1')]);
    const a = await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: { ...memberMsg, isHidden: true }, now: NOW });
    const b = await svc.notifyChatMessage({ club: NOV, author: MEMBER, message: { ...memberMsg, deletedAt: NOW }, now: NOW });
    expect(a.skipped).toBe('not_live');
    expect(b.skipped).toBe('not_live');
    expect(User.find).not.toHaveBeenCalled();
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  test('текст: фото, голосовое, обрезка, без имени и названия клуба', () => {
    const club = { _id: 'c' };
    expect(svc.chatPushPayload(NOV, MEMBER, { _id: 'x', type: 'image', text: 'подпись' }).body)
      .toBe('Оля: 📷 Фото');
    expect(svc.chatPushPayload(NOV, ANNA, { _id: 'x', type: 'voice' }).body).toBe('🎤 Голосовое');
    const p = svc.chatPushPayload(club, { _id: 'u', role: 'user' }, { _id: 'x', type: 'text', text: 'а'.repeat(300) });
    expect(p.title).toBe('Чат клуба');
    expect(p.body).toBe(`Участница: ${'а'.repeat(100)}…`);
    expect(svc.messagePreview({ type: 'text', text: 'коротко' })).toBe('коротко');
  });

  test('wantsChatPush', () => {
    expect(svc.wantsChatPush({}, false)).toBe(true);
    expect(svc.wantsChatPush({ pushSettings: { clubAll: false } }, false)).toBe(false);
    expect(svc.wantsChatPush({ pushSettings: { clubAll: false } }, true)).toBe(true);
    expect(svc.wantsChatPush({ pushSettings: { clubAll: false, clubAnna: false } }, true)).toBe(false);
  });
});

describe('вечерняя сводка', () => {
  function mockClub(club) {
    ClubMonth.findOne.mockReturnValue({ sort: () => ({ lean: async () => club }) });
  }

  test('склонение', () => {
    expect(svc.newMessagesLabel(1)).toBe('1 новое сообщение');
    expect(svc.newMessagesLabel(2)).toBe('2 новых сообщения');
    expect(svc.newMessagesLabel(4)).toBe('4 новых сообщения');
    expect(svc.newMessagesLabel(5)).toBe('5 новых сообщений');
    expect(svc.newMessagesLabel(11)).toBe('11 новых сообщений');
    expect(svc.newMessagesLabel(12)).toBe('12 новых сообщений');
    expect(svc.newMessagesLabel(21)).toBe('21 новое сообщение');
    expect(svc.newMessagesLabel(22)).toBe('22 новых сообщения');
    expect(svc.newMessagesLabel(111)).toBe('111 новых сообщений');
  });

  test('N > 0 — пуш читателям текущего клуба', async () => {
    mockClub(NOV);
    ChatMessage.countDocuments.mockResolvedValue(3);
    mockUsers([reader('r1'), reader('r2', { pushSettings: { clubDigest: false } })]);

    const r = await svc.sendDailyDigest(NOW);

    expect(r.count).toBe(3);
    expect(sentIds()).toEqual(['r1']);
    const [, payload, key] = push.sendToUsers.mock.calls[0];
    expect(key).toBe('chatMessages');
    expect(payload).toEqual({
      title: 'Чат клуба',
      body: 'За сегодня в чате 3 новых сообщения',
      data: { type: 'mention', clubMonthId: 'club-nov' },
    });
    // Считаем только живые сообщения за 24 часа.
    expect(ChatMessage.countDocuments).toHaveBeenCalledWith({
      clubMonthId: 'club-nov',
      createdAt: { $gte: new Date(NOW.getTime() - 24 * 60 * 60 * 1000) },
      isHidden: { $ne: true },
      deletedAt: null,
    });
  });

  test('N = 0 — не шлём и отметку не ставим', async () => {
    mockClub(NOV);
    ChatMessage.countDocuments.mockResolvedValue(0);
    const r = await svc.sendDailyDigest(NOW);
    expect(r.skipped).toBe('empty');
    expect(ClubMonth.updateOne).not.toHaveBeenCalled();
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  test('сводка уже ушла (рестарт) — второй раз не шлём', async () => {
    mockClub(NOV);
    ChatMessage.countDocuments.mockResolvedValue(7);
    ClubMonth.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const r = await svc.sendDailyDigest(NOW);
    expect(r.skipped).toBe('already_sent');
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  test('нет текущего клуба — ничего', async () => {
    mockClub(null);
    const r = await svc.sendDailyDigest(NOW);
    expect(r.skipped).toBe('no_club');
    expect(ChatMessage.countDocuments).not.toHaveBeenCalled();
  });
});
