/**
 * Тариф 2: ссылка Zoom не должна уходить вместе с клубом тем, у кого нет
 * Тарифа 2 (resolveClubAccess убирает meetings из req.club).
 */

jest.mock('../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({ findOne: jest.fn(), findById: jest.fn() }));

const User = require('../src/models/User');
const ClubMonth = require('../src/models/ClubMonth');
const { resolveClubAccess } = require('../src/middleware/subscription');

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const key = `${year}-${month}`;

const club = {
  _id: 'c1',
  year,
  month,
  title: 'Клуб',
  startsAt: new Date(year, month - 1, 1),
  endsAt: new Date(year, month, 0, 23, 59, 59, 999),
  meetings: [
    { _id: 'm1', title: 'Встреча', startsAt: new Date(year, month - 1, 20, 19), zoomUrl: 'https://zoom.us/j/1', reminderSentAt: null },
  ],
};

function mockUser(user) {
  User.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(user) }) });
}

async function run() {
  ClubMonth.findOne.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve({ ...club }) }) });
  const req = { user: { userId: 'u1' }, params: {}, query: {} };
  const next = jest.fn();
  await resolveClubAccess(req, {}, next);
  return { req, next };
}

const base = {
  role: 'user',
  subscriptionStatus: 'basic',
  subscriptionExpiresAt: new Date(Date.now() + 86400000 * 20),
  clubMonthsEntitled: [key],
};

describe('resolveClubAccess и встречи Тарифа 2', () => {
  test('без Тарифа 2: клуб открыт, встреч нет ни в club, ни отдельно', async () => {
    mockUser({ ...base, tier2MonthsEntitled: [] });
    const { req, next } = await run();
    expect(next).toHaveBeenCalledWith();
    expect(req.club.meetings).toBeUndefined();
    expect(req.clubMeetings).toBeNull();
  });

  test('с Тарифом 2: встречи отдельно, в club их всё равно нет', async () => {
    mockUser({ ...base, subscriptionStatus: 'premium', tier2MonthsEntitled: [key] });
    const { req } = await run();
    expect(req.club.meetings).toBeUndefined();
    expect(req.clubMeetings).toEqual([
      { id: 'm1', title: 'Встреча', startsAt: club.meetings[0].startsAt, zoomUrl: 'https://zoom.us/j/1' },
    ]);
  });

  test('Тариф 2 без оплаченного клуба → 403, встреч нет', async () => {
    mockUser({ ...base, clubMonthsEntitled: [], tier2MonthsEntitled: [key] });
    const { req, next } = await run();
    expect(next.mock.calls[0][0].statusCode || next.mock.calls[0][0].status).toBe(403);
    expect(req.clubMeetings).toBeUndefined();
  });
});
