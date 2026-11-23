/**
 * 23.11.2026: служебные админы команды — вход в админку без показа в клубе.
 */
const bcrypt = require('bcryptjs');
const { clubMembersFilter } = require('../src/middleware/subscription');
const { addStaff, removeAdmin } = require('../src/scripts/staff-admin');

const fakeUser = (existing) => ({
  findOne: jest.fn(() => Promise.resolve(existing)),
  updateOne: jest.fn(() => Promise.resolve({ modifiedCount: 1 })),
  create: jest.fn((doc) => Promise.resolve(doc)),
});

describe('clubMembersFilter', () => {
  const club = { year: 2026, month: 11 };

  test('в клуб попадают админы, кроме служебных', () => {
    expect(clubMembersFilter(club).$or).toEqual([
      { clubMonthsEntitled: '2026-11' },
      { role: 'admin', staffOnly: { $ne: true } },
    ]);
  });

  test('без includeAdmins — только участницы месяца', () => {
    const f = clubMembersFilter(club, { includeAdmins: false });
    expect(f.$or).toBeUndefined();
    expect(f.clubMonthsEntitled).toBe('2026-11');
  });
});

describe('staff-admin add', () => {
  test('создаёт служебного админа со входом по почте', async () => {
    const User = fakeUser(null);
    expect(await addStaff(User, { email: 'Tm@Example.com', name: 'Тамуна', password: 'abcdefghijkl' })).toBe('created');
    const doc = User.create.mock.calls[0][0];
    expect(doc).toMatchObject({ email: 'tm@example.com', name: 'Тамуна', authProvider: 'email', role: 'admin', staffOnly: true });
    expect(await bcrypt.compare('abcdefghijkl', doc.passwordHash)).toBe(true);
  });

  test('аккаунт участницы служебным не делает', async () => {
    const User = fakeUser({ _id: 'u1', staffOnly: false });
    await expect(addStaff(User, { email: 'g@example.com', name: 'Г', password: 'abcdefghijkl' })).rejects.toThrow(/участницы/);
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  test('уже служебному обновляет пароль и сбрасывает сессии', async () => {
    const User = fakeUser({ _id: 'u2', staffOnly: true });
    expect(await addStaff(User, { email: 's@example.com', name: 'С', password: 'abcdefghijkl' })).toBe('updated');
    const set = User.updateOne.mock.calls[0][1].$set;
    expect(set).toMatchObject({ role: 'admin', staffOnly: true, refreshTokens: [] });
  });

  test('короткий пароль не принимает', async () => {
    await expect(addStaff(fakeUser(null), { email: 'a@b.cd', name: 'А', password: 'short' })).rejects.toThrow(/не короче/);
  });
});

describe('staff-admin remove', () => {
  test('снимает админа, меняет пароль и сбрасывает сессии', async () => {
    const User = fakeUser({ _id: 'u3', staffOnly: false, passwordHash: 'old' });
    await removeAdmin(User, { email: 'anna@chitatel.app' });
    const set = User.updateOne.mock.calls[0][1].$set;
    expect(set.role).toBe('user');
    expect(set.refreshTokens).toEqual([]);
    expect(await bcrypt.compare('anna123456', set.passwordHash)).toBe(false);
  });

  test('неизвестная почта — ошибка', async () => {
    await expect(removeAdmin(fakeUser(null), { email: 'x@y.zz' })).rejects.toThrow(/не найден/);
  });
});
