/**
 * Архивное окно клуба: свой месяц + следующий календарный (правило Анны,
 * напомнено 05.11.2026). Проверяем, что окно не зависит от часового пояса
 * сервера: раньше на сервере в поясе МСК клуб октября оставался в архиве
 * до 31.12 вместо 30.11.
 *
 * БД не нужна: модели подменены jest.mock.
 */

process.env.TZ = 'Europe/Moscow';

jest.mock('../src/models/User', () => ({}));
jest.mock('../src/models/ClubMonth', () => ({}));

const { archiveWindowEnd, computeClubAccess } = require('../src/middleware/subscription');

// Клуб октября так, как его заводит админка (monthBounds в UTC).
const octAdmin = {
  year: 2026,
  month: 10,
  startsAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 0, 0)),
  endsAt: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)),
};
// Клуб сентября так, как его заводил старый скрипт (местное время МСК).
const sepLocal = {
  year: 2026,
  month: 9,
  startsAt: new Date('2026-09-01T00:00:00+03:00'),
  endsAt: new Date('2026-09-30T23:59:59.999+03:00'),
};

const NOV30_END_MSK = new Date('2026-11-30T23:59:59.999+03:00');
const OCT31_END_MSK = new Date('2026-10-31T23:59:59.999+03:00');

function expiredUser(keys) {
  return {
    subscriptionStatus: 'expired',
    subscriptionPlan: 'monthly',
    subscriptionExpiresAt: new Date('2026-10-31T00:00:00Z'),
    clubMonthsEntitled: keys,
  };
}

describe('archiveWindowEnd', () => {
  test('клуб октября из админки (UTC) → 30.11 23:59 МСК, не 31.12', () => {
    expect(archiveWindowEnd(octAdmin.endsAt).toISOString()).toBe(NOV30_END_MSK.toISOString());
  });

  test('клуб сентября из старого скрипта (МСК) → 31.10 23:59 МСК', () => {
    expect(archiveWindowEnd(sepLocal.endsAt).toISOString()).toBe(OCT31_END_MSK.toISOString());
  });

  test('декабрь → конец января следующего года', () => {
    const dec = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999));
    expect(archiveWindowEnd(dec).toISOString()).toBe(
      new Date('2027-01-31T23:59:59.999+03:00').toISOString()
    );
  });
});

describe('computeClubAccess: архив по правилу «месяц + 1»', () => {
  const user = expiredUser(['2026-10', '2026-9']);

  test('октябрьский клуб открыт архивом в ноябре', () => {
    const a = computeClubAccess(user, octAdmin, new Date('2026-11-15T12:00:00Z'));
    expect(a && a.kind).toBe('archive');
  });

  test('октябрьский клуб закрыт 1 декабря', () => {
    expect(computeClubAccess(user, octAdmin, new Date('2026-12-01T09:00:00Z'))).toBeNull();
  });

  test('сентябрьский клуб закрыт в ноябре', () => {
    expect(computeClubAccess(user, sepLocal, new Date('2026-11-05T09:00:00Z'))).toBeNull();
  });
});
