/**
 * computeClubAccess, ветка «Чат остаётся» (CRM-PLAN B4, 05.11.2026):
 * месяц из user.clubChatForever открыт режимом archive и после архивного
 * окна, но только если он есть в оплаченном наборе clubMonthsEntitled.
 * Остальные правила (текущий/будущий/архив/старый) не меняются — их держат
 * archive-window.test.js и tier2.test.js.
 *
 * БД не нужна: модели подменены jest.mock.
 */

process.env.TZ = 'Europe/Moscow';

jest.mock('../src/models/User', () => ({}));
jest.mock('../src/models/ClubMonth', () => ({}));

const { computeClubAccess } = require('../src/middleware/subscription');

// Клуб октября так, как его заводит админка (UTC-границы месяца).
const oct = {
  year: 2026,
  month: 10,
  startsAt: new Date(Date.UTC(2026, 9, 1)),
  endsAt: new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999)),
};

const IN_WINDOW = new Date('2026-11-15T12:00:00Z');
const AFTER_WINDOW = new Date('2027-03-10T12:00:00Z');

function user(extra = {}) {
  return {
    role: 'user',
    subscriptionStatus: 'expired',
    subscriptionPlan: 'monthly',
    subscriptionExpiresAt: new Date('2026-10-31T20:59:59Z'),
    clubMonthsEntitled: ['2026-10'],
    ...extra,
  };
}

describe('computeClubAccess: clubChatForever', () => {
  test('без «чат остаётся» после окна — закрыто (как раньше)', () => {
    expect(computeClubAccess(user(), oct, AFTER_WINDOW)).toBeNull();
  });

  test('месяц в clubChatForever — после окна открыт архивом, писать можно', () => {
    const a = computeClubAccess(user({ clubChatForever: ['2026-10'] }), oct, AFTER_WINDOW);
    expect(a).toMatchObject({ kind: 'archive', canPost: true });
    expect(a.isMuted).toBeFalsy();
  });

  test('ключ в clubChatForever, но месяца нет в оплаченном наборе — закрыто', () => {
    const u = user({ clubMonthsEntitled: [], clubChatForever: ['2026-10'] });
    expect(computeClubAccess(u, oct, AFTER_WINDOW)).toBeNull();
  });

  test('чат навсегда другого месяца — этот клуб не открывает', () => {
    expect(
      computeClubAccess(user({ clubChatForever: ['2026-9'] }), oct, AFTER_WINDOW)
    ).toBeNull();
  });

  test('мьют: читать можно, писать нельзя', () => {
    const muted = new Date('2027-04-01T00:00:00Z');
    const a = computeClubAccess(
      user({ clubChatForever: ['2026-10'], mutedUntil: muted }),
      oct,
      AFTER_WINDOW
    );
    expect(a).toMatchObject({ kind: 'archive', canPost: false, isMuted: true });
  });

  test('в архивном окне ответ тот же, что без поля', () => {
    const withField = computeClubAccess(user({ clubChatForever: ['2026-10'] }), oct, IN_WINDOW);
    const without = computeClubAccess(user(), oct, IN_WINDOW);
    expect(withField).toEqual(without);
    expect(withField.kind).toBe('archive');
  });

  test('текущий клуб: «чат остаётся» не заменяет подписку', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(computeClubAccess(user({ clubChatForever: ['2026-10'] }), oct, now)).toBeNull();
  });

  test('будущий клуб: «чат остаётся» не открывает анонс без подписки', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(computeClubAccess(user({ clubChatForever: ['2026-10'] }), oct, now)).toBeNull();
  });

  test('user без поля clubChatForever (старые документы) — не падает', () => {
    const u = user();
    delete u.clubChatForever;
    expect(() => computeClubAccess(u, oct, AFTER_WINDOW)).not.toThrow();
  });
});
