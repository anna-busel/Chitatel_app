/**
 * Восстановление и смена пароля (UPDATES-PLAN P1, P2; 05.11.2026).
 *
 * Проверяем routes/password.js:
 * - forgot-password: одинаковый ответ для почты/не почты/Apple, код хешем,
 *   срок 15 мин, пауза 60 с, письмо с кодом;
 * - reset-password: CODE_INVALID / CODE_EXPIRED / TOO_MANY_ATTEMPTS /
 *   VALIDATION_ERROR, успех — новый хеш и сброс всех refresh-токенов;
 * - change-password: WRONG_PASSWORD / NOT_EMAIL_ACCOUNT / VALIDATION_ERROR.
 * И mail.service: без SMTP письмо не уходит, сервер не падает.
 *
 * БД не нужна: модель подменена jest.mock, запросы идут в мини-express.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/User', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/services/mail.service', () => ({
  sendPasswordResetCode: jest.fn(),
}));
// bcrypt подменён: быстрый «хеш» вида h:<пароль>.
jest.mock('bcryptjs', () => ({
  hash: jest.fn(async (p) => `h:${p}`),
  compare: jest.fn(async (p, h) => h === `h:${p}`),
}));
jest.mock('../src/middleware/auth', () => {
  const { AppError } = jest.requireActual('../src/middleware/error');
  return {
    requireAuth: (req, _res, next) => {
      const id = req.headers['x-test-user'];
      if (!id) {
        return next(new AppError('UNAUTHORIZED', 'Токен не предоставлен', 401));
      }
      req.user = { userId: id };
      return next();
    },
  };
});

const express = require('express');
const User = require('../src/models/User');
const mailService = require('../src/services/mail.service');
const passwordRoutes = require('../src/routes/password');
const { errorHandler } = require('../src/middleware/error');

const { hashCode } = passwordRoutes._internal;

const ME = '64a000000000000000000001';
const EMAIL = 'reader@example.com';

function chain(value) {
  const q = {
    calls: {},
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  ['select', 'lean'].forEach((m) => {
    q[m] = jest.fn((...args) => {
      q.calls[m] = args;
      return q;
    });
  });
  return q;
}

const tick = () => new Promise((r) => setImmediate(r));

let server;
let baseUrl;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', passwordRoutes);
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
  mailService.sendPasswordResetCode.mockResolvedValue(true);
});

async function call(method, path, { user, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = user;
  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

/* -------------------------- forgot-password ------------------------- */

describe('POST /api/auth/forgot-password', () => {
  test('почта есть (вход по почте) — код хешем, срок 15 мин, письмо с кодом', async () => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: EMAIL, authProvider: 'email' }));
    const before = Date.now();

    const res = await call('POST', '/api/auth/forgot-password', {
      body: { email: '  Reader@Example.com ' },
    });
    await tick();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { sent: true } });
    expect(User.findOne.mock.calls[0][0]).toEqual({ email: EMAIL, isDeleted: false });

    expect(mailService.sendPasswordResetCode).toHaveBeenCalledTimes(1);
    const [to, code, ttl] = mailService.sendPasswordResetCode.mock.calls[0];
    expect(to).toBe(EMAIL);
    expect(code).toMatch(/^\d{6}$/);
    expect(ttl).toBe(15);

    const [filter, update] = User.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: ME });
    const pr = update.$set.passwordReset;
    expect(pr.codeHash).toBe(hashCode(EMAIL, code));
    expect(pr.codeHash).not.toContain(code);
    expect(pr.attempts).toBe(0);
    const ttlMs = pr.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
    expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  test('почты нет — тот же ответ, письма нет', async () => {
    User.findOne.mockReturnValue(chain(null));

    const res = await call('POST', '/api/auth/forgot-password', { body: { email: EMAIL } });
    await tick();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { sent: true } });
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(mailService.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  test.each(['apple', 'google'])('аккаунт %s — тот же ответ, письма нет', async (provider) => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: EMAIL, authProvider: provider }));

    const res = await call('POST', '/api/auth/forgot-password', { body: { email: EMAIL } });
    await tick();

    expect(res.body).toEqual({ success: true, data: { sent: true } });
    expect(mailService.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  test('повтор раньше 60 с — тот же ответ, нового кода и письма нет', async () => {
    User.findOne.mockReturnValue(
      chain({
        _id: ME,
        email: EMAIL,
        authProvider: 'email',
        passwordReset: { codeHash: 'x', sentAt: new Date(Date.now() - 30 * 1000) },
      })
    );

    const res = await call('POST', '/api/auth/forgot-password', { body: { email: EMAIL } });
    await tick();

    expect(res.body).toEqual({ success: true, data: { sent: true } });
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(mailService.sendPasswordResetCode).not.toHaveBeenCalled();
  });

  test('через 60 с — новый код, попытки обнулены', async () => {
    User.findOne.mockReturnValue(
      chain({
        _id: ME,
        email: EMAIL,
        authProvider: 'email',
        passwordReset: { codeHash: 'x', attempts: 5, sentAt: new Date(Date.now() - 61 * 1000) },
      })
    );

    await call('POST', '/api/auth/forgot-password', { body: { email: EMAIL } });
    await tick();

    expect(User.updateOne.mock.calls[0][1].$set.passwordReset.attempts).toBe(0);
    expect(mailService.sendPasswordResetCode).toHaveBeenCalledTimes(1);
  });

  test('SMTP не настроен (письмо не ушло) — ответ всё равно sent:true', async () => {
    User.findOne.mockReturnValue(chain({ _id: ME, email: EMAIL, authProvider: 'email' }));
    mailService.sendPasswordResetCode.mockResolvedValue(false);

    const res = await call('POST', '/api/auth/forgot-password', { body: { email: EMAIL } });
    await tick();

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: true });
  });

  test('некорректная почта — 400 VALIDATION_ERROR', async () => {
    const res = await call('POST', '/api/auth/forgot-password', { body: { email: 'нет' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

/* -------------------------- reset-password -------------------------- */

describe('POST /api/auth/reset-password', () => {
  const CODE = '123456';

  function userWithCode(extra = {}) {
    return {
      _id: ME,
      authProvider: 'email',
      passwordReset: {
        codeHash: hashCode(EMAIL, CODE),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        sentAt: new Date(),
        ...extra,
      },
    };
  }

  test('верный код — новый пароль, все refresh-токены сброшены, код снят', async () => {
    User.findOne.mockReturnValue(chain(userWithCode()));

    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: 'READER@example.com', code: CODE, newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: ME },
      {
        $set: { passwordHash: 'h:новый-пароль', refreshTokens: [] },
        $unset: { passwordReset: '' },
      }
    );
  });

  test('неверный код — 400 CODE_INVALID, попытка засчитана', async () => {
    User.findOne.mockReturnValue(chain(userWithCode({ attempts: 1 })));

    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: EMAIL, code: '000000', newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CODE_INVALID');
    expect(res.body.error.details).toEqual({ attemptsLeft: 3 });
    const [filter, update] = User.updateOne.mock.calls[0];
    expect(filter._id).toBe(ME);
    expect(update).toEqual({ $inc: { 'passwordReset.attempts': 1 } });
    expect(User.updateOne).toHaveBeenCalledTimes(1);
  });

  test('пятая неверная попытка — TOO_MANY_ATTEMPTS', async () => {
    User.findOne.mockReturnValue(chain(userWithCode({ attempts: 4 })));

    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: EMAIL, code: '000000', newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  test('после 5 попыток даже верный код не принимается', async () => {
    User.findOne.mockReturnValue(chain(userWithCode({ attempts: 5 })));

    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: EMAIL, code: CODE, newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test('срок кода истёк — 400 CODE_EXPIRED', async () => {
    User.findOne.mockReturnValue(
      chain(userWithCode({ expiresAt: new Date(Date.now() - 1000) }))
    );

    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: EMAIL, code: CODE, newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CODE_EXPIRED');
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test('кода не запрашивали / почты нет / не почтовый вход — CODE_INVALID', async () => {
    for (const u of [
      null,
      { _id: ME, authProvider: 'email' },
      { ...userWithCode(), authProvider: 'apple' },
    ]) {
      User.findOne.mockReturnValue(chain(u));
      // eslint-disable-next-line no-await-in-loop
      const res = await call('POST', '/api/auth/reset-password', {
        body: { email: EMAIL, code: CODE, newPassword: 'новый-пароль' },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CODE_INVALID');
    }
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test('код с чужой почты не подходит', async () => {
    User.findOne.mockReturnValue(
      chain(userWithCode({ codeHash: hashCode('other@example.com', CODE) }))
    );

    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: EMAIL, code: CODE, newPassword: 'новый-пароль' },
    });

    expect(res.body.error.code).toBe('CODE_INVALID');
  });

  test('пароль короче 8 — 400 VALIDATION_ERROR', async () => {
    const res = await call('POST', '/api/auth/reset-password', {
      body: { email: EMAIL, code: CODE, newPassword: '1234567' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(User.findOne).not.toHaveBeenCalled();
  });
});

/* -------------------------- change-password ------------------------- */

describe('POST /api/auth/change-password', () => {
  test('верный текущий пароль — новый хеш', async () => {
    User.findById.mockReturnValue(
      chain({ _id: ME, authProvider: 'email', passwordHash: 'h:старый-пароль' })
    );

    const res = await call('POST', '/api/auth/change-password', {
      user: ME,
      body: { currentPassword: 'старый-пароль', newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
    expect(User.updateOne).toHaveBeenCalledWith(
      { _id: ME },
      { $set: { passwordHash: 'h:новый-пароль' } }
    );
  });

  test('неверный текущий пароль — 400 WRONG_PASSWORD', async () => {
    User.findById.mockReturnValue(
      chain({ _id: ME, authProvider: 'email', passwordHash: 'h:старый-пароль' })
    );

    const res = await call('POST', '/api/auth/change-password', {
      user: ME,
      body: { currentPassword: 'не-тот', newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  test.each(['apple', 'google'])('вход через %s — 403 NOT_EMAIL_ACCOUNT', async (provider) => {
    User.findById.mockReturnValue(chain({ _id: ME, authProvider: provider }));

    const res = await call('POST', '/api/auth/change-password', {
      user: ME,
      body: { currentPassword: 'что-угодно', newPassword: 'новый-пароль' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_EMAIL_ACCOUNT');
  });

  test('новый пароль короче 8 — 400 VALIDATION_ERROR', async () => {
    const res = await call('POST', '/api/auth/change-password', {
      user: ME,
      body: { currentPassword: 'старый-пароль', newPassword: 'short' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('без входа — 401', async () => {
    const res = await call('POST', '/api/auth/change-password', {
      body: { currentPassword: 'старый-пароль', newPassword: 'новый-пароль' },
    });
    expect(res.status).toBe(401);
  });
});

/* ---------------------------- mail.service --------------------------- */

describe('mail.service', () => {
  const sendMail = jest.fn();

  function loadMail(smtp, { withNodemailer = true } = {}) {
    let mod;
    jest.isolateModules(() => {
      jest.doMock('../src/config', () => ({ smtp, jwt: { secret: 's' } }));
      jest.doMock('../src/config/logger', () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }));
      if (withNodemailer) {
        jest.doMock(
          'nodemailer',
          () => ({ createTransport: jest.fn(() => ({ sendMail })) }),
          { virtual: true }
        );
      } else {
        jest.doMock(
          'nodemailer',
          () => {
            throw new Error('Cannot find module');
          },
          { virtual: true }
        );
      }
      mod = jest.requireActual('../src/services/mail.service');
    });
    return mod;
  }

  const SMTP = {
    host: 'smtp.gmail.com',
    port: 465,
    user: 'support.chitatel@gmail.com',
    pass: 'app-pass',
    from: 'ЧИТАТЕЛЬ <support.chitatel@gmail.com>',
  };

  beforeEach(() => sendMail.mockReset());

  test('SMTP настроен — письмо с кодом и сроком', async () => {
    sendMail.mockResolvedValue({});
    const mail = loadMail(SMTP);

    const ok = await mail.sendPasswordResetCode(EMAIL, '042517', 15);

    expect(ok).toBe(true);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.from).toBe(SMTP.from);
    expect(msg.to).toBe(EMAIL);
    expect(msg.text).toContain('042517');
    expect(msg.text).toContain('15 минут');
  });

  test('SMTP не настроен — false, без исключений', async () => {
    const mail = loadMail({ ...SMTP, user: '', pass: '' });
    await expect(mail.sendPasswordResetCode(EMAIL, '111111', 15)).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('nodemailer не установлен — модуль грузится, письмо false', async () => {
    const mail = loadMail(SMTP, { withNodemailer: false });
    await expect(mail.sendPasswordResetCode(EMAIL, '111111', 15)).resolves.toBe(false);
  });

  test('ошибка SMTP — false, наружу не бросает', async () => {
    sendMail.mockRejectedValue(new Error('auth failed'));
    const mail = loadMail(SMTP);
    await expect(mail.sendPasswordResetCode(EMAIL, '111111', 15)).resolves.toBe(false);
  });
});
