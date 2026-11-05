/**
 * CRM: доступ по заказам (CRM-PLAN B2, B3, B5; 05.11.2026) —
 * crm/services/access.service.js поверх entitlement.service.
 *
 * БД не нужна: модели подменены jest.mock, запросы возвращают заготовки.
 */

process.env.TZ = 'Europe/Moscow';

// Цепочка запроса mongoose: .select/.lean/.sort возвращают себя, await — значение.
const q = (value) => {
  const chain = {
    select: () => chain,
    lean: () => chain,
    sort: () => chain,
    limit: () => chain,
    then: (res, rej) => Promise.resolve(value).then(res, rej),
  };
  return chain;
};

jest.mock('../src/models/User', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../src/models/Book', () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock('../src/models/Package', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../src/models/ClubMonth', () => ({ find: jest.fn() }));
jest.mock('../src/models/Purchase', () => ({
  create: jest.fn(() => Promise.resolve({})),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(() => Promise.resolve({})),
  updateMany: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../src/crm/models/CrmClient', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(() => Promise.resolve({})),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/crm/models/CrmOrder', () => ({ find: jest.fn() }));
jest.mock('../src/crm/models/CrmProduct', () => ({ findById: jest.fn() }));
jest.mock('../src/crm/models/CrmEvent', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/crm/models/CrmBalanceOp', () => ({ create: jest.fn(() => Promise.resolve({})) }));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const User = require('../src/models/User');
const Book = require('../src/models/Book');
const Package = require('../src/models/Package');
const ClubMonth = require('../src/models/ClubMonth');
const Purchase = require('../src/models/Purchase');
const CrmClient = require('../src/crm/models/CrmClient');
const CrmOrder = require('../src/crm/models/CrmOrder');
const CrmProduct = require('../src/crm/models/CrmProduct');
const CrmEvent = require('../src/crm/models/CrmEvent');
const CrmBalanceOp = require('../src/crm/models/CrmBalanceOp');
const logger = require('../src/config/logger');
const access = require('../src/crm/services/access.service');

const iso = (d) => new Date(d).toISOString();
const PAID_AT = new Date('2026-10-15T12:00:00Z');

let users;
let product;
let otherOrders; // что вернёт keepFor

function makeUser(id, extra = {}) {
  return {
    _id: id,
    email: `${id}@mail.ru`,
    subscriptionStatus: 'free',
    subscriptionPlan: null,
    subscriptionExpiresAt: null,
    clubMonthsEntitled: [],
    tier2MonthsEntitled: [],
    clubChatForever: [],
    purchasedBooks: [],
    purchasedPackages: [],
    save: jest.fn(() => Promise.resolve()),
    ...extra,
  };
}

function makeOrder(extra = {}) {
  return {
    _id: 'o1',
    num: 101,
    clientId: 'c1',
    productId: 'p1',
    price: 100,
    status: 'paid',
    createdAt: PAID_AT,
    payments: [{ amount: 100, at: PAID_AT, pending: false }],
    gift: { name: null, email: null, recipientClientId: null },
    granted: { at: null, months: [], bookIds: [], packageIds: [], subscriptionSet: null },
    history: [],
    save: jest.fn(() => Promise.resolve()),
    markModified: jest.fn(),
    ...extra,
  };
}

function setProduct(p) {
  product = {
    _id: 'p1',
    name: 'Продукт',
    grant: { type: 'none', months: [], bookSlugs: [], packageSlug: null, deposit: null },
    term: { mode: 'forever' },
    accessOnFirstPayment: false,
    materialsForever: false,
    chatForever: false,
    ...p,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  users = { u1: makeUser('u1'), u2: makeUser('u2') };
  otherOrders = [];
  setProduct({});
  CrmProduct.findById.mockImplementation(() => q(product));
  User.findById.mockImplementation((id) => q(users[id] || null));
  CrmClient.findById.mockImplementation((id) =>
    q({ _id: id, appUserId: { c1: 'u1', c2: 'u2' }[id] || null })
  );
  CrmOrder.find.mockImplementation(() => q(otherOrders));
  Purchase.find.mockImplementation(() => q([]));
  ClubMonth.find.mockImplementation(() => q([]));
  Book.find.mockImplementation(() => q([]));
});

describe('applyOrder: клуб', () => {
  test('month: месяц оплаты + подписка до конца месяца + запись Purchase', async () => {
    setProduct({ grant: { type: 'month' } });
    const order = makeOrder();
    const r = await access.applyOrder(order);
    expect(r.action).toBe('granted');
    const u = users.u1;
    expect(u.clubMonthsEntitled).toEqual(['2026-10']);
    expect(u.subscriptionStatus).toBe('basic');
    expect(u.subscriptionPlan).toBe('monthly');
    expect(iso(u.subscriptionExpiresAt)).toBe('2026-10-31T23:59:59.999Z');
    expect(order.granted.at).toBeInstanceOf(Date);
    expect(order.granted.months).toEqual(['2026-10']);
    expect(String(order.granted.subscriptionSet.userId)).toBe('u1');
    expect(order.save).toHaveBeenCalled();
    expect(Purchase.findOneAndUpdate).toHaveBeenCalledWith(
      { transactionId: 'crm-o1-sub' },
      expect.anything(),
      expect.anything()
    );
    expect(CrmEvent.create).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', type: 'access' }));
  });

  test('months: сезон дек–фев, оплачен в октябре → подписка до конца февраля, план season', async () => {
    setProduct({ grant: { type: 'months', months: ['2026-12', '2027-01', '2027-02'] } });
    await access.applyOrder(makeOrder());
    const u = users.u1;
    expect(u.clubMonthsEntitled).toEqual(['2026-12', '2027-1', '2027-2']);
    expect(u.subscriptionPlan).toBe('season');
    expect(iso(u.subscriptionExpiresAt)).toBe('2027-02-28T23:59:59.999Z');
  });

  test('year: 12 месяцев с месяца оплаты', async () => {
    setProduct({ grant: { type: 'year' } });
    await access.applyOrder(makeOrder());
    expect(users.u1.clubMonthsEntitled).toHaveLength(12);
    expect(users.u1.clubMonthsEntitled[0]).toBe('2026-10');
    expect(users.u1.clubMonthsEntitled[11]).toBe('2027-9');
    expect(users.u1.subscriptionPlan).toBe('annual');
  });

  test('повторный вызов ничего не дублирует', async () => {
    setProduct({ grant: { type: 'month' } });
    const order = makeOrder();
    await access.applyOrder(order);
    users.u1.save.mockClear();
    order.save.mockClear();
    const r = await access.applyOrder(order);
    expect(r).toEqual({ action: 'noop', reason: 'already_granted' });
    expect(users.u1.save).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  test('не оплачен / ждёт подтверждения → ничего', async () => {
    setProduct({ grant: { type: 'month' } });
    for (const status of ['new', 'confirm']) {
      const r = await access.applyOrder(makeOrder({ status }));
      expect(r.action).toBe('noop');
    }
    expect(users.u1.clubMonthsEntitled).toEqual([]);
  });

  test('рассрочка: при accessOnFirstPayment доступ после первого платежа, иначе — нет', async () => {
    const partial = () =>
      makeOrder({
        status: 'partial',
        payments: [
          { amount: 50, at: PAID_AT, pending: false },
          { amount: 50, at: new Date('2026-11-20T10:00:00Z'), pending: true },
        ],
      });
    setProduct({ grant: { type: 'month' } });
    expect((await access.applyOrder(partial())).action).toBe('noop');
    setProduct({ grant: { type: 'month' }, accessOnFirstPayment: true });
    expect((await access.applyOrder(partial())).action).toBe('granted');
    expect(users.u1.clubMonthsEntitled).toEqual(['2026-10']);
  });

  test('клиентка не связана с приложением → not_linked, заказ не помечен', async () => {
    setProduct({ grant: { type: 'month' } });
    const order = makeOrder({ clientId: 'c9' });
    const r = await access.applyOrder(order);
    expect(r.action).toBe('not_linked');
    expect(order.granted.at).toBeNull();
    expect(order.save).not.toHaveBeenCalled();
  });

  test('chatForever: месяцы и в clubChatForever', async () => {
    setProduct({ grant: { type: 'month' }, chatForever: true });
    await access.applyOrder(makeOrder());
    expect(users.u1.clubChatForever).toEqual(['2026-10']);
  });
});

describe('возврат и «ложный»: снимается ровно выданное', () => {
  test('месяц другого действующего заказа и месяц из App Store остаются', async () => {
    users.u1.clubMonthsEntitled = ['2026-9'];
    setProduct({ grant: { type: 'months', months: ['2026-9', '2026-10', '2026-11'] } });
    const order = makeOrder();
    await access.applyOrder(order);
    expect(users.u1.clubMonthsEntitled).toEqual(['2026-9', '2026-10', '2026-11']);

    otherOrders = [{ granted: { months: ['2026-11'], subscriptionSet: {} } }];
    order.status = 'refund';
    const r = await access.applyOrder(order);
    expect(r.action).toBe('revoked');
    expect(users.u1.clubMonthsEntitled).toEqual(['2026-9', '2026-11']);
    expect(order.granted.at).toBeNull();
    expect(Purchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: { $regex: '^crm-o1-' } }),
      { $set: { status: 'cancelled' } }
    );
  });

  test('«ложный» без других источников — клуб и срок как до заказа', async () => {
    setProduct({ grant: { type: 'month' } });
    const order = makeOrder();
    await access.applyOrder(order);
    order.status = 'fake';
    await access.applyOrder(order);
    expect(users.u1.clubMonthsEntitled).toEqual([]);
    expect(users.u1.subscriptionStatus).toBe('free');
    expect(users.u1.subscriptionExpiresAt).toBeNull();
    expect(order.history.map((h) => h.text).join(' ')).toMatch(/Ложный заказ: доступ снят/);
  });

  test('возврат невыданного заказа — ничего', async () => {
    setProduct({ grant: { type: 'month' } });
    const r = await access.applyOrder(makeOrder({ status: 'refund' }));
    expect(r).toEqual({ action: 'noop', reason: 'nothing_granted' });
  });

  test('разбор, купленный ещё и в App Store, при возврате заказа остаётся', async () => {
    setProduct({ grant: { type: 'book', bookSlugs: ['atlant'] } });
    Book.find.mockImplementation(() => q([{ _id: 'b1', bookSlug: 'atlant', priceUsd: 10 }]));
    const order = makeOrder();
    await access.applyOrder(order);
    expect(users.u1.purchasedBooks).toEqual(['b1']);
    Purchase.find.mockImplementation(() =>
      q([{ itemType: 'book', itemId: 'atlant', transactionId: '2000000123' }])
    );
    order.status = 'refund';
    await access.applyOrder(order);
    expect(users.u1.purchasedBooks).toEqual(['b1']);
  });
});

describe('разборы, пакеты, срок', () => {
  test('book «до даты»: открыт, после даты expireTerms снимает, повторно не выдаётся', async () => {
    setProduct({
      grant: { type: 'book', bookSlugs: ['one'] },
      term: { mode: 'date', date: new Date('2099-12-31T00:00:00Z') },
    });
    Book.find.mockImplementation(() => q([{ _id: 'b1', bookSlug: 'one', priceUsd: 5 }]));
    const order = makeOrder();
    await access.applyOrder(order);
    expect(users.u1.purchasedBooks).toEqual(['b1']);
    expect(iso(order.granted.subscriptionSet.termUntil)).toBe('2099-12-31T00:00:00.000Z');

    CrmOrder.find.mockImplementation((filter) =>
      q(filter && filter['granted.subscriptionSet.termUntil'] ? [order] : [])
    );
    const n = await access.expireTerms(new Date('2100-01-02T00:00:00Z'));
    expect(n).toBe(1);
    expect(users.u1.purchasedBooks).toEqual([]);
    expect(order.granted.at).toBeInstanceOf(Date);
    expect(order.granted.subscriptionSet.termExpiredAt).toBeInstanceOf(Date);
    expect((await access.applyOrder(order)).action).toBe('noop');
  });

  test('book «N мес. с оплаты» — срок от даты платежа', async () => {
    setProduct({ grant: { type: 'book', bookSlugs: ['one'] }, term: { mode: 'months', n: 3 } });
    Book.find.mockImplementation(() => q([{ _id: 'b1', bookSlug: 'one' }]));
    const order = makeOrder({
      payments: [{ amount: 1, at: new Date('2099-01-10T00:00:00Z'), pending: false }],
    });
    await access.applyOrder(order);
    expect(iso(order.granted.subscriptionSet.termUntil)).toBe('2099-04-10T00:00:00.000Z');
  });

  test('pack: пакет в purchasedPackages', async () => {
    setProduct({ grant: { type: 'pack', packageSlug: 'autumn' } });
    Package.findOne.mockImplementation(() => q({ _id: 'k1', packageSlug: 'autumn', priceUsd: 30 }));
    const order = makeOrder();
    await access.applyOrder(order);
    expect(users.u1.purchasedPackages).toEqual(['k1']);
    expect(order.granted.packageIds).toEqual(['k1']);
  });

  test('tier2 и none — в приложении ничего, заказ отмечен выданным без аккаунта', async () => {
    for (const type of ['tier2', 'none']) {
      setProduct({ grant: { type } });
      const order = makeOrder({ clientId: 'c9' });
      const r = await access.applyOrder(order);
      expect(r.action).toBe('granted');
      expect(order.granted.subscriptionSet.userId).toBeNull();
    }
    expect(User.findById).not.toHaveBeenCalled();
  });
});

describe('Тариф 3 — материалы навсегда (B3)', () => {
  test('разбор заведённого месяца — в purchasedBooks и в «Моих покупках»', async () => {
    setProduct({
      grant: { type: 'months', months: ['2026-11', '2026-12'] },
      materialsForever: true,
    });
    ClubMonth.find.mockImplementation(() => q([{ bookId: 'bNov', year: 2026, month: 11 }]));
    Book.find.mockImplementation(() => q([{ _id: 'bNov', bookSlug: 'nov-book', priceUsd: 9 }]));
    const order = makeOrder();
    await access.applyOrder(order);
    expect(users.u1.purchasedBooks).toEqual(['bNov']);
    expect(order.granted.bookIds).toEqual(['bNov']);
    expect(order.granted.subscriptionSet.materialsForever).toBe(true);
    // «Профиль → Мои покупки» = GET /api/purchases/history = записи Purchase.
    expect(Purchase.findOneAndUpdate).toHaveBeenCalledWith(
      { transactionId: 'crm-o1-book-nov-book' },
      expect.objectContaining({
        $set: expect.objectContaining({
          userId: 'u1',
          itemType: 'book',
          itemId: 'nov-book',
          platform: 'web',
          status: 'active',
        }),
      }),
      expect.anything()
    );

    // Клуб декабря заводят позже — разбор докладывается.
    Book.findById.mockImplementation(() => q({ _id: 'bDec', bookSlug: 'dec-book', priceUsd: 9 }));
    CrmOrder.find.mockImplementation(() => q([order]));
    const n = await access.materialsForClubMonth({ year: 2026, month: 12, bookId: 'bDec' });
    expect(n).toBe(1);
    expect(users.u1.purchasedBooks).toEqual(['bNov', 'bDec']);
    expect(order.granted.bookIds).toEqual(['bNov', 'bDec']);
    expect(CrmOrder.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        'granted.months': '2026-12',
        'granted.subscriptionSet.materialsForever': true,
      })
    );
  });

  test('без materialsForever разбор месяца не выдаётся', async () => {
    setProduct({ grant: { type: 'month' } });
    ClubMonth.find.mockImplementation(() => q([{ bookId: 'bOct', year: 2026, month: 10 }]));
    await access.applyOrder(makeOrder());
    expect(users.u1.purchasedBooks).toEqual([]);
  });
});

describe('подарок и баланс', () => {
  test('подарок: получательница заводится по почте, права — ей', async () => {
    setProduct({ grant: { type: 'month' } });
    CrmClient.findOne.mockImplementation(() => q(null));
    CrmClient.create.mockResolvedValue({ _id: 'c2' });
    const order = makeOrder({ gift: { name: 'Оля', email: 'Olya@Mail.ru', recipientClientId: null } });
    await access.applyOrder(order);
    expect(CrmClient.create).toHaveBeenCalledWith(
      expect.objectContaining({ primaryEmail: 'olya@mail.ru', name: 'Оля' })
    );
    expect(order.gift.recipientClientId).toBe('c2');
    expect(users.u2.clubMonthsEntitled).toEqual(['2026-10']);
    expect(users.u1.clubMonthsEntitled).toEqual([]);
  });

  test('deposit: клубная карта 200 → 280 на баланс; возврат списывает', async () => {
    setProduct({ grant: { type: 'deposit', deposit: 280 } });
    const order = makeOrder({ price: 200 });
    await access.applyOrder(order);
    expect(CrmClient.updateOne).toHaveBeenCalledWith({ _id: 'c1' }, { $inc: { balance: 280 } });
    expect(CrmBalanceOp.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 280 }));

    CrmClient.findOneAndUpdate.mockResolvedValue({ _id: 'c1', balance: 0 });
    order.status = 'refund';
    await access.applyOrder(order);
    expect(CrmClient.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'c1', balance: { $gte: 280 } },
      { $inc: { balance: -280 } },
      { new: true }
    );
    expect(CrmBalanceOp.create).toHaveBeenLastCalledWith(expect.objectContaining({ amount: -280 }));
  });

  test('deposit: пополнение уже потрачено → возврат останавливается с 409', async () => {
    setProduct({ grant: { type: 'deposit', deposit: 280 } });
    const order = makeOrder();
    await access.applyOrder(order);
    CrmClient.findOneAndUpdate.mockResolvedValue(null);
    order.status = 'refund';
    await expect(access.applyOrder(order)).rejects.toMatchObject({ statusCode: 409 });
    expect(order.granted.at).toBeInstanceOf(Date);
  });
});

describe('linkUser (B5)', () => {
  test('клиентка по почте связывается, оплаченные заказы выдаются', async () => {
    setProduct({ grant: { type: 'month' } });
    const client = { _id: 'c5', appUserId: null, emails: [], save: jest.fn(() => Promise.resolve()) };
    const order = makeOrder({ clientId: 'c5' });
    CrmClient.find.mockImplementation(() => q([client]));
    CrmClient.findById.mockImplementation((id) => q({ _id: id, appUserId: client.appUserId }));
    CrmOrder.find.mockImplementation((filter) => {
      if (filter['gift.email']) return q([]);
      if (filter.$or) return q([order]);
      return q([]);
    });
    const res = await access.linkUser(users.u1);
    expect(res).toEqual({ linked: 1, applied: 1 });
    expect(client.appUserId).toBe('u1');
    expect(client.emails).toEqual([{ email: 'u1@mail.ru', source: 'app' }]);
    expect(users.u1.clubMonthsEntitled).toEqual(['2026-10']);
    expect(CrmClient.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ 'emails.email': 'u1@mail.ru' }, { primaryEmail: 'u1@mail.ru' }],
      })
    );
  });

  test('клиентка связана с другим аккаунтом — не перепривязываем', async () => {
    const client = { _id: 'c5', appUserId: 'u2', emails: [], save: jest.fn() };
    CrmClient.find.mockImplementation(() => q([client]));
    const res = await access.linkUser(users.u1);
    expect(res).toEqual({ linked: 0, applied: 0 });
    expect(client.save).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  test('без почты (Apple «Скрыть e-mail» без адреса) — ничего не ищем', async () => {
    const res = await access.linkUser(makeUser('u3', { email: undefined }));
    expect(res).toEqual({ linked: 0, applied: 0 });
    expect(CrmClient.find).not.toHaveBeenCalled();
  });

  test('ошибка CRM не ломает вход: linkUserSafe/linkUserForAuth ловят и пишут в лог', async () => {
    CrmOrder.find.mockImplementation(() => {
      throw new Error('mongo упал');
    });
    await expect(access.linkUserSafe(users.u1, 'login')).resolves.toBeNull();
    await expect(access.linkUserForAuth(users.u1, 'login')).resolves.toBe(users.u1);
    expect(logger.error).toHaveBeenCalledWith(
      'CRM linkUser error',
      expect.objectContaining({ context: 'login', message: 'mongo упал' })
    );
  });

  test('linkUserForAuth: если что-то выдано — перечитывает пользователя для ответа', async () => {
    setProduct({ grant: { type: 'month' } });
    const client = { _id: 'c5', appUserId: null, emails: [], save: jest.fn(() => Promise.resolve()) };
    CrmClient.find.mockImplementation(() => q([client]));
    CrmClient.findById.mockImplementation((id) => q({ _id: id, appUserId: client.appUserId }));
    CrmOrder.find.mockImplementation((filter) => q(filter.$or ? [makeOrder({ clientId: 'c5' })] : []));
    const loginDoc = { ...users.u1 };
    const res = await access.linkUserForAuth(loginDoc, 'apple');
    expect(res).toBe(users.u1);
    expect(res.clubMonthsEntitled).toEqual(['2026-10']);
  });
});

describe('unlinkClient (B6)', () => {
  test('снимает выданное на этот аккаунт и рвёт связь', async () => {
    setProduct({ grant: { type: 'month' } });
    const order = makeOrder();
    await access.applyOrder(order);
    const client = { _id: 'c1', appUserId: 'u1', save: jest.fn(() => Promise.resolve()) };
    CrmOrder.find.mockImplementation((filter) => q(filter.$or ? [order] : []));
    const res = await access.unlinkClient(client, { who: 'Тамуна' });
    expect(res).toEqual({ revoked: 1 });
    expect(users.u1.clubMonthsEntitled).toEqual([]);
    expect(order.granted.at).toBeNull();
    expect(client.appUserId).toBeNull();
    expect(CrmBalanceOp.create).not.toHaveBeenCalled();
  });
});
