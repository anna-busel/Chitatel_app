/**
 * Почта, с которой участница оплачивала (27.11.2026): код на почту,
 * подтверждение, привязка оплат в CRM.
 */
jest.mock('../src/config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../src/models/User', () => ({ findOne: jest.fn(), findById: jest.fn(), updateOne: jest.fn() }));
jest.mock('../src/services/mail.service', () => ({ sendPurchaseEmailCode: jest.fn() }));
jest.mock('../src/crm/services/access.service', () => ({ linkPurchaseEmail: jest.fn() }));
jest.mock('../src/middleware/auth', () => {
  const { AppError } = jest.requireActual('../src/middleware/error');
  return {
    requireAuth: (req, _res, next) => {
      const id = req.headers['x-test-user'];
      if (!id) {return next(new AppError('UNAUTHORIZED', 'Токен не предоставлен', 401));}
      req.user = { userId: id };
      return next();
    },
  };
});

const express = require('express');
const User = require('../src/models/User');
const mail = require('../src/services/mail.service');
const { linkPurchaseEmail } = require('../src/crm/services/access.service');
const routes = require('../src/routes/purchase-email');
const { errorHandler } = require('../src/middleware/error');

const { hashCode } = routes._internal;
const ME = '64a000000000000000000001';
const APPLE = 'x1@privaterelay.appleid.com';
const PAY = 'pay@mail.ru';

function chain(value) {
  const q = { then: (res, rej) => Promise.resolve(value).then(res, rej) };
  q.select = jest.fn(() => q);
  q.lean = jest.fn(() => q);
  return q;
}

let server;
let baseUrl;
beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/profile/purchase-email', routes);
  app.use(errorHandler);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  User.updateOne.mockResolvedValue({});
  mail.sendPurchaseEmailCode.mockResolvedValue(true);
  linkPurchaseEmail.mockResolvedValue({ found: 1, linked: 1, applied: 2, conflicts: 0 });
});

async function call(path, body, user = ME) {
  const res = await fetch(`${baseUrl}/api/profile/purchase-email${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

describe('request', () => {
  test('код хешем на эту почту, письмо уходит', async () => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: APPLE, purchaseEmails: [] }));
    const r = await call('/request', { email: ' Pay@Mail.ru ' });
    expect(r.status).toBe(200);
    const [to, code] = mail.sendPurchaseEmailCode.mock.calls[0];
    expect(to).toBe(PAY);
    const set = User.updateOne.mock.calls[0][1].$set.purchaseEmailCode;
    expect(set.email).toBe(PAY);
    expect(set.codeHash).toBe(hashCode(ME, PAY, code));
    expect(JSON.stringify(set)).not.toContain(`"${code}"`);
  });

  test('почта аккаунта или уже привязанная — отказ', async () => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: PAY, purchaseEmails: [] }));
    expect((await call('/request', { email: PAY })).body.error.code).toBe('ALREADY_LINKED');
  });

  test('повтор раньше минуты — TOO_SOON', async () => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: APPLE, purchaseEmails: [], purchaseEmailCode: { sentAt: new Date() } }));
    const r = await call('/request', { email: PAY });
    expect(r.status).toBe(429);
    expect(mail.sendPurchaseEmailCode).not.toHaveBeenCalled();
  });

  test('письмо не ушло — ошибка и пауза снята', async () => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: APPLE, purchaseEmails: [] }));
    mail.sendPurchaseEmailCode.mockResolvedValue(false);
    const r = await call('/request', { email: PAY });
    expect(r.status).toBe(503);
    expect(User.updateOne.mock.calls[1][1]).toEqual({ $unset: { purchaseEmailCode: '' } });
  });

  test('без входа — 401', async () => {
    expect((await call('/request', { email: PAY }, null)).status).toBe(401);
  });
});

describe('confirm', () => {
  const pending = (extra = {}) => ({
    _id: ME,
    email: APPLE,
    purchaseEmails: [],
    purchaseEmailCode: { email: PAY, codeHash: hashCode(ME, PAY, '123456'), expiresAt: new Date(Date.now() + 60000), attempts: 0, ...extra },
  });

  test('верный код — почта сохранена, оплаты привязаны', async () => {
    User.findOne.mockReturnValue(chain(pending()));
    const r = await call('/confirm', { email: PAY, code: '123456' });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ email: PAY, found: 1, linked: 1, applied: 2, conflicts: 0 });
    expect(User.updateOne.mock.calls[0][1]).toEqual({ $addToSet: { purchaseEmails: PAY }, $unset: { purchaseEmailCode: '' } });
    expect(linkPurchaseEmail).toHaveBeenCalledWith({ _id: ME, email: APPLE }, PAY);
  });

  test('неверный код — попытка засчитана', async () => {
    User.findOne.mockReturnValue(chain(pending()));
    const r = await call('/confirm', { email: PAY, code: '000000' });
    expect(r.body.error.code).toBe('CODE_INVALID');
    expect(User.updateOne.mock.calls[0][1]).toEqual({ $inc: { 'purchaseEmailCode.attempts': 1 } });
    expect(linkPurchaseEmail).not.toHaveBeenCalled();
  });

  test('код для другой почты не подходит', async () => {
    User.findOne.mockReturnValue(chain(pending()));
    expect((await call('/confirm', { email: 'other@mail.ru', code: '123456' })).body.error.code).toBe('CODE_INVALID');
  });

  test('истёк — CODE_EXPIRED', async () => {
    User.findOne.mockReturnValue(chain(pending({ expiresAt: new Date(Date.now() - 1000) })));
    expect((await call('/confirm', { email: PAY, code: '123456' })).body.error.code).toBe('CODE_EXPIRED');
  });

  test('ошибка CRM — почта всё равно сохранена, ответ 200', async () => {
    User.findOne.mockReturnValue(chain(pending()));
    linkPurchaseEmail.mockRejectedValue(new Error('db'));
    const r = await call('/confirm', { email: PAY, code: '123456' });
    expect(r.status).toBe(200);
    expect(r.body.data.linked).toBe(0);
  });
});
