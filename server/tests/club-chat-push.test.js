/**
 * Пуши чата клуба (решение Анны 07.11.2026, UPDATES-PLAN U).
 *
 * Проверяем services/club-chat-push.service.js:
 * - пуш «Анна написала в чате клуба» уходит при сообщении админа и не уходит
 *   при сообщении участницы;
 * - антиспам 30 минут (отметка lastAnnaPushAt в ClubMonth);
 * - тем, кому уже ушёл reply/mention, второй пуш не шлём; себе не шлём;
 * - получатели — по computeClubAccess (текущий/архив), чужой месяц — нет;
 * - настройки clubAnna / clubDigest (chatMessages гейтит push.sendToUsers);
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

const ANNA = { _id: 'anna', role: 'admin' };
const MEMBER = { _id: 'm1', role: 'user' };

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

describe('пуш «Анна написала в чате клуба»', () => {
  const textMsg = { type: 'text', text: '  Девочки, завтра эфир!  ', userId: 'anna' };

  test('сообщение Анны — пуш всем читателям клуба, себе нет', async () => {
    mockUsers([reader('r1'), reader('r2'), reader('anna', { role: 'admin' })]);
    const r = await svc.notifyAnnaMessage({ club: NOV, author: ANNA, message: textMsg, now: NOW });

    expect(r.sent).toBe(2);
    expect(sentIds()).toEqual(['r1', 'r2']);
    const [, payload, key] = push.sendToUsers.mock.calls[0];
    expect(key).toBe('chatMessages');
    expect(payload).toEqual({
      title: 'Анна написала в чате клуба',
      body: 'Девочки, завтра эфир!',
      data: { type: 'mention', clubMonthId: 'club-nov' },
    });
    // Кандидаты — по месяцу клуба, без бана/удалённых.
    const filter = User.find.mock.calls[0][0];
    expect(filter.clubMonthsEntitled).toBe('2026-11');
    expect(filter.isBanned).toEqual({ $ne: true });
    expect(filter.isDeleted).toEqual({ $ne: true });
  });

  test('сообщение участницы — пуша нет, отметку не трогаем', async () => {
    mockUsers([reader('r1')]);
    const r = await svc.notifyAnnaMessage({ club: NOV, author: MEMBER, message: textMsg, now: NOW });

    expect(r.sent).toBe(0);
    expect(ClubMonth.updateOne).not.toHaveBeenCalled();
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  test('антиспам: окно 30 минут занято → пуша нет', async () => {
    mockUsers([reader('r1')]);
    ClubMonth.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const r = await svc.notifyAnnaMessage({ club: NOV, author: ANNA, message: textMsg, now: NOW });

    expect(r.skipped).toBe('cooldown');
    expect(push.sendToUsers).not.toHaveBeenCalled();
    // Условие отметки: пусто или старше 30 минут.
    const [filter, update] = ClubMonth.updateOne.mock.calls[0];
    expect(filter._id).toBe('club-nov');
    expect(filter.$or).toEqual([
      { lastAnnaPushAt: null },
      { lastAnnaPushAt: { $lte: new Date(NOW.getTime() - 30 * 60 * 1000) } },
    ]);
    expect(update).toEqual({ $set: { lastAnnaPushAt: NOW } });
  });

  test('кому ушёл reply/mention — второй пуш не шлём', async () => {
    mockUsers([reader('r1'), reader('r2'), reader('r3')]);
    await svc.notifyAnnaMessage({
      club: NOV,
      author: ANNA,
      message: textMsg,
      excludeUserIds: ['r2'],
      now: NOW,
    });
    expect(sentIds()).toEqual(['r1', 'r3']);
  });

  test('доступ по computeClubAccess: архивное окно — да, чужой месяц — нет', async () => {
    mockUsers([
      // октябрь оплачен, 10 ноября — архивное окно октябрьского клуба
      reader('arch', { clubMonthsEntitled: ['2026-10'], subscriptionExpiresAt: new Date(Date.UTC(2026, 9, 31)) }),
      // ноябрь оплачен, но подписка кончилась — текущий клуб закрыт
      reader('expired', { subscriptionExpiresAt: new Date(Date.UTC(2026, 10, 5)) }),
    ]);
    await svc.notifyAnnaMessage({ club: OCT, author: ANNA, message: textMsg, now: NOW });
    // 'expired' не оплачивала октябрь — в выборку по месяцу не попадёт и в
    // computeClubAccess тоже: шлём только архивной.
    expect(sentIds()).toEqual(['arch']);

    jest.clearAllMocks();
    ClubMonth.updateOne.mockResolvedValue({ modifiedCount: 1 });
    await svc.notifyAnnaMessage({ club: NOV, author: ANNA, message: textMsg, now: NOW });
    expect(sentIds()).toEqual([]);
  });

  test('настройка clubAnna=false — не шлём; chatMessages гейтит sendToUsers', async () => {
    mockUsers([reader('r1', { pushSettings: { clubAnna: false } }), reader('r2')]);
    await svc.notifyAnnaMessage({ club: NOV, author: ANNA, message: textMsg, now: NOW });
    expect(sentIds()).toEqual(['r2']);
    expect(push.sendToUsers.mock.calls[0][2]).toBe('chatMessages');
  });

  test('превью: текст до 140 символов, фото, голосовое', () => {
    expect(svc.messagePreview({ type: 'text', text: 'а'.repeat(300) })).toHaveLength(140);
    expect(svc.messagePreview({ type: 'image', text: 'подпись' })).toBe('Фото');
    expect(svc.messagePreview({ type: 'voice' })).toBe('Голосовое сообщение');
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
