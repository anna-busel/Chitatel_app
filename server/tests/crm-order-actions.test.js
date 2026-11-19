/**
 * CRM D5/D6 (19.11.2026): карточка заказа и новый заказ —
 * crm/routes/orders.js + crm/services/order-actions.service.js.
 *
 * Права в приложении выдаёт и снимает НАСТОЯЩИЙ access.service (applyOrder);
 * подменён только entitlement.service (запись в User), чтобы проверить, что
 * выдаётся и снимается ровно order.granted. БД не нужна: модели — jest.mock.
 */

process.env.TZ = 'Europe/Moscow';

const q = (value) => {
  const chain = {
    select: () => chain,
    lean: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return chain;
};

jest.mock('../src/crm/models/CrmMember', () => ({
  ROLES: ['owner', 'admin', 'marketing', 'manager'],
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
}));
jest.mock('../src/crm/models/CrmAudit', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/crm/models/CrmClient', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(() => Promise.resolve({})),
  findOneAndUpdate: jest.fn(),
  collection: { name: 'crmclients' },
}));
jest.mock('../src/crm/models/CrmOrder', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(() => Promise.resolve({})),
  aggregate: jest.fn(),
  collection: { name: 'crmorders' },
}));
jest.mock('../src/crm/models/CrmProduct', () => ({ findById: jest.fn(), find: jest.fn() }));
jest.mock('../src/crm/models/CrmPromo', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../src/crm/models/CrmCounter', () => ({ nextOrderNum: jest.fn(() => Promise.resolve(5001)) }));
jest.mock('../src/crm/models/CrmEvent', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/crm/models/CrmBalanceOp', () => ({ create: jest.fn(() => Promise.resolve({})), find: jest.fn() }));
jest.mock('../src/models/User', () => ({ findById: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/Book', () => ({ find: jest.fn() }));
jest.mock('../src/models/Package', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({ find: jest.fn() }));
jest.mock('../src/models/Purchase', () => ({ find: jest.fn() }));
jest.mock('../src/services/entitlement.service', () => {
  const actual = jest.requireActual('../src/services/entitlement.service');
  return {
    ...actual,
    grantClubMonths: jest.fn(),
    grantBooks: jest.fn(),
    grantPackage: jest.fn(),
    revokeGranted: jest.fn(),
  };
});
jest.mock('../src/crm/services/settings.service', () => ({ getCrmSettings: jest.fn() }));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/middleware/rate-limit', () => {
  const pass = (_req, _res, next) => next();
  return { authLimiter: pass, refreshLimiter: pass, apiLimiter: pass, uploadLimiter: pass, reportLimiter: pass };
});

const express = require('express');
const CrmMember = require('../src/crm/models/CrmMember');
const CrmAudit = require('../src/crm/models/CrmAudit');
const CrmClient = require('../src/crm/models/CrmClient');
const CrmOrder = require('../src/crm/models/CrmOrder');
const CrmProduct = require('../src/crm/models/CrmProduct');
const CrmPromo = require('../src/crm/models/CrmPromo');
const CrmEvent = require('../src/crm/models/CrmEvent');
const CrmBalanceOp = require('../src/crm/models/CrmBalanceOp');
const User = require('../src/models/User');
const Purchase = require('../src/models/Purchase');
const entitlement = require('../src/services/entitlement.service');
const { getCrmSettings } = require('../src/crm/services/settings.service');
const crmRouter = require('../src/crm/routes');
const tokenService = require('../src/crm/services/token.service');
const actions = require('../src/crm/services/order-actions.service');
const { errorHandler } = require('../src/middleware/error');

const OID = '64c0000000000000000000a1';
const CID = '64c0000000000000000000c1';
const RID = '64c0000000000000000000c2'; // получательница подарка
const PID = '64c0000000000000000000b1';
const UID = '64c0000000000000000000e1';
const RUID = '64c0000000000000000000e2';
const MO = '64c0000000000000000000f1';
const MA = '64c0000000000000000000f2';
const MM = '64c0000000000000000000f3';
const MK = '64c0000000000000000000f4';
const members = {
  [MO]: { _id: MO, name: 'Анна', email: 'a@chitatel.app', role: 'owner', active: true },
  [MA]: { _id: MA, name: 'Гульнара', email: 'g@chitatel.app', role: 'admin', active: true },
  [MM]: { _id: MM, name: 'Тамуна', email: 't@chitatel.app', role: 'manager', active: true },
  [MK]: { _id: MK, name: 'Маркетинг', email: 'mk@chitatel.app', role: 'marketing', active: true },
};

let server;
let base;
let order;
let product;
let clients;
let users;
let settings;
let created;

async function call(method, path, memberId, body) {
  const headers = { Authorization: `Bearer ${tokenService.signAccess(members[memberId])}` };
  if (body !== undefined) {headers['Content-Type'] = 'application/json';}
  const res = await fetch(`${base}/api/crm${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_e) {
    json = null;
  }
  return { status: res.status, body: json };
}
const errMsg = (r) => {
  const e = (r.body && r.body.error) || {};
  const d = Object.values(e.details || {});
  return d.length ? d[0] : e.message;
};
const flush = () => new Promise((r) => setTimeout(r, 20));

function makeOrder(extra = {}) {
  const o = {
    _id: OID,
    num: 4001,
    clientId: CID,
    productId: PID,
    price: 100,
    cur: 'BYN',
    discount: 0,
    promoCode: null,
    status: 'new',
    source: 'manual',
    managerId: null,
    deadline: null,
    gift: { name: null, email: null, recipientClientId: null },
    note: null,
    payments: [],
    refund: { amount: null, mode: null, reason: null, at: null, by: null },
    purchaseId: null,
    granted: { at: null, months: [], bookIds: [], packageIds: [], subscriptionSet: null },
    history: [],
    comments: [],
    createdAt: new Date('2026-11-18T10:00:00Z'),
    save: jest.fn(() => Promise.resolve()),
    markModified: jest.fn(),
    ...extra,
  };
  return o;
}

function makeClient(id, extra = {}) {
  return {
    _id: id,
    name: id === CID ? 'Мария' : 'Ольга',
    primaryEmail: id === CID ? 'm@mail.ru' : 'olga@mail.ru',
    emails: [{ email: id === CID ? 'm@mail.ru' : 'olga@mail.ru', source: 'gk' }],
    appUserId: id === CID ? UID : null,
    balance: 50,
    mergedInto: null,
    save: jest.fn(() => Promise.resolve()),
    ...extra,
  };
}

/** Выдача от grantClubMonths: месяцы из ключей, без «было раньше». */
const grantSnap = (keys) => ({
  months: keys,
  chatMonths: [],
  preexisting: { months: [], chatMonths: [] },
  subscription: { prev: null, set: null },
});

/** Оплаченный заказ с уже выданным клубом (снимок granted). */
function grantedOrder(extra = {}) {
  return makeOrder({
    status: 'paid',
    payments: [{ _id: '64c0000000000000000000d1', amount: 100, cur: 'BYN', method: 'transfer', at: new Date('2026-11-18'), pending: false, account: 'Карта Анны · BYN' }],
    granted: {
      at: new Date('2026-11-18'),
      months: ['2026-11'],
      bookIds: [],
      packageIds: [],
      subscriptionSet: { type: 'month', userId: UID, clientId: CID, chatMonths: [], preexisting: { months: [], chatMonths: [], bookIds: [], packageIds: [] } },
    },
    ...extra,
  });
}

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
  settings = { requireTransferConfirm: false, accounts: ['Карта Анны · BYN', 'Грузинская карта · USD'], rates: {} };
  getCrmSettings.mockImplementation(() => Promise.resolve(settings));
  CrmMember.findById.mockImplementation((id) => q(members[id] ? { ...members[id] } : null));
  CrmMember.find.mockImplementation(() => q([]));
  order = makeOrder();
  product = {
    _id: PID,
    name: 'Клуб: месяц',
    cat: 'club',
    price: 100,
    cur: 'BYN',
    active: true,
    archivedAt: null,
    grant: { type: 'month', months: [], bookSlugs: [], packageSlug: null, deposit: null },
    term: { mode: 'forever' },
    accessOnFirstPayment: false,
  };
  clients = { [CID]: makeClient(CID), [RID]: makeClient(RID, { appUserId: RUID }) };
  users = {
    [UID]: { _id: UID, email: 'app@mail.ru', save: jest.fn() },
    [RUID]: { _id: RUID, email: 'olga@mail.ru', save: jest.fn() },
  };
  created = null;

  CrmOrder.findById.mockImplementation((id) => q(String(id) === OID ? order : created && String(id) === String(created._id) ? created : null));
  CrmOrder.find.mockImplementation(() => q([])); // keepFor: других заказов нет
  CrmOrder.create.mockImplementation((doc) => {
    created = makeOrder({ ...doc, createdAt: new Date() });
    return Promise.resolve(created);
  });
  CrmProduct.findById.mockImplementation(() => q(product));
  CrmProduct.find.mockImplementation(() => q([product]));
  CrmClient.findById.mockImplementation((id) => q(clients[String(id)] || null));
  CrmClient.find.mockImplementation((cond) => {
    const ids = cond && cond._id && cond._id.$in ? cond._id.$in.map(String) : [];
    return q(ids.map((id) => clients[id]).filter(Boolean));
  });
  CrmClient.findOne.mockImplementation(() => q(null));
  CrmClient.findOneAndUpdate.mockImplementation((cond, upd) => {
    const c = clients[String(cond._id)];
    if (!c) {return q(null);}
    const need = cond.balance && cond.balance.$gte;
    if (need !== undefined && c.balance < need) {return q(null);}
    c.balance += upd.$inc.balance;
    return q(c);
  });
  User.findById.mockImplementation((id) => q(users[String(id)] || null));
  User.findOne.mockImplementation(() => q(null));
  Purchase.find.mockImplementation(() => q([]));
  entitlement.grantClubMonths.mockImplementation((_u, keys) => Promise.resolve(grantSnap(keys)));
  entitlement.revokeGranted.mockImplementation((_u, g) =>
    Promise.resolve({ months: g.months, bookIds: g.bookIds, packageIds: g.packageIds })
  );
});

/* ------------------------------------------------------------------ */

describe('статус по платежам', () => {
  test('paid / confirm / partial / new', () => {
    const base0 = { status: 'new', price: 100, discount: 0 };
    expect(actions.computeStatus({ ...base0, payments: [] })).toBe('new');
    expect(actions.computeStatus({ ...base0, payments: [{ amount: 30 }] })).toBe('partial');
    expect(actions.computeStatus({ ...base0, payments: [{ amount: 30 }, { amount: 70, pending: true }] })).toBe('confirm');
    expect(actions.computeStatus({ ...base0, payments: [{ amount: 100 }] })).toBe('paid');
    expect(actions.computeStatus({ ...base0, discount: 20, payments: [{ amount: 80 }] })).toBe('paid');
    expect(actions.computeStatus({ ...base0, status: 'free', payments: [] })).toBe('free');
  });
});

describe('GET /orders/:id — карточка', () => {
  test('платежи, остаток, подарок, действия', async () => {
    clients[RID].appUserId = null;
    order = makeOrder({
      status: 'partial',
      payments: [{ _id: '64c0000000000000000000d1', amount: 40, cur: 'BYN', method: 'transfer', account: 'Карта Анны · BYN', note: 'в чате', at: new Date(), pending: false, by: MM }],
      gift: { name: 'Ольга', email: 'olga@mail.ru', recipientClientId: RID },
      history: [{ at: new Date('2026-11-18'), who: 'Тамуна', text: 'Заказ создан вручную' }],
    });
    const r = await call('GET', `/orders/${OID}`, MK);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({
      num: 4001,
      status: 'partial',
      total: 100,
      paid: 40,
      left: 60,
      readOnly: false,
      giftInfo: { name: 'Ольга', email: 'olga@mail.ru', recipientId: RID, linked: false },
      client: { id: CID, name: 'Мария', balance: 50, linked: true },
      productInfo: { name: 'Клуб: месяц', grant: 'Клуб: месяц оплаты' },
    });
    expect(d.payments[0]).toMatchObject({ amount: 40, methodLabel: 'Перевод на карту', account: 'Карта Анны · BYN', note: 'в чате' });
    expect(d.actions).toMatchObject({ pay: true, editItem: false, fake: false, refund: true });
  });

  test('неверный id — 400, нет заказа — 404', async () => {
    expect((await call('GET', '/orders/xxx', MM)).status).toBe(400);
    expect((await call('GET', '/orders/64c0000000000000000000ff', MM)).status).toBe(404);
  });
});

describe('POST /orders/:id/payments', () => {
  test('перевод без подтверждения: оплачен, доступ выдан, история и журнал', async () => {
    const r = await call('POST', `/orders/${OID}/payments`, MM, {
      amount: 100, method: 'transfer', account: 'Карта Анны · BYN', note: 'Анна подтвердила в чате',
    });
    expect(r.status).toBe(200);
    expect(order.status).toBe('paid');
    expect(order.payments[0]).toMatchObject({ amount: 100, method: 'transfer', pending: false, account: 'Карта Анны · BYN', by: MM });
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
    expect(order.granted.at).toBeTruthy();
    expect(order.history.map((h) => h.text).join('\n')).toMatch(/Платёж 100 BYN · Перевод на карту → Карта Анны · BYN/);
    expect(r.body.data.status).toBe('paid');
    await flush();
    expect(CrmAudit.create.mock.calls.map((c) => c[0].action)).toContain('order.payment.add');
  });

  test('перевод при «Анна подтверждает»: ждёт подтверждения, доступа нет', async () => {
    settings.requireTransferConfirm = true;
    const r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 100, method: 'transfer', account: 'Карта Анны · BYN' });
    expect(r.status).toBe(200);
    expect(order.payments[0].pending).toBe(true);
    expect(order.status).toBe('confirm');
    expect(entitlement.grantClubMonths).not.toHaveBeenCalled();
    expect(r.body.data.app.text).toBe('После подтверждения');
  });

  test('владелица вносит перевод сама — сразу подтверждён', async () => {
    settings.requireTransferConfirm = true;
    await call('POST', `/orders/${OID}/payments`, MO, { amount: 100, method: 'transfer', account: 'Карта Анны · BYN' });
    expect(order.payments[0].pending).toBe(false);
    expect(order.status).toBe('paid');
  });

  test('перевод без карты или с картой не из настроек — 400', async () => {
    let r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 100, method: 'transfer' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/на какую карту/);
    r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 100, method: 'transfer', account: 'Чужая карта' });
    expect(r.status).toBe(400);
    expect(order.payments).toHaveLength(0);
  });

  test('сумма больше остатка — 400; маркетинг — 403', async () => {
    expect((await call('POST', `/orders/${OID}/payments`, MM, { amount: 150, method: 'lava' })).status).toBe(400);
    expect((await call('POST', `/orders/${OID}/payments`, MK, { amount: 10, method: 'lava' })).status).toBe(403);
  });

  test('рассрочка: частичный платёж, доступ после первого платежа и остаток', async () => {
    product.accessOnFirstPayment = true;
    const r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 30, method: 'bepaid' });
    expect(r.status).toBe(200);
    expect(order.status).toBe('partial');
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
    expect(r.body.data.left).toBe(70);
    expect(r.body.data.app.text).toBe('Открыто · рассрочка');
    // второй платёж — оплачен, повторно не выдаёт
    await call('POST', `/orders/${OID}/payments`, MM, { amount: 70, method: 'bepaid' });
    expect(order.status).toBe('paid');
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
  });

  test('частичная оплата без рассрочки — доступа нет', async () => {
    await call('POST', `/orders/${OID}/payments`, MM, { amount: 30, method: 'lava' });
    expect(order.status).toBe('partial');
    expect(entitlement.grantClubMonths).not.toHaveBeenCalled();
  });

  test('с баланса: атомарное списание и операция; не BYN — 400; не хватает — 400', async () => {
    let r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 40, method: 'balance' });
    expect(r.status).toBe(200);
    expect(CrmClient.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: CID, balance: { $gte: 40 } }, { $inc: { balance: -40 } }, { new: true }
    );
    expect(CrmBalanceOp.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: CID, amount: -40, orderId: OID }));
    expect(clients[CID].balance).toBe(10);
    r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 20, method: 'balance' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/На балансе только 10 BYN/);
    order = makeOrder({ cur: 'USD' });
    r = await call('POST', `/orders/${OID}/payments`, MM, { amount: 20, method: 'balance' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/только заказ в BYN/);
  });
});

describe('POST /orders/:id/payments/:pid/confirm', () => {
  const PAY = '64c0000000000000000000d2';
  beforeEach(() => {
    order = makeOrder({
      status: 'confirm',
      payments: [{ _id: PAY, amount: 100, cur: 'BYN', method: 'transfer', at: new Date(), pending: true, account: 'Карта Анны · BYN' }],
    });
  });

  test('только владелица: администратор и менеджер — 403', async () => {
    expect((await call('POST', `/orders/${OID}/payments/${PAY}/confirm`, MM)).status).toBe(403);
    expect((await call('POST', `/orders/${OID}/payments/${PAY}/confirm`, MA)).status).toBe(403);
    expect(order.payments[0].pending).toBe(true);
  });

  test('владелица подтверждает: оплачен, доступ выдан', async () => {
    const r = await call('POST', `/orders/${OID}/payments/${PAY}/confirm`, MO);
    expect(r.status).toBe(200);
    expect(order.payments[0].pending).toBe(false);
    expect(order.status).toBe('paid');
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
    expect(order.history.map((h) => h.text).join('\n')).toMatch(/Перевод 100 BYN подтверждён: деньги пришли/);
  });
});

describe('PATCH /orders/:id — «Изменить заказ»', () => {
  test('позиция и цена до первого платежа — можно, в историю', async () => {
    const r = await call('PATCH', `/orders/${OID}`, MM, { price: 80, note: 'скидка по договорённости', managerId: MM });
    expect(r.status).toBe(200);
    expect(order.price).toBe(80);
    expect(order.note).toBe('скидка по договорённости');
    expect(String(order.managerId)).toBe(MM);
    const texts = order.history.map((h) => h.text);
    expect(texts).toEqual(expect.arrayContaining(['Цена изменена: 100 BYN → 80 BYN', 'Менеджер: Тамуна']));
  });

  test('после первого платежа цена и позиция — 400, заметка и срок — можно', async () => {
    order = grantedOrder();
    let r = await call('PATCH', `/orders/${OID}`, MM, { price: 50 });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/после первого платежа/);
    r = await call('PATCH', `/orders/${OID}`, MM, { productId: '64c0000000000000000000b2' });
    expect(r.status).toBe(400);
    r = await call('PATCH', `/orders/${OID}`, MM, { note: 'ок', deadline: '2026-11-25' });
    expect(r.status).toBe(200);
    expect(order.price).toBe(100);
    expect(order.note).toBe('ок');
  });
});

describe('POST /orders/:id/promo', () => {
  test('промокод: скидка, использование атомарно; чужой раздел — 400', async () => {
    CrmPromo.findOne.mockImplementation(() => q({ _id: 'pr1', code: 'ZIMA', type: '%', value: 10, scope: 'club', limit: 5, used: 1, active: true }));
    CrmPromo.findOneAndUpdate.mockResolvedValue({ used: 2 });
    let r = await call('POST', `/orders/${OID}/promo`, MM, { code: 'zima' });
    expect(r.status).toBe(200);
    expect(order).toMatchObject({ promoCode: 'ZIMA', discount: 10 });
    expect(CrmPromo.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'pr1', used: { $lt: 5 } }, { $inc: { used: 1 } }, { new: true });
    expect(r.body.data.total).toBe(90);
    order = makeOrder();
    product.cat = 'content';
    r = await call('POST', `/orders/${OID}/promo`, MM, { code: 'ZIMA' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/не действует/);
  });
});

describe('DELETE /orders/:id/payments/:pid', () => {
  const PAY = '64c0000000000000000000d1';

  test('нужна причина', async () => {
    order = grantedOrder();
    const r = await call('DELETE', `/orders/${OID}/payments/${PAY}`, MM, {});
    expect(r.status).toBe(400);
    expect(order.payments).toHaveLength(1);
  });

  test('удаление ошибочного платежа: статус пересчитан, выданное снято ровно', async () => {
    order = grantedOrder();
    const r = await call('DELETE', `/orders/${OID}/payments/${PAY}`, MM, { reason: 'внесли дважды' });
    expect(r.status).toBe(200);
    expect(order.payments).toHaveLength(0);
    expect(order.status).toBe('new');
    expect(entitlement.revokeGranted).toHaveBeenCalledWith(
      users[UID],
      expect.objectContaining({ months: ['2026-11'] }),
      expect.objectContaining({ orderId: OID })
    );
    expect(order.granted.at).toBeNull();
    expect(order.history.map((h) => h.text).join('\n')).toMatch(/Платёж удалён: 100 BYN · Перевод на карту.*Причина: внесли дважды/);
  });

  test('удалили оплату с баланса — сумма вернулась на баланс', async () => {
    order = makeOrder({
      status: 'partial',
      payments: [{ _id: PAY, amount: 30, cur: 'BYN', method: 'balance', at: new Date(), pending: false }],
    });
    await call('DELETE', `/orders/${OID}/payments/${PAY}`, MM, { reason: 'ошибка' });
    expect(CrmClient.updateOne).toHaveBeenCalledWith({ _id: CID }, { $inc: { balance: 30 } });
    expect(CrmBalanceOp.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 30, orderId: OID }));
  });
});

describe('«Ложный» и «Вернуть в работу»', () => {
  test('без подтверждения — 400; с подтверждением — ложный; вернуть — новый', async () => {
    let r = await call('POST', `/orders/${OID}/fake`, MM, {});
    expect(r.status).toBe(400);
    expect(order.status).toBe('new');
    r = await call('POST', `/orders/${OID}/fake`, MM, { confirm: true });
    expect(r.status).toBe(200);
    expect(order.status).toBe('fake');
    r = await call('POST', `/orders/${OID}/restore`, MM);
    expect(r.status).toBe(200);
    expect(order.status).toBe('new');
    expect(order.history.map((h) => h.text)).toEqual(['Помечен как ложный', 'Возвращён в работу']);
  });

  test('заказ с платежами ложным не помечается', async () => {
    order = grantedOrder();
    expect((await call('POST', `/orders/${OID}/fake`, MM, { confirm: true })).status).toBe(400);
    expect(order.status).toBe('paid');
  });
});

describe('POST /orders/:id/refund', () => {
  test('менеджер — 403', async () => {
    order = grantedOrder();
    expect((await call('POST', `/orders/${OID}/refund`, MM, { amount: 100, mode: 'money', reason: 'передумала' })).status).toBe(403);
  });

  test('возврат деньгами: снято ровно выданное, баланс не трогаем', async () => {
    order = grantedOrder();
    const r = await call('POST', `/orders/${OID}/refund`, MA, { amount: 100, mode: 'money', reason: 'передумала' });
    expect(r.status).toBe(200);
    expect(order.status).toBe('refund');
    expect(order.refund).toMatchObject({ amount: 100, mode: 'money', reason: 'передумала', by: MA });
    expect(entitlement.revokeGranted).toHaveBeenCalledTimes(1);
    const [, granted] = entitlement.revokeGranted.mock.calls[0];
    expect(granted.months).toEqual(['2026-11']);
    expect(CrmBalanceOp.create).not.toHaveBeenCalled();
    expect(r.body.data.app.text).toBe('Доступ закрыт');
    expect(r.body.data.refund).toMatchObject({ amount: 100, mode: 'money' });
  });

  test('перезачёт на баланс: только BYN, сумма на баланс плательщицы', async () => {
    order = grantedOrder({ cur: 'USD' });
    let r = await call('POST', `/orders/${OID}/refund`, MO, { amount: 50, mode: 'balance', reason: 'перенос' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/только заказ в BYN/);
    expect(order.status).toBe('paid');

    order = grantedOrder();
    r = await call('POST', `/orders/${OID}/refund`, MO, { amount: 60, mode: 'balance', reason: 'перенос на зиму' });
    expect(r.status).toBe(200);
    expect(order.status).toBe('refund');
    expect(CrmClient.updateOne).toHaveBeenCalledWith({ _id: CID }, { $inc: { balance: 60 } });
    expect(CrmBalanceOp.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: CID, amount: 60, orderId: OID }));
    expect(entitlement.revokeGranted).toHaveBeenCalledTimes(1);
  });

  test('сумма больше оплаченного или без причины — 400', async () => {
    order = grantedOrder();
    expect((await call('POST', `/orders/${OID}/refund`, MA, { amount: 150, mode: 'money', reason: 'x1' })).status).toBe(400);
    expect((await call('POST', `/orders/${OID}/refund`, MA, { amount: 50, mode: 'money', reason: '' })).status).toBe(400);
    expect(order.status).toBe('paid');
  });
});

describe('заказ из стора — только комментарии', () => {
  beforeEach(() => {
    order = makeOrder({ source: 'app_store', purchaseId: '64c0000000000000000000aa', status: 'paid', payments: [{ _id: '64c0000000000000000000d9', amount: 9.99, cur: 'USD', method: 'app_store', at: new Date() }] });
  });

  test('платёж, правка, возврат, ложный — 400', async () => {
    expect((await call('POST', `/orders/${OID}/payments`, MM, { amount: 1, method: 'lava' })).status).toBe(400);
    expect((await call('PATCH', `/orders/${OID}`, MM, { note: 'x' })).status).toBe(400);
    expect((await call('POST', `/orders/${OID}/refund`, MO, { amount: 1, mode: 'money', reason: 'тест' })).status).toBe(400);
    expect((await call('POST', `/orders/${OID}/fake`, MM, { confirm: true })).status).toBe(400);
    expect(order.save).not.toHaveBeenCalled();
    const card = await call('GET', `/orders/${OID}`, MM);
    expect(card.body.data.readOnly).toBe(true);
    expect(Object.values(card.body.data.actions).some(Boolean)).toBe(false);
  });

  test('комментарий — можно, любой роли', async () => {
    const r = await call('POST', `/orders/${OID}/comments`, MK, { text: 'Списали дважды, написала в Apple' });
    expect(r.status).toBe(201);
    expect(CrmOrder.updateOne).toHaveBeenCalledWith(
      { _id: OID },
      { $push: { comments: expect.objectContaining({ text: 'Списали дважды, написала в Apple', memberId: MK }) } }
    );
    expect(r.body.data).toMatchObject({ who: 'Маркетинг', text: 'Списали дважды, написала в Apple' });
  });
});

describe('POST /orders — новый заказ (D6)', () => {
  const baseBody = { clientId: CID, productId: PID, price: 100, cur: 'BYN' };

  test('ссылка на оплату: не оплачен, срок N дней, доступа нет', async () => {
    const before = Date.now();
    const r = await call('POST', '/orders', MM, { ...baseBody, mode: 'link', days: 7 });
    expect(r.status).toBe(201);
    expect(created).toMatchObject({ num: 5001, status: 'new', source: 'manual', price: 100, payments: [] });
    expect(String(created.managerId)).toBe(MM);
    const days = (new Date(created.deadline).getTime() - before) / 864e5;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(entitlement.grantClubMonths).not.toHaveBeenCalled();
    expect(r.body.data.num).toBe(5001);
    expect(CrmEvent.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: CID, text: expect.stringMatching(/Заказ №5001 создан/) }));
  });

  test('оплачено вручную переводом: платёж записан, доступ выдан', async () => {
    const r = await call('POST', '/orders', MM, {
      ...baseBody, mode: 'paid_manual', method: 'transfer', account: 'Карта Анны · BYN', note: 'чек в чате',
    });
    expect(r.status).toBe(201);
    expect(created.status).toBe('paid');
    expect(created.payments[0]).toMatchObject({ amount: 100, method: 'transfer', account: 'Карта Анны · BYN', note: 'чек в чате', pending: false });
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
  });

  test('оплачено переводом при «Анна подтверждает»: ждёт подтверждения', async () => {
    settings.requireTransferConfirm = true;
    await call('POST', '/orders', MA, { ...baseBody, mode: 'paid_manual', method: 'transfer', account: 'Карта Анны · BYN' });
    expect(created.status).toBe('confirm');
    expect(entitlement.grantClubMonths).not.toHaveBeenCalled();
  });

  test('с баланса: не хватает — 400 без списания; хватает — атомарно', async () => {
    let r = await call('POST', '/orders', MM, { ...baseBody, mode: 'balance' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/На балансе только 50 BYN/);
    expect(CrmClient.findOneAndUpdate).not.toHaveBeenCalled();
    expect(CrmOrder.create).not.toHaveBeenCalled();

    r = await call('POST', '/orders', MM, { ...baseBody, price: 40, mode: 'balance' });
    expect(r.status).toBe(201);
    expect(CrmClient.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: CID, balance: { $gte: 40 } }, { $inc: { balance: -40 } }, { new: true }
    );
    expect(CrmBalanceOp.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: CID, amount: -40, orderId: created._id }));
    expect(created.status).toBe('paid');
    expect(created.payments[0].method).toBe('balance');
    expect(clients[CID].balance).toBe(10);
  });

  test('с баланса — только BYN', async () => {
    const r = await call('POST', '/orders', MM, { ...baseBody, price: 10, cur: 'USD', mode: 'balance' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/только в BYN/);
  });

  test('без оплаты: нужна причина; с причиной — «Выдан · 0», доступ выдан', async () => {
    let r = await call('POST', '/orders', MM, { clientId: CID, productId: PID, mode: 'free' });
    expect(r.status).toBe(400);
    expect(errMsg(r)).toMatch(/причину/);
    r = await call('POST', '/orders', MM, { clientId: CID, productId: PID, mode: 'free', reason: 'розыгрыш в канале' });
    expect(r.status).toBe(201);
    expect(created).toMatchObject({ status: 'free', price: 0, note: 'розыгрыш в канале' });
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
  });

  test('подарок: получательница заводится по почте и получает доступ она', async () => {
    CrmClient.create.mockImplementation((doc) => {
      clients[RID] = makeClient(RID, { ...doc, appUserId: null });
      return Promise.resolve(clients[RID]);
    });
    // у получательницы есть аккаунт приложения под этой почтой
    User.findOne.mockImplementation(() => q({ _id: RUID, email: 'olga@mail.ru' }));
    const r = await call('POST', '/orders', MM, {
      ...baseBody, mode: 'paid_manual', method: 'lava', gift: { name: 'Ольга', email: 'Olga@mail.ru' },
    });
    expect(r.status).toBe(201);
    expect(CrmClient.create).toHaveBeenCalledWith(expect.objectContaining({ primaryEmail: 'olga@mail.ru', name: 'Ольга' }));
    expect(clients[RID].appUserId).toBe(RUID); // связана с аккаунтом по почте
    expect(created.gift).toMatchObject({ name: 'Ольга', email: 'olga@mail.ru', recipientClientId: RID });
    expect(entitlement.grantClubMonths).toHaveBeenCalledTimes(1);
    expect(entitlement.grantClubMonths.mock.calls[0][0]).toBe(users[RUID]);
    expect(String(created.granted.subscriptionSet.clientId)).toBe(RID);
    expect(created.clientId).toBe(CID); // платит та, что оформила
  });

  test('новая клиентка по почте: заводится, связывается с аккаунтом приложения', async () => {
    const NEW = '64c0000000000000000000c3';
    CrmClient.create.mockImplementation((doc) => {
      clients[NEW] = makeClient(NEW, { ...doc, appUserId: null, balance: 0 });
      return Promise.resolve(clients[NEW]);
    });
    User.findOne.mockImplementation(() => q({ _id: UID, email: 'new@mail.ru' }));
    CrmClient.findOne.mockImplementation(() => q(null));
    const r = await call('POST', '/orders', MM, {
      client: { name: 'Нина', email: 'new@mail.ru', phone: '+375 29 000-00-00' }, productId: PID, mode: 'link',
    });
    expect(r.status).toBe(201);
    expect(CrmClient.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Нина', primaryEmail: 'new@mail.ru', phone: '+375 29 000-00-00', phoneNorm: '375290000000',
    }));
    expect(clients[NEW].appUserId).toBe(UID);
    expect(created.clientId).toBe(NEW);
    expect(created.price).toBe(100); // цена продукта по умолчанию
  });

  test('без клиентки, без позиции, маркетинг — ошибки', async () => {
    expect((await call('POST', '/orders', MM, { productId: PID, mode: 'link' })).status).toBe(400);
    expect((await call('POST', '/orders', MM, { clientId: CID, mode: 'link' })).status).toBe(400);
    expect((await call('POST', '/orders', MK, { ...baseBody, mode: 'link' })).status).toBe(403);
  });
});

describe('GET /orders/meta', () => {
  test('продукты, менеджеры без маркетинга, карты', async () => {
    CrmMember.find.mockImplementation(() => q([{ _id: MM, name: 'Тамуна' }]));
    const r = await call('GET', '/orders/meta', MM);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      products: [{ id: PID, name: 'Клуб: месяц', price: 100, cur: 'BYN', grant: 'Клуб: месяц оплаты' }],
      managers: [{ id: MM, name: 'Тамуна' }],
      accounts: settings.accounts,
      requireTransferConfirm: false,
    });
    expect(CrmMember.find).toHaveBeenCalledWith({ active: true, role: { $ne: 'marketing' } });
  });
});
