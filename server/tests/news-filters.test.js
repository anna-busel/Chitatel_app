/**
 * Фильтры рассылки новостей из админки (03.11.2026):
 * - platform: только iPhone / только Android;
 * - audience 'tier2': только участницы с Тарифом 2 на текущий клуб,
 *   тип club_meeting, без оглядки на настройку «Новости».
 *
 * БД, APNs и FCM подменены jest.mock.
 */

jest.mock('../src/models/User', () => ({ find: jest.fn() }));
jest.mock('../src/models/Notification', () => ({ insertMany: jest.fn() }));
jest.mock('../src/services/fcm.service', () => ({
  sendToTokens: jest.fn(async (tokens) => ({ sent: tokens.length, dead: [] })),
}));
jest.mock('../src/middleware/subscription', () => ({
  clubMonthKey: () => '2026-11',
  hasTier2ForClub: (u) => (u.tier2MonthsEntitled || []).includes('2026-11'),
}));

const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const fcm = require('../src/services/fcm.service');
const push = require('../src/services/push.service');

const ios = (t) => ({ platform: 'ios', token: t });
const android = (t) => ({ platform: 'android', token: t });

function mockUsers(users) {
  User.find.mockReturnValue({ select: () => ({ lean: async () => users }) });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('onlyPlatform / hasPlatform', () => {
  const both = { devices: [ios('i1'), android('a1')], pushToken: 'i0' };

  test('all — пользователь без изменений', () => {
    expect(push.onlyPlatform(both, 'all')).toBe(both);
    expect(push.hasPlatform(both, 'all')).toBe(true);
  });

  test('ios — остаются только iOS-устройства и старый pushToken', () => {
    const u = push.onlyPlatform(both, 'ios');
    expect(u.devices).toEqual([ios('i1')]);
    expect(u.pushToken).toBe('i0');
  });

  test('android — iOS и старый pushToken убираются', () => {
    const u = push.onlyPlatform(both, 'android');
    expect(u.devices).toEqual([android('a1')]);
    expect(u.pushToken).toBeNull();
  });

  test('hasPlatform по устройствам', () => {
    expect(push.hasPlatform({ devices: [android('a')] }, 'ios')).toBe(false);
    expect(push.hasPlatform({ devices: [], pushToken: 'x' }, 'ios')).toBe(true);
    expect(push.hasPlatform({ devices: [android('a')] }, 'android')).toBe(true);
  });
});

describe('sendNews', () => {
  test('только Android: iPhone-пользователь не попадает, push только на андроид', async () => {
    mockUsers([
      { _id: 'u1', devices: [ios('i1')] },
      { _id: 'u2', devices: [ios('i2'), android('a2')] },
    ]);
    const r = await push.sendNews({ platform: 'android', title: 't', body: 'b' });
    expect(r.total).toBe(1);
    expect(Notification.insertMany.mock.calls[0][0].map((n) => n.userId)).toEqual(['u2']);
    expect(fcm.sendToTokens).toHaveBeenCalledWith(['a2'], expect.anything());
  });

  test('Тариф 2: только с месяцем Тарифа 2, тип club_meeting, настройка news не мешает', async () => {
    mockUsers([
      { _id: 'u1', devices: [android('a1')], tier2MonthsEntitled: ['2026-11'], pushSettings: { news: false } },
      { _id: 'u2', devices: [android('a2')], tier2MonthsEntitled: ['2026-10'] },
    ]);
    const r = await push.sendNews({
      audience: 'tier2',
      tier2Club: { _id: 'c1' },
      title: 'Встреча',
      body: 'Ссылка в клубе',
    });
    expect(r.total).toBe(1);
    expect(r.sent).toBe(1);
    const filter = User.find.mock.calls[0][0];
    expect(filter.tier2MonthsEntitled).toBe('2026-11');
    const n = Notification.insertMany.mock.calls[0][0][0];
    expect(n.type).toBe('club_meeting');
    expect(n.data).toEqual({ type: 'club_meeting', clubMonthId: 'c1' });
  });

  test('Тариф 2 без текущего клуба — никому', async () => {
    const r = await push.sendNews({ audience: 'tier2', title: 't', body: 'b' });
    expect(r.total).toBe(0);
    expect(User.find).not.toHaveBeenCalled();
  });

  test('обычная новость уважает выключенные «Новости»', async () => {
    mockUsers([{ _id: 'u1', devices: [android('a1')], pushSettings: { news: false } }]);
    const r = await push.sendNews({ title: 't', body: 'b' });
    expect(r.total).toBe(1);
    expect(r.sent).toBe(0);
  });
});
