/**
 * 23.11.2026: 500 на GET /api/crm/clients. Кэш сегментов хранил сам Query
 * Mongoose, «В клубе сейчас» и «Без доступа» ждали его оба, и второй await
 * запускал запрос повторно («Query was already executed»).
 */

jest.mock('../src/models/User', () => ({
  distinct: jest.fn(),
  find: jest.fn(),
  collection: { name: 'users' },
}));
jest.mock('../src/crm/models/CrmClient', () => ({ collection: { name: 'crmclients' } }));
jest.mock('../src/crm/models/CrmOrder', () => ({ distinct: jest.fn(), collection: { name: 'crmorders' } }));
jest.mock('../src/crm/services/settings.service', () => ({
  getCrmSettings: jest.fn(() => Promise.resolve({ rates: {} })),
}));

const User = require('../src/models/User');
const clientList = require('../src/crm/services/client-list.service');

const NOW = new Date('2026-11-23T10:00:00Z');

test('общий список id для двух сегментов запрашивается один раз', async () => {
  let runs = 0;
  // Как Query Mongoose: каждый then запускает запрос, второй раз падает.
  User.distinct.mockImplementation(() => ({
    then: (res, rej) => {
      runs += 1;
      if (runs > 1) {return Promise.reject(new Error('Query was already executed')).then(res, rej);}
      return Promise.resolve(['u1']).then(res, rej);
    },
  }));
  const resolve = clientList.segmentResolver(NOW);
  const [a, b] = await Promise.all([resolve('club'), resolve('noclub')]);
  expect(a).toEqual({ appUserId: { $in: ['u1'] } });
  expect(b).toEqual({ appUserId: { $nin: ['u1'] } });
  expect(runs).toBe(1);
});
