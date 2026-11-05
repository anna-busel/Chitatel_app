/**
 * CRM B6 (05.11.2026): ручная привязка клиентки к аккаунту приложения —
 * POST /api/crm/clients/:id/link {email} и /unlink. Права (orders) и журнал
 * (CrmAudit) — как у остальных роутов CRM.
 *
 * БД не нужна: модели и сервис доступа подменены jest.mock.
 */

const q = (value) => {
  const chain = {
    select: () => chain,
    lean: () => chain,
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return chain;
};

jest.mock('../src/crm/models/CrmMember', () => ({
  ROLES: ['owner', 'admin', 'marketing', 'manager'],
  findOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../src/crm/models/CrmAudit', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/crm/models/CrmClient', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/User', () => ({ findOne: jest.fn() }));
jest.mock('../src/crm/services/access.service', () => ({
  attachClient: jest.fn(async (client, user) => {
    client.appUserId = user._id;
  }),
  applyClientOrders: jest.fn(() => Promise.resolve(2)),
  unlinkClient: jest.fn(async (client) => {
    client.appUserId = null;
    return { revoked: 3 };
  }),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/middleware/rate-limit', () => {
  const pass = (_req, _res, next) => next();
  return { authLimiter: pass, refreshLimiter: pass, apiLimiter: pass, uploadLimiter: pass, reportLimiter: pass };
});

const express = require('express');
const CrmMember = require('../src/crm/models/CrmMember');
const CrmAudit = require('../src/crm/models/CrmAudit');
const CrmClient = require('../src/crm/models/CrmClient');
const User = require('../src/models/User');
const access = require('../src/crm/services/access.service');
const crmRouter = require('../src/crm/routes');
const tokenService = require('../src/crm/services/token.service');
const { errorHandler } = require('../src/middleware/error');

const CID = '64c000000000000000000001';
const members = {
  m1: { _id: 'm1', name: 'Тамуна', email: 't@chitatel.app', role: 'manager', active: true },
  m2: { _id: 'm2', name: 'Маркетинг', email: 'mk@chitatel.app', role: 'marketing', active: true },
};
let server;
let base;
let client;

async function call(path, memberId, body) {
  const res = await fetch(`${base}/api/crm/clients/${CID}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenService.signAccess(members[memberId])}`,
    },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, body: await res.json() };
}
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/crm', crmRouter);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  jest.clearAllMocks();
  CrmMember.findById.mockImplementation((id) => q(members[id] ? { ...members[id] } : null));
  client = { _id: CID, name: 'Анна К.', appUserId: null, save: jest.fn() };
  CrmClient.findById.mockImplementation(() => q(client));
  CrmClient.findOne.mockImplementation(() => q(null));
  User.findOne.mockImplementation(() => q({ _id: 'u1', email: 'app@mail.ru' }));
});

describe('POST /api/crm/clients/:id/link', () => {
  test('менеджер связывает по почте приложения, заказы применяются, журнал пишется', async () => {
    const r = await call('/link', 'm1', { email: 'App@Mail.ru' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ clientId: CID, appUserId: 'u1', email: 'app@mail.ru', applied: 2 });
    expect(User.findOne).toHaveBeenCalledWith({ email: 'app@mail.ru', isDeleted: { $ne: true } });
    expect(access.attachClient).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ _id: 'u1' }),
      { who: 'Тамуна', how: 'вручную' }
    );
    expect(access.applyClientOrders).toHaveBeenCalledWith(CID, { who: 'Тамуна' });
    await flush();
    expect(CrmAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'm1',
        action: 'client.link',
        entity: 'CrmClient',
        entityId: CID,
        diff: { before: { appUserId: null }, after: { appUserId: 'u1', email: 'app@mail.ru', applied: 2 } },
      })
    );
  });

  test('нет аккаунта с такой почтой → 404, журнал не пишется', async () => {
    User.findOne.mockImplementation(() => q(null));
    const r = await call('/link', 'm1', { email: 'none@mail.ru' });
    expect(r.status).toBe(404);
    await flush();
    expect(CrmAudit.create).not.toHaveBeenCalled();
  });

  test('связана с другим аккаунтом → 409', async () => {
    client.appUserId = 'u9';
    expect((await call('/link', 'm1', { email: 'app@mail.ru' })).status).toBe(409);
    expect(access.applyClientOrders).not.toHaveBeenCalled();
  });

  test('аккаунт уже у другой клиентки → 409', async () => {
    CrmClient.findOne.mockImplementation(() => q({ _id: 'other', name: 'Другая' }));
    const r = await call('/link', 'm1', { email: 'app@mail.ru' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/Другая/);
  });

  test('уже связана с этим же аккаунтом — просто доприменяет заказы', async () => {
    client.appUserId = 'u1';
    const r = await call('/link', 'm1', { email: 'app@mail.ru' });
    expect(r.status).toBe(200);
    expect(access.attachClient).not.toHaveBeenCalled();
    expect(access.applyClientOrders).toHaveBeenCalled();
  });

  test('кривая почта → 400; у роли без права orders → 403', async () => {
    expect((await call('/link', 'm1', { email: 'нет' })).status).toBe(400);
    expect((await call('/link', 'm2', { email: 'app@mail.ru' })).status).toBe(403);
  });
});

describe('POST /api/crm/clients/:id/unlink', () => {
  test('отвязывает, выданное снимается, журнал пишется', async () => {
    client.appUserId = 'u1';
    const r = await call('/unlink', 'm1');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ clientId: CID, appUserId: null, revoked: 3 });
    expect(access.unlinkClient).toHaveBeenCalledWith(client, { who: 'Тамуна' });
    await flush();
    expect(CrmAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'client.unlink', diff: { before: { appUserId: 'u1' }, after: { appUserId: null, revoked: 3 } } })
    );
  });

  test('не связана → 400', async () => {
    expect((await call('/unlink', 'm1')).status).toBe(400);
  });
});
