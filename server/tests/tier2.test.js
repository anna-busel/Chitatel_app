/**
 * Тариф 2 «Клуб + встречи» (UPDATES-PLAN M, 28.10.2026).
 *
 * Проверяем:
 * - nextTier2Months — правила набора месяцев Тарифа 2;
 * - hasTier2ForClub — кому отдаётся ссылка на встречу;
 * - applyTransaction — покупка/возврат club.premium.* и basic не ломают
 *   клубные месяцы и правильно пишут tier2MonthsEntitled.
 *
 * БД не нужна: модели подменены jest.mock.
 */

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Purchase', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/models/Book', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Package', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({}));
jest.mock('../src/services/google-play.service', () => ({}));
jest.mock('../src/services/push.service', () => ({ sendToUser: jest.fn() }));

const User = require('../src/models/User');
const Purchase = require('../src/models/Purchase');
const {
  nextTier2Months,
  hasTier2ForClub,
  serializeMeetings,
  computeClubAccess,
} = require('../src/middleware/subscription');
const { applyTransaction } = require('../src/services/purchase.service');

/* ----------------------------- helpers ----------------------------- */

// Клуб календарного месяца (как нормализует admin-club: границы месяца).
function club(year, month, extra = {}) {
  return {
    year,
    month,
    startsAt: new Date(year, month - 1, 1),
    endsAt: new Date(year, month, 0, 23, 59, 59, 999),
    ...extra,
  };
}

const NOW = new Date(2026, 10, 10, 12, 0, 0); // 10 ноября 2026
const NOV = club(2026, 11);

function subscriber(extra = {}) {
  return {
    role: 'user',
    subscriptionStatus: 'basic',
    subscriptionExpiresAt: new Date(2026, 11, 5),
    clubMonthsEntitled: ['2026-11'],
    tier2MonthsEntitled: [],
    ...extra,
  };
}

function lean(value) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function userDoc(fields) {
  const doc = { purchasedBooks: [], purchasedPackages: [], ...fields };
  doc.save = jest.fn().mockResolvedValue(doc);
  return doc;
}

function tx(productId, extra = {}) {
  return {
    productId,
    originalTransactionId: 'otx-1',
    transactionId: 'tx-1',
    purchaseDate: new Date(2026, 10, 3).getTime(), // 3 ноября
    expiresDate: new Date(2099, 0, 1).getTime(),
    ...extra,
  };
}

/* -------------------------- nextTier2Months ------------------------ */

describe('nextTier2Months', () => {
  test('оплата premium добавляет оплаченные месяцы без дублей', () => {
    expect(
      nextTier2Months(['2026-10'], {
        tier: 'premium',
        status: 'active',
        grantedKeys: ['2026-10', '2026-11'],
      })
    ).toEqual(['2026-10', '2026-11']);
  });

  test('месяц льготного периода тоже добавляется', () => {
    expect(
      nextTier2Months([], {
        tier: 'premium',
        status: 'active',
        grantedKeys: ['2026-11'],
        graceKey: '2026-12',
      })
    ).toEqual(['2026-11', '2026-12']);
  });

  test('оплата basic набор не трогает (переход на basic не отбирает оплаченное)', () => {
    expect(
      nextTier2Months(['2026-11'], {
        tier: 'basic',
        status: 'active',
        grantedKeys: ['2026-12'],
      })
    ).toEqual(['2026-11']);
  });

  test('возврат снимает только месяцы этой транзакции', () => {
    expect(
      nextTier2Months(['2026-10', '2026-11'], {
        tier: 'premium',
        status: 'refunded',
        grantedKeys: ['2026-11'],
      })
    ).toEqual(['2026-10']);
  });

  test('истечение и отмена автопродления набор не трогают', () => {
    ['expired', 'cancelled'].forEach((status) => {
      expect(
        nextTier2Months(['2026-11'], {
          tier: 'premium',
          status,
          grantedKeys: ['2026-11'],
        })
      ).toEqual(['2026-11']);
    });
  });

  test('пустой/отсутствующий набор не падает', () => {
    expect(
      nextTier2Months(undefined, {
        tier: 'premium',
        status: 'active',
        grantedKeys: ['2026-11'],
      })
    ).toEqual(['2026-11']);
  });
});

/* -------------------------- hasTier2ForClub ------------------------ */

describe('hasTier2ForClub', () => {
  test('клуб оплачен + месяц Тарифа 2 → да', () => {
    expect(
      hasTier2ForClub(subscriber({ tier2MonthsEntitled: ['2026-11'] }), NOV, NOW)
    ).toBe(true);
  });

  test('клуб оплачен, Тарифа 2 нет → нет', () => {
    expect(hasTier2ForClub(subscriber(), NOV, NOW)).toBe(false);
  });

  test('Тариф 2 на другой месяц → нет', () => {
    expect(
      hasTier2ForClub(subscriber({ tier2MonthsEntitled: ['2026-10'] }), NOV, NOW)
    ).toBe(false);
  });

  test('месяц Тарифа 2 есть, но доступа к клубу нет → нет (Тариф 2 не обходит клуб)', () => {
    const u = subscriber({
      clubMonthsEntitled: [],
      tier2MonthsEntitled: ['2026-11'],
    });
    expect(computeClubAccess(u, NOV, NOW)).toBeNull();
    expect(hasTier2ForClub(u, NOV, NOW)).toBe(false);
  });

  test('админ (Анна) видит встречи всегда', () => {
    expect(hasTier2ForClub({ role: 'admin' }, NOV, NOW)).toBe(true);
  });
});

describe('serializeMeetings', () => {
  test('сортирует по времени и не отдаёт служебное reminderSentAt', () => {
    const later = new Date(2026, 10, 20, 19);
    const earlier = new Date(2026, 10, 12, 19);
    const out = serializeMeetings({
      meetings: [
        { _id: 'b', title: 'Вторая', startsAt: later, zoomUrl: 'https://zoom.us/j/2', reminderSentAt: null },
        { _id: 'a', title: 'Первая', startsAt: earlier, zoomUrl: 'https://zoom.us/j/1', reminderSentAt: new Date() },
      ],
    });
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out[0]).toEqual({
      id: 'a',
      title: 'Первая',
      startsAt: earlier,
      zoomUrl: 'https://zoom.us/j/1',
    });
  });

  test('клуб без встреч → пустой массив', () => {
    expect(serializeMeetings({})).toEqual([]);
  });
});

/* -------------------------- applyTransaction ----------------------- */

describe('applyTransaction и Тариф 2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Purchase.findOne.mockReturnValue(lean(null));
    Purchase.findOneAndUpdate.mockResolvedValue({});
  });

  test('покупка club.premium.monthly: клубный месяц + месяц Тарифа 2', async () => {
    const user = userDoc({ clubMonthsEntitled: [], tier2MonthsEntitled: [] });
    User.findById.mockResolvedValue(user);

    await applyTransaction({
      userId: '5f0000000000000000000001',
      decodedTransaction: tx('club.premium.monthly'),
    });

    expect(user.subscriptionStatus).toBe('premium');
    expect(user.clubMonthsEntitled).toEqual(['2026-11']);
    expect(user.tier2MonthsEntitled).toEqual(['2026-11']);
    expect(user.save).toHaveBeenCalled();
  });

  test('покупка club.basic.monthly: клубный месяц есть, Тарифа 2 нет', async () => {
    const user = userDoc({ clubMonthsEntitled: [], tier2MonthsEntitled: [] });
    User.findById.mockResolvedValue(user);

    await applyTransaction({
      userId: '5f0000000000000000000001',
      decodedTransaction: tx('club.basic.monthly'),
    });

    expect(user.subscriptionStatus).toBe('basic');
    expect(user.clubMonthsEntitled).toEqual(['2026-11']);
    expect(user.tier2MonthsEntitled).toEqual([]);
  });

  test('возврат premium снимает и клубный месяц, и Тариф 2 этого месяца', async () => {
    const user = userDoc({
      clubMonthsEntitled: ['2026-10', '2026-11'],
      tier2MonthsEntitled: ['2026-10', '2026-11'],
    });
    User.findById.mockResolvedValue(user);

    await applyTransaction({
      userId: '5f0000000000000000000001',
      decodedTransaction: tx('club.premium.monthly', {
        revocationDate: Date.now(),
      }),
    });

    expect(user.clubMonthsEntitled).toEqual(['2026-10']);
    expect(user.tier2MonthsEntitled).toEqual(['2026-10']);
  });

  test('продление basic после premium не отбирает оплаченный месяц Тарифа 2', async () => {
    const user = userDoc({
      clubMonthsEntitled: ['2026-11'],
      tier2MonthsEntitled: ['2026-11'],
    });
    User.findById.mockResolvedValue(user);

    await applyTransaction({
      userId: '5f0000000000000000000001',
      decodedTransaction: tx('club.basic.monthly', {
        purchaseDate: new Date(2026, 11, 3).getTime(), // декабрь
      }),
    });

    expect(user.clubMonthsEntitled).toEqual(['2026-11', '2026-12']);
    expect(user.tier2MonthsEntitled).toEqual(['2026-11']);
  });

  test('старый пользователь без поля tier2MonthsEntitled — не падает', async () => {
    const user = userDoc({ clubMonthsEntitled: [] });
    User.findById.mockResolvedValue(user);

    await applyTransaction({
      userId: '5f0000000000000000000001',
      decodedTransaction: tx('club.premium.monthly'),
    });

    expect(user.tier2MonthsEntitled).toEqual(['2026-11']);
  });
});

/* -------------------------- dueMeetings ---------------------------- */

describe('dueMeetings (пуш за час до встречи)', () => {
  // eslint-disable-next-line global-require
  const { dueMeetings } = require('../src/jobs/meeting-reminders');
  const now = new Date(2026, 10, 12, 18, 0);
  const at = (h, min) => new Date(2026, 10, 12, h, min);

  test('берёт встречи, до которых не больше часа, без отправленного напоминания', () => {
    const c = club(2026, 11, {
      meetings: [
        { _id: 'soon', startsAt: at(18, 45), reminderSentAt: null },
        { _id: 'exact', startsAt: at(19, 0), reminderSentAt: null },
        { _id: 'later', startsAt: at(19, 30), reminderSentAt: null },
        { _id: 'past', startsAt: at(17, 30), reminderSentAt: null },
        { _id: 'sent', startsAt: at(18, 30), reminderSentAt: at(17, 35) },
      ],
    });
    expect(dueMeetings([c], now).map((d) => d.meeting._id)).toEqual(['soon', 'exact']);
  });

  test('клуб без встреч и пустой список не падают', () => {
    expect(dueMeetings([club(2026, 11)], now)).toEqual([]);
    expect(dueMeetings(undefined, now)).toEqual([]);
  });
});
