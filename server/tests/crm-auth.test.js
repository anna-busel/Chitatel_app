/**
 * CRM: вход команды, 2FA, разделение токенов CRM/приложения, права ролей,
 * журнал действий (CRM-PLAN A2, A3).
 *
 * БД не нужна: модели подменены jest.mock, запросы идут в мини-приложение
 * Express (роутер CRM + роут приложения под requireAuth) по HTTP.
 */

jest.mock('../src/crm/models/CrmMember', () => ({
  ROLES: ['owner', 'admin', 'marketing', 'manager'],
  findOne: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('../src/crm/models/CrmAudit', () => ({ create: jest.fn() }));
// Ожидаемые 401/403 errorHandler пишет в лог — в выводе тестов не нужны.
jest.mock('../src/config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));
// Лимиты на вход (10/мин с IP) в тестах не нужны — все запросы с 127.0.0.1.
jest.mock('../src/middleware/rate-limit', () => {
  const pass = (_req, _res, next) => next();
  return {
    authLimiter: pass,
    refreshLimiter: pass,
    apiLimiter: pass,
    uploadLimiter: pass,
    reportLimiter: pass,
  };
});

const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const config = require('../src/config');
const CrmMember = require('../src/crm/models/CrmMember');
const CrmAudit = require('../src/crm/models/CrmAudit');
const crmRouter = require('../src/crm/routes');
const { requireCrm } = require('../src/crm/middleware/auth');
const { auditMiddleware, setAudit } = require('../src/crm/middleware/audit');
const { CAN } = require('../src/crm/services/permissions');
const tokenService = require('../src/crm/services/token.service');
const { requireAuth } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/error');
const { success } = require('../src/utils/response');

/* ----------------------------- helpers ----------------------------- */

const PASSWORD = 'correct-horse-battery';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const SECRET = authenticator.generateSecret();

const members = {};

function makeMember(id, role, extra = {}) {
  const doc = {
    _id: id,
    name: `Участница ${role}`,
    email: `${role}@chitatel.app`,
    role,
    active: true,
    passwordHash: PASSWORD_HASH,
    totpSecret: SECRET,
    refreshTokens: [],
    lastAt: null,
    ...extra,
  };
  doc.save = jest.fn().mockResolvedValue(doc);
  members[id] = doc;
  return doc;
}

// Цепочка mongoose: .select() возвращает её же, await даёт документ, .lean() — копию.
function query(doc) {
  const q = {
    select: () => q,
    lean: () => Promise.resolve(doc ? { ...doc } : null),
    then: (resolve, reject) => Promise.resolve(doc).then(resolve, reject),
  };
  return q;
}

let server;
let base;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/crm', crmRouter);

  // Роуты-пробы прав и журнала: как будущие разделы CRM.
  const probe = express.Router();
  probe.use(requireCrm());
  probe.use(auditMiddleware);
  probe.get('/clients', (_req, res) => success(res, { ok: true }));
  probe.get('/settings', requireCrm('settings'), (_req, res) => success(res, { ok: true }));
  probe.post('/import', requireCrm('import'), (_req, res) => success(res, { ok: true }));
  probe.post('/orders/:id/status', requireCrm('orders'), (req, res) => {
    setAudit(res, {
      action: 'order.status',
      entity: 'CrmOrder',
      entityId: req.params.id,
      before: { status: 'new' },
      after: { status: req.body.status },
    });
    return success(res, { ok: true });
  });
  probe.post('/orders/:id/note', requireCrm('orders'), (_req, res) => success(res, { ok: true }));
  app.use('/api/crm-probe', probe);

  // Роут приложения.
  app.get('/api/profile', requireAuth, (req, res) => success(res, { userId: req.user.userId }));

  app.use(errorHandler);
  return app;
}

async function call(method, url, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(base + url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

function accessFor(id) {
  return tokenService.signAccess(members[id]);
}

// Журнал пишется после ответа (res 'finish') — даём событию отработать.
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeAll(async () => {
  server = buildApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(members)) {
    delete members[k];
  }
  makeMember('a00000000000000000000001', 'owner');
  makeMember('a00000000000000000000002', 'admin');
  makeMember('a00000000000000000000003', 'marketing');
  makeMember('a00000000000000000000004', 'manager');
  CrmMember.findOne.mockImplementation(({ email }) =>
    query(Object.values(members).find((m) => m.email === email) || null)
  );
  CrmMember.findById.mockImplementation((id) => query(members[String(id)] || null));
  CrmAudit.create.mockResolvedValue({});
});

/* ------------------------------- login ------------------------------ */

describe('POST /api/crm/auth/login', () => {
  test('неверный пароль → 401', async () => {
    const r = await call('POST', '/api/crm/auth/login', {
      body: { email: 'owner@chitatel.app', password: 'wrong-password' },
    });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('CRM_AUTH_INVALID');
    expect(r.body.data).toBeUndefined();
  });

  test('неизвестная почта → 401 с тем же ответом', async () => {
    const r = await call('POST', '/api/crm/auth/login', {
      body: { email: 'nobody@chitatel.app', password: PASSWORD },
    });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('CRM_AUTH_INVALID');
  });

  test('отключённая участница → 401', async () => {
    members.a00000000000000000000004.active = false;
    const r = await call('POST', '/api/crm/auth/login', {
      body: { email: 'manager@chitatel.app', password: PASSWORD },
    });
    expect(r.status).toBe(401);
  });

  test('верный пароль не даёт токенов без кода 2FA', async () => {
    const r = await call('POST', '/api/crm/auth/login', {
      body: { email: 'Owner@Chitatel.app', password: PASSWORD },
    });
    expect(r.status).toBe(200);
    expect(r.body.data.twoFactor).toBe('required');
    expect(r.body.data.tempToken).toEqual(expect.any(String));
    expect(r.body.data.accessToken).toBeUndefined();

    // Промежуточный токен — не пропуск в CRM.
    const me = await call('GET', '/api/crm/me', { token: r.body.data.tempToken });
    expect(me.status).toBe(401);
  });
});

/* -------------------------------- 2FA ------------------------------- */

describe('POST /api/crm/auth/2fa', () => {
  async function loginOwner() {
    const r = await call('POST', '/api/crm/auth/login', {
      body: { email: 'owner@chitatel.app', password: PASSWORD },
    });
    return r.body.data.tempToken;
  }

  test('неверный код → 401, верный → пара токенов и /me', async () => {
    const tempToken = await loginOwner();
    const good = authenticator.generate(SECRET);
    const bad = good === '000000' ? '111111' : '000000';

    const wrong = await call('POST', '/api/crm/auth/2fa', { body: { tempToken, code: bad } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('CRM_2FA_INVALID');

    const ok = await call('POST', '/api/crm/auth/2fa', { body: { tempToken, code: good } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(ok.body.data.refreshToken).toEqual(expect.any(String));
    expect(ok.body.data.member).toMatchObject({ role: 'owner', email: 'owner@chitatel.app' });
    expect(members.a00000000000000000000001.lastAt).toBeInstanceOf(Date);
    expect(members.a00000000000000000000001.refreshTokens).toHaveLength(1);

    const me = await call('GET', '/api/crm/me', { token: ok.body.data.accessToken });
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('owner');
    expect(me.body.data.perms).toEqual(Object.keys(CAN));
  });

  test('просроченный/чужой промежуточный токен → 401', async () => {
    const r = await call('POST', '/api/crm/auth/2fa', {
      body: { tempToken: 'garbage', code: '123456' },
    });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('CRM_2FA_EXPIRED');
  });

  test('первый вход без 2FA: выдаётся секрет, сохраняется после верного кода', async () => {
    makeMember('a00000000000000000000005', 'manager', {
      email: 'new@chitatel.app',
      totpSecret: null,
    });
    const login = await call('POST', '/api/crm/auth/login', {
      body: { email: 'new@chitatel.app', password: PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(login.body.data.twoFactor).toBe('setup');
    expect(login.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const { secret, tempToken } = login.body.data;

    const ok = await call('POST', '/api/crm/auth/2fa', {
      body: { tempToken, code: authenticator.generate(secret) },
    });
    expect(ok.status).toBe(200);
    expect(members.a00000000000000000000005.totpSecret).toBe(secret);
  });

  test('токен настройки не перезаписывает уже настроенную 2FA', async () => {
    const m = members.a00000000000000000000001;
    const otherSecret = authenticator.generateSecret();
    const tempToken = tokenService.signPending(m, otherSecret);
    const r = await call('POST', '/api/crm/auth/2fa', {
      body: { tempToken, code: authenticator.generate(otherSecret) },
    });
    expect(r.status).toBe(401);
    expect(m.totpSecret).toBe(SECRET);
  });
});

/* ------------------------------ refresh ----------------------------- */

describe('POST /api/crm/auth/refresh', () => {
  test('ротация: новый токен работает, повтор старого → 401 и сброс сессий', async () => {
    const tempToken = (await call('POST', '/api/crm/auth/login', {
      body: { email: 'admin@chitatel.app', password: PASSWORD },
    })).body.data.tempToken;
    const pair = (await call('POST', '/api/crm/auth/2fa', {
      body: { tempToken, code: authenticator.generate(SECRET) },
    })).body.data;

    const r1 = await call('POST', '/api/crm/auth/refresh', {
      body: { refreshToken: pair.refreshToken },
    });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refreshToken).not.toBe(pair.refreshToken);

    const reuse = await call('POST', '/api/crm/auth/refresh', {
      body: { refreshToken: pair.refreshToken },
    });
    expect(reuse.status).toBe(401);
    expect(members.a00000000000000000000002.refreshTokens).toEqual([]);
  });

  test('refresh-токен приложения в CRM не принимается', async () => {
    const appRefresh = jwt.sign({ userId: 'u1', jti: 'x' }, config.jwt.refreshSecret);
    const r = await call('POST', '/api/crm/auth/refresh', { body: { refreshToken: appRefresh } });
    expect(r.status).toBe(401);
  });
});

/* -------------------- токены CRM и приложения раздельно -------------------- */

describe('токены приложения и CRM не взаимозаменяемы', () => {
  test('токен приложения на /api/crm → 401', async () => {
    const appToken = jwt.sign({ userId: 'u1' }, config.jwt.secret, { expiresIn: '15m' });
    const r = await call('GET', '/api/crm/me', { token: appToken });
    expect(r.status).toBe(401);

    const probe = await call('GET', '/api/crm-probe/clients', { token: appToken });
    expect(probe.status).toBe(401);
  });

  test('токен приложения с подложенным scope:crm и memberId → 401 (чужая подпись)', async () => {
    const forged = jwt.sign(
      { memberId: 'a00000000000000000000001', role: 'owner', scope: 'crm' },
      config.jwt.secret
    );
    const r = await call('GET', '/api/crm/me', { token: forged });
    expect(r.status).toBe(401);
  });

  test('токен CRM на роуте приложения → 401', async () => {
    const crmToken = accessFor('a00000000000000000000001');
    const r = await call('GET', '/api/profile', { token: crmToken });
    expect(r.status).toBe(401);
  });

  test('токен со scope:crm, подписанный секретом приложения, приложение тоже отбивает', async () => {
    const crmLike = jwt.sign({ userId: 'u1', scope: 'crm' }, config.jwt.secret);
    const r = await call('GET', '/api/profile', { token: crmLike });
    expect(r.status).toBe(401);

    const appToken = jwt.sign({ userId: 'u1' }, config.jwt.secret);
    const ok = await call('GET', '/api/profile', { token: appToken });
    expect(ok.status).toBe(200);
  });

  test('без токена → 401', async () => {
    const r = await call('GET', '/api/crm/me');
    expect(r.status).toBe(401);
  });
});

/* ------------------------------ права ------------------------------- */

describe('requireCrm(perm) по матрице CAN', () => {
  test('матрица совпадает с прототипом (docs/crm-prototype/logic.js)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'docs', 'crm-prototype', 'logic.js'),
      'utf8'
    );
    const m = src.match(/var CAN = (\{[\s\S]*?\});/);
    expect(m).not.toBeNull();
    // eslint-disable-next-line no-new-func
    const protoCan = new Function(`return ${m[1]}`)();
    expect(CAN).toEqual(protoCan);
  });

  test('менеджер не попадает в настройки и импорт', async () => {
    const token = accessFor('a00000000000000000000004');
    expect((await call('GET', '/api/crm-probe/settings', { token })).status).toBe(403);
    expect((await call('POST', '/api/crm-probe/import', { token, body: {} })).status).toBe(403);
    // Просмотр клиенток — всем ролям.
    expect((await call('GET', '/api/crm-probe/clients', { token })).status).toBe(200);
    const me = await call('GET', '/api/crm/me', { token });
    expect(me.body.data.perms).toEqual(['orders', 'sales', 'inbox']);
  });

  test('администратор попадает в настройки и импорт', async () => {
    const token = accessFor('a00000000000000000000002');
    expect((await call('GET', '/api/crm-probe/settings', { token })).status).toBe(200);
    expect((await call('POST', '/api/crm-probe/import', { token, body: {} })).status).toBe(200);
  });

  test('маркетинг не проводит заказы', async () => {
    const token = accessFor('a00000000000000000000003');
    const r = await call('POST', '/api/crm-probe/orders/o1/status', {
      token,
      body: { status: 'paid' },
    });
    expect(r.status).toBe(403);
  });

  test('отключённая участница с живым токеном → 401', async () => {
    const token = accessFor('a00000000000000000000004');
    members.a00000000000000000000004.active = false;
    expect((await call('GET', '/api/crm/me', { token })).status).toBe(401);
  });

  test('роль берётся из базы, а не из токена', async () => {
    const token = accessFor('a00000000000000000000002'); // admin в токене
    members.a00000000000000000000002.role = 'manager';
    expect((await call('GET', '/api/crm-probe/settings', { token })).status).toBe(403);
  });

  test('неизвестное право — ошибка при сборке роутов', () => {
    expect(() => requireCrm('nope')).toThrow(/неизвестное право/);
  });
});

/* ------------------------------ журнал ------------------------------ */

describe('журнал действий CrmAudit', () => {
  test('изменяющее действие пишется: кто, что, до/после', async () => {
    const token = accessFor('a00000000000000000000002');
    const r = await call('POST', '/api/crm-probe/orders/o42/status', {
      token,
      body: { status: 'paid' },
    });
    expect(r.status).toBe(200);
    await flush();

    expect(CrmAudit.create).toHaveBeenCalledTimes(1);
    expect(CrmAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'a00000000000000000000002',
        action: 'order.status',
        entity: 'CrmOrder',
        entityId: 'o42',
        diff: { before: { status: 'new' }, after: { status: 'paid' } },
        at: expect.any(Date),
      })
    );
  });

  test('без setAudit пишется метод, путь и тело — без паролей и кодов', async () => {
    const token = accessFor('a00000000000000000000004');
    await call('POST', '/api/crm-probe/orders/o7/note?x=1', {
      token,
      body: { note: 'позвонить', password: 'secret', nested: { code: '123456', keep: 1 } },
    });
    await flush();

    expect(CrmAudit.create).toHaveBeenCalledTimes(1);
    const rec = CrmAudit.create.mock.calls[0][0];
    expect(rec.action).toBe('POST /api/crm-probe/orders/o7/note');
    expect(rec.memberId).toBe('a00000000000000000000004');
    expect(rec.diff).toEqual({ before: null, after: { note: 'позвонить', nested: { keep: 1 } } });
  });

  test('чтение, отказ в праве и вход в CRM в журнал не пишутся', async () => {
    const manager = accessFor('a00000000000000000000004');
    await call('GET', '/api/crm-probe/clients', { token: manager });
    await call('POST', '/api/crm-probe/import', { token: manager, body: {} });
    await call('POST', '/api/crm/auth/login', {
      body: { email: 'owner@chitatel.app', password: PASSWORD },
    });
    await flush();
    expect(CrmAudit.create).not.toHaveBeenCalled();
  });

  test('сбой записи журнала не ломает ответ', async () => {
    CrmAudit.create.mockRejectedValueOnce(new Error('db down'));
    const token = accessFor('a00000000000000000000001');
    const r = await call('POST', '/api/crm-probe/orders/o1/note', { token, body: { note: 'x' } });
    expect(r.status).toBe(200);
    await flush();
  });
});
