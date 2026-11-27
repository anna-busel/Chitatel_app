/**
 * 27.11.2026: seed-club.js вытирает чат клуба и создаёт админа со слабым
 * паролем — на рабочем сервере он должен отказываться работать.
 */
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const { assertNotProduction, MAX_TEST_USERS } = require('../src/scripts/seed-club');

test('NODE_ENV=production — отказ', () => {
  expect(() => assertNotProduction({ nodeEnv: 'production' })).toThrow(/рабочем сервере/);
});

test('живая база (много пользователей) — отказ, даже без NODE_ENV', () => {
  expect(() => assertNotProduction({ nodeEnv: 'development', usersCount: MAX_TEST_USERS + 1 })).toThrow(/рабочая база/);
});

test('тестовая база — можно', () => {
  expect(() => assertNotProduction({ nodeEnv: 'development', usersCount: 5 })).not.toThrow();
});
