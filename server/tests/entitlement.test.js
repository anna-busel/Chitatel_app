/**
 * services/entitlement.service.js (CRM-PLAN B1, 05.11.2026): единая выдача и
 * снятие прав. Пояс сервера нарочно экзотический (+14): концы месяцев не
 * должны от него зависеть.
 *
 * БД не нужна: модели подменены jest.mock.
 */

process.env.TZ = 'Pacific/Kiritimati';

jest.mock('../src/models/User', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({}));
jest.mock('../src/models/Purchase', () => ({
  create: jest.fn(() => Promise.resolve({})),
  findOneAndUpdate: jest.fn(() => Promise.resolve({})),
  updateMany: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const Purchase = require('../src/models/Purchase');
const ent = require('../src/services/entitlement.service');
const { computeClubAccess } = require('../src/middleware/subscription');

function makeUser(extra = {}) {
  return {
    _id: 'u1',
    subscriptionStatus: 'free',
    subscriptionPlan: null,
    subscriptionExpiresAt: null,
    clubMonthsEntitled: [],
    tier2MonthsEntitled: [],
    clubChatForever: [],
    purchasedBooks: [],
    purchasedPackages: [],
    save: jest.fn(() => Promise.resolve()),
    ...extra,
  };
}

const iso = (d) => new Date(d).toISOString();

beforeEach(() => jest.clearAllMocks());

describe('месяцы и сроки', () => {
  test('конец месяца по ключу — последний день 23:59:59.999 UTC, без пояса сервера', () => {
    expect(iso(ent.monthKeyEnd('2026-2'))).toBe('2026-02-28T23:59:59.999Z');
    expect(iso(ent.monthKeyEnd('2026-12'))).toBe('2026-12-31T23:59:59.999Z');
    expect(iso(ent.monthKeyEnd('2028-02'))).toBe('2028-02-29T23:59:59.999Z');
  });

  test('конец месяца не раньше конца клуба из админки (endsAt в UTC)', () => {
    const clubEndsAt = new Date(Date.UTC(2026, 10, 30, 23, 59, 59, 999));
    expect(ent.monthKeyEnd('2026-11').getTime()).toBeGreaterThanOrEqual(clubEndsAt.getTime());
  });

  test('lastMonthEnd берёт последний месяц набора, порядок не важен', () => {
    expect(iso(ent.lastMonthEnd(['2027-1', '2026-12', '2027-2']))).toBe('2027-02-28T23:59:59.999Z');
    expect(ent.lastMonthEnd([])).toBeNull();
  });

  test('ключи с ведущим нулём нормализуются (L1: в User без нуля)', () => {
    expect(ent.normalizeMonthKey('2026-01')).toBe('2026-1');
    expect(ent.normalizeMonthKey('2026-13')).toBeNull();
    expect(ent.normalizeMonthKey('мусор')).toBeNull();
  });

  test('clubMonthKeysBetween — как было в админке', () => {
    expect(
      ent.clubMonthKeysBetween(new Date('2026-11-05T00:00:00Z'), new Date('2027-02-10T00:00:00Z'))
    ).toEqual(['2026-11', '2026-12', '2027-1', '2027-2']);
  });
});

describe('grantClubMonths: режим CRM (срок = max, L2)', () => {
  test('сезон дек–фев, выданный в октябре: срок до конца февраля, клуб января открыт', async () => {
    const u = makeUser();
    const snap = await ent.grantClubMonths(u, ['2026-12', '2027-01', '2027-02'], {
      plan: 'season',
      source: 'crm',
      orderId: 'o1',
    });
    expect(u.clubMonthsEntitled).toEqual(['2026-12', '2027-1', '2027-2']);
    expect(u.subscriptionStatus).toBe('basic');
    expect(u.subscriptionPlan).toBe('season');
    expect(iso(u.subscriptionExpiresAt)).toBe('2027-02-28T23:59:59.999Z');
    expect(snap.subscription.prev).toEqual({ status: 'free', plan: null, expiresAt: null });
    expect(u.save).toHaveBeenCalled();

    const jan = {
      year: 2027,
      month: 1,
      startsAt: new Date(Date.UTC(2027, 0, 1)),
      endsAt: new Date(Date.UTC(2027, 0, 31, 23, 59, 59, 999)),
    };
    const lean = { ...u };
    expect(computeClubAccess(lean, jan, new Date('2026-10-20T12:00:00Z')).kind).toBe('future');
    expect(computeClubAccess(lean, jan, new Date('2027-01-31T23:30:00Z')).kind).toBe('active');
  });

  test('более поздний срок (например, годовая из App Store) не укорачивается', async () => {
    const later = new Date('2027-06-01T00:00:00Z');
    const u = makeUser({
      subscriptionStatus: 'basic',
      subscriptionPlan: 'annual',
      subscriptionExpiresAt: later,
    });
    const snap = await ent.grantClubMonths(u, ['2026-11'], { plan: 'monthly', source: 'crm', orderId: 'o1' });
    expect(u.subscriptionExpiresAt).toBe(later);
    expect(u.subscriptionPlan).toBe('annual');
    expect(snap.subscription.set).toBeNull();
  });

  test('premium с действующей подпиской не понижается до basic', async () => {
    const u = makeUser({
      subscriptionStatus: 'premium',
      subscriptionPlan: 'monthly',
      subscriptionExpiresAt: new Date(Date.now() + 86400000),
    });
    await ent.grantClubMonths(u, ['2099-1'], { source: 'crm', orderId: 'o1' });
    expect(u.subscriptionStatus).toBe('premium');
    expect(iso(u.subscriptionExpiresAt)).toBe('2099-01-31T23:59:59.999Z');
  });

  test('уже бывшие месяцы попадают в preexisting', async () => {
    const u = makeUser({ clubMonthsEntitled: ['2026-11'] });
    const snap = await ent.grantClubMonths(u, ['2026-11', '2026-12'], { source: 'crm', orderId: 'o1' });
    expect(snap.months).toEqual(['2026-11', '2026-12']);
    expect(snap.preexisting.months).toEqual(['2026-11']);
    expect(u.clubMonthsEntitled).toEqual(['2026-11', '2026-12']);
  });

  test('chatForever пишет clubChatForever; запись Purchase — с id заказа', async () => {
    const u = makeUser();
    await ent.grantClubMonths(u, ['2026-11'], { source: 'crm', orderId: 'o7', chatForever: true });
    expect(u.clubChatForever).toEqual(['2026-11']);
    expect(Purchase.findOneAndUpdate).toHaveBeenCalledWith(
      { transactionId: 'crm-o7-sub' },
      expect.objectContaining({ $set: expect.objectContaining({ platform: 'web', status: 'active' }) }),
      expect.objectContaining({ upsert: true })
    );
    expect(Purchase.create).not.toHaveBeenCalled();
  });
});

describe('grantManualSubscription (админка, поведение до 05.11)', () => {
  test('план от сейчас: срок = +N мес., месяцы по плану, Purchase manual-sub', async () => {
    const u = makeUser();
    const before = Date.now();
    const { expiresAt } = await ent.grantManualSubscription(u, { status: 'basic', plan: 'season' });
    const expected = new Date(before);
    expected.setMonth(expected.getMonth() + 3);
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5000);
    expect(u.subscriptionExpiresAt).toBe(expiresAt);
    expect(u.subscriptionPlan).toBe('season');
    expect(u.clubMonthsEntitled).toHaveLength(3);
    expect(u.tier2MonthsEntitled).toEqual([]);
    expect(Purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: 'subscription',
        itemId: 'season',
        platform: 'web',
        transactionId: expect.stringMatching(/^manual-sub-u1-season-\d+$/),
        expiresAt,
        status: 'active',
      })
    );
  });

  test('premium с датой: точный срок, месяцы до даты, те же — в Тариф 2', async () => {
    const u = makeUser({ subscriptionExpiresAt: new Date('2030-01-01T00:00:00Z') });
    const date = new Date(Date.now() + 40 * 86400000);
    await ent.grantManualSubscription(u, { status: 'premium', plan: 'monthly', expiresAt: date });
    expect(u.subscriptionStatus).toBe('premium');
    expect(u.subscriptionExpiresAt).toBe(date); // ровно как ввели, даже если раньше было позже
    expect(u.clubMonthsEntitled.length).toBeGreaterThanOrEqual(2);
    expect(u.tier2MonthsEntitled).toEqual(u.clubMonthsEntitled);
  });

  test('дата в прошлом → 400', async () => {
    const u = makeUser();
    await expect(
      ent.grantManualSubscription(u, { status: 'basic', plan: 'monthly', expiresAt: new Date(Date.now() - 1000) })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(u.save).not.toHaveBeenCalled();
  });
});

describe('разборы и пакеты', () => {
  test('grantBooks: без дублей, preexisting, запись для «Моих покупок»', async () => {
    const u = makeUser({ purchasedBooks: ['b1'] });
    const res = await ent.grantBooks(
      u,
      [
        { _id: 'b1', bookSlug: 'one', priceUsd: 5 },
        { _id: 'b2', bookSlug: 'two', priceUsd: 7 },
      ],
      { source: 'crm', orderId: 'o1' }
    );
    expect(u.purchasedBooks).toEqual(['b1', 'b2']);
    expect(res.preexisting.bookIds).toEqual(['b1']);
    expect(Purchase.findOneAndUpdate).toHaveBeenCalledWith(
      { transactionId: 'crm-o1-book-two' },
      expect.objectContaining({
        $set: expect.objectContaining({ itemType: 'book', itemId: 'two', appleProductId: 'book.two' }),
      }),
      expect.anything()
    );
  });

  test('grantPackage в режиме админки — Purchase.create с manual-pkg', async () => {
    const u = makeUser();
    await ent.grantPackage(u, { _id: 'p1', packageSlug: 'pack', priceUsd: 20 });
    expect(u.purchasedPackages).toEqual(['p1']);
    expect(Purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: 'package',
        appleProductId: 'package.pack',
        transactionId: expect.stringMatching(/^manual-pkg-u1-pack-/),
        priceUsd: 20,
      })
    );
  });
});

describe('revokeGranted: снять ровно выданное', () => {
  async function grantSeason(u) {
    const snap = await ent.grantClubMonths(u, ['2026-10', '2026-11', '2026-12'], {
      plan: 'season',
      source: 'crm',
      orderId: 'o1',
      chatForever: true,
    });
    return {
      months: snap.months,
      bookIds: [],
      packageIds: [],
      subscriptionSet: {
        chatMonths: snap.chatMonths,
        preexisting: snap.preexisting,
        subscription: snap.subscription,
      },
    };
  }

  test('не снимает бывшее до заказа и то, что держат другие заказы', async () => {
    const u = makeUser({ clubMonthsEntitled: ['2026-10'] }); // октябрь — из App Store
    const granted = await grantSeason(u);
    const removed = await ent.revokeGranted(
      u,
      granted,
      {
        keep: { months: ['2026-12'], chatMonths: ['2026-12'], expiresAt: ent.monthKeyEnd('2026-12') },
        orderId: 'o1',
      }
    );
    expect(removed.months).toEqual(['2026-11']);
    expect(u.clubMonthsEntitled).toEqual(['2026-10', '2026-12']);
    // «Чат навсегда» октября выдал этот заказ (сам месяц был раньше) — снимается.
    expect(u.clubChatForever).toEqual(['2026-12']);
    expect(iso(u.subscriptionExpiresAt)).toBe('2026-12-31T23:59:59.999Z');
    expect(Purchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: { $regex: '^crm-o1-' }, platform: 'web' }),
      { $set: { status: 'cancelled' } }
    );
  });

  test('без других источников — срок и статус возвращаются к прежним', async () => {
    const u = makeUser();
    const granted = await grantSeason(u);
    await ent.revokeGranted(u, granted, { orderId: 'o1' });
    expect(u.clubMonthsEntitled).toEqual([]);
    expect(u.subscriptionStatus).toBe('free');
    expect(u.subscriptionExpiresAt).toBeNull();
  });

  test('срок, который после заказа поменял кто-то другой, не трогаем', async () => {
    const u = makeUser();
    const granted = await grantSeason(u);
    const apple = new Date('2027-05-01T00:00:00Z');
    u.subscriptionExpiresAt = apple;
    await ent.revokeGranted(u, granted, { orderId: 'o1' });
    expect(u.subscriptionExpiresAt).toBe(apple);
    expect(u.subscriptionStatus).toBe('basic');
  });

  test("only:'content' снимает только разборы и пакеты", async () => {
    const u = makeUser({ clubMonthsEntitled: ['2026-11'], purchasedBooks: ['b1', 'b2'] });
    await ent.revokeGranted(
      u,
      { months: ['2026-11'], bookIds: ['b2'], packageIds: [], subscriptionSet: {} },
      { only: 'content', orderId: 'o1' }
    );
    expect(u.clubMonthsEntitled).toEqual(['2026-11']);
    expect(u.purchasedBooks).toEqual(['b1']);
    expect(Purchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: { $in: ['book', 'package'] } }),
      expect.anything()
    );
  });
});
