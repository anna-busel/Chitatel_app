/**
 * CRM D1/D4 (16.11.2026): списки «Клиенты» и «Заказы» — помощники, выгрузка
 * CSV, колонка «Доступ в приложении», сегменты, поиск, фильтры и вкладки.
 *
 * БД не нужна: модели подменены jest.mock, проверяем условия запросов и
 * разбор результатов агрегаций.
 */

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

jest.mock('../src/models/User', () => ({
  distinct: jest.fn(),
  find: jest.fn(),
  collection: { name: 'users' },
}));
jest.mock('../src/crm/models/CrmClient', () => ({
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
  collection: { name: 'crmclients' },
}));
jest.mock('../src/crm/models/CrmOrder', () => ({
  aggregate: jest.fn(),
  distinct: jest.fn(),
  collection: { name: 'crmorders' },
}));
jest.mock('../src/crm/models/CrmProduct', () => ({ find: jest.fn() }));
jest.mock('../src/crm/models/CrmMember', () => ({ find: jest.fn() }));
jest.mock('../src/crm/services/settings.service', () => ({
  getCrmSettings: jest.fn(() => Promise.resolve({ rates: { USD: 3.3, RUB: null } })),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const User = require('../src/models/User');
const CrmClient = require('../src/crm/models/CrmClient');
const CrmOrder = require('../src/crm/models/CrmOrder');
const CrmProduct = require('../src/crm/models/CrmProduct');
const CrmMember = require('../src/crm/models/CrmMember');
const h = require('../src/crm/services/view.helpers');
const { toCsv } = require('../src/crm/services/csv');
const view = require('../src/crm/services/order-view.service');
const clientList = require('../src/crm/services/client-list.service');
const orderList = require('../src/crm/services/order-list.service');

// 15.11.2026 12:00 по локальному времени сервера — текущий клуб '2026-11'.
const NOW = new Date(2026, 10, 15, 12, 0, 0);
const OID = (n) => `64c0000000000000000000${String(n).padStart(2, '0')}`;

beforeEach(() => {
  jest.clearAllMocks();
  CrmProduct.find.mockImplementation(() => q([]));
  CrmMember.find.mockImplementation(() => q([]));
  CrmClient.find.mockImplementation(() => q([]));
  User.find.mockImplementation(() => q([]));
});

describe('view.helpers', () => {
  test('ключ текущего месяца — L1 (локальное время), без нуля', () => {
    expect(h.currentMonthKey(NOW)).toBe('2026-11');
    expect(h.currentMonthKey(new Date(2027, 0, 1))).toBe('2027-1');
  });
  test('месяцы вперёд через Новый год', () => {
    expect(h.monthsAhead('2026-11', 3)).toEqual(['2026-11', '2026-12', '2027-1']);
    expect(h.monthsAhead('2026-11', 2, false)).toEqual(['2026-12', '2027-1']);
  });
  test('последний месяц по наборам (с ведущим нулём и мусором)', () => {
    expect(h.lastMonthKey(['2026-9', '2026-12'], ['2027-02', 'xx'])).toBe('2027-2');
    expect(h.lastMonthKey([], [])).toBeNull();
    expect(h.sortMonthKeys(['2026-12', '2026-9', '2026-09'])).toEqual(['2026-9', '2026-12']);
  });
  test('сортировка из query', () => {
    expect(h.parseSort('-ltv', ['ltv'], null)).toEqual({ key: 'ltv', dir: -1 });
    expect(h.parseSort('name:desc', ['name'], null)).toEqual({ key: 'name', dir: -1 });
    expect(h.parseSort('evil', ['name'], { key: 'name', dir: 1 })).toEqual({ key: 'name', dir: 1 });
  });
  test('страницы: limit 1…100, по умолчанию 15', () => {
    expect(h.paging({})).toEqual({ page: 1, limit: 15, skip: 0 });
    expect(h.paging({ page: '3', limit: '500' })).toEqual({ page: 3, limit: 100, skip: 200 });
  });
  test('пересчёт в BYN: курс не задан → null', () => {
    expect(h.toByn(10, 'USD', { USD: 3.3 })).toBeCloseTo(33);
    expect(h.toByn(10, 'BYN', {})).toBe(10);
    expect(h.toByn(10, 'RUB', { RUB: null })).toBeNull();
  });
});

describe('CSV для Excel', () => {
  test('BOM, «;», кавычки и защита от формул', () => {
    const csv = toCsv(
      [['Имя', (r) => r.a], ['Сумма', (r) => r.b]],
      [{ a: 'Анна; "К."', b: '-12,5' }, { a: '=HYPERLINK("x")', b: null }]
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Имя;Сумма');
    expect(lines[1]).toBe('"Анна; ""К.""";-12,5');
    expect(lines[2]).toBe('"\'=HYPERLINK(""x"")";');
  });
});

describe('«Доступ в приложении» в строке заказа', () => {
  const linked = { _id: OID(1), appUserId: 'u1' };
  const unlinked = { _id: OID(2), appUserId: null };
  const book = { grant: { type: 'book' } };
  const cases = [
    ['заказ стора', { status: 'paid', source: 'app_store' }, null, unlinked, 'Выдано автоматически'],
    ['оплачен, не связана', { status: 'paid', source: 'manual' }, book, unlinked, 'Ждёт привязки'],
    ['выдано', { status: 'paid', source: 'site', granted: { at: NOW } }, book, linked, 'Открыто'],
    [
      'рассрочка с доступом',
      { status: 'partial', source: 'site', granted: { at: NOW } },
      book,
      linked,
      'Открыто · рассрочка',
    ],
    ['депозит', { status: 'paid', source: 'manual', granted: { at: NOW } }, { grant: { type: 'deposit' } }, unlinked, 'Зачислено на баланс'],
    ['только канал', { status: 'paid', source: 'site' }, { grant: { type: 'none' } }, unlinked, 'Вне приложения'],
    ['Тариф 2 (зум)', { status: 'paid', source: 'site' }, { grant: { type: 'tier2' } }, unlinked, 'Вне приложения'],
    ['ждёт подтверждения', { status: 'confirm', source: 'manual' }, book, linked, 'После подтверждения'],
    ['не оплачен', { status: 'new', source: 'site' }, book, linked, 'После оплаты'],
    ['возврат', { status: 'refund', source: 'site' }, book, linked, 'Доступ закрыт'],
    ['ручная выдача админки', { status: 'free', source: 'admin' }, null, linked, 'Открыто'],
    [
      'срок закончился',
      { status: 'paid', source: 'site', granted: { at: NOW, subscriptionSet: { termExpiredAt: NOW } } },
      book,
      linked,
      'Срок доступа закончился',
    ],
  ];
  test.each(cases)('%s', (_n, order, product, recipient, text) => {
    expect(view.appState(order, product, recipient).text).toBe(text);
  });

  test('ни слова о коде активации (L5)', () => {
    cases.forEach(([, order, product, recipient]) => {
      expect(view.appState(order, product, recipient).text).not.toMatch(/код/i);
    });
  });

  test('способ оплаты, просрочка, продукт стора не сопоставлен', () => {
    expect(view.sourceLabel({ status: 'paid', source: 'manual', payments: [{ method: 'transfer' }, { method: 'balance' }] }))
      .toBe('Перевод на карту + Баланс');
    expect(view.sourceLabel({ status: 'free', source: 'manual', payments: [] })).toBe('Без оплаты');
    expect(view.isOverdue({ status: 'new', deadline: new Date(2026, 10, 1) }, NOW)).toBe(true);
    expect(view.isOverdue({ status: 'partial', deadline: new Date(2026, 10, 1) }, NOW)).toBe(false);

    const refs = { products: new Map(), clients: new Map([[OID(1), { name: 'Мария', appUserId: 'u1' }]]), managers: new Map() };
    const row = view.orderRow(
      {
        _id: OID(9),
        num: 9001,
        clientId: OID(1),
        productId: null,
        productTitle: 'club.basic.monthly',
        storeUnmatched: true,
        source: 'app_store',
        status: 'paid',
        price: 12.99,
        cur: 'USD',
        payments: [{ amount: 12.99, method: 'app_store' }],
      },
      refs,
      NOW
    );
    expect(row).toMatchObject({
      num: 9001,
      clientName: 'Мария',
      product: 'club.basic.monthly',
      productUnmatched: true,
      paid: 12.99,
      sourceLabel: 'App Store',
      app: { text: 'Выдано автоматически', tone: 'ok' },
    });
  });
});

describe('Клиенты: сегменты и поиск', () => {
  test('«В клубе сейчас» — текущий месяц + активная подписка; «Без доступа» — $nin тех же id', async () => {
    User.distinct.mockResolvedValue(['u1', 'u2']);
    const resolve = clientList.segmentResolver(NOW);
    expect(await resolve('club')).toEqual({ appUserId: { $in: ['u1', 'u2'] } });
    expect(await resolve('noclub')).toEqual({ appUserId: { $nin: ['u1', 'u2'] } });
    // id считаются один раз на запрос
    expect(User.distinct).toHaveBeenCalledTimes(1);
    const cond = User.distinct.mock.calls[0][1];
    expect(cond.clubMonthsEntitled).toBe('2026-11');
    expect(cond.subscriptionStatus).toEqual({ $in: ['basic', 'premium'] });
    expect(cond.$or).toEqual([{ subscriptionExpiresAt: { $gt: NOW } }, { gracePeriodExpiresAt: { $gt: NOW } }]);
  });

  test('«Доступ до конца месяца» — нет следующих месяцев и не подписка стора', async () => {
    User.distinct.mockResolvedValue(['u3']);
    await clientList.segmentResolver(NOW)('ending');
    const cond = User.distinct.mock.calls[0][1];
    expect(cond.clubMonthsEntitled.$all).toEqual(['2026-11']);
    expect(cond.clubMonthsEntitled.$nin).toContain('2026-12');
    expect(cond.clubMonthsEntitled.$nin).not.toContain('2026-11');
    expect(cond.subscriptionPlatform).toEqual({ $nin: ['apple', 'google'] });
  });

  test('«Не связаны», «Тариф 2», «Без оплат», «Длительные»', async () => {
    User.distinct.mockResolvedValue(['u9']);
    CrmOrder.distinct.mockResolvedValue([OID(5)]);
    const resolve = clientList.segmentResolver(NOW);
    expect(await resolve('unlinked')).toEqual({ appUserId: null });
    expect(await resolve('tier2')).toEqual({ appUserId: { $in: ['u9'] } });
    expect(User.distinct).toHaveBeenLastCalledWith('_id', { isDeleted: { $ne: true }, tier2MonthsEntitled: '2026-11' });

    const noorders = await resolve('noorders');
    expect(noorders).toEqual({
      _id: { $nin: [OID(5)] },
      'legacyMonths.0': { $exists: false },
      appUserId: { $nin: ['u9'] },
    });
    expect(CrmOrder.distinct.mock.calls[0][1].status).toEqual({ $nin: ['fake', 'refund'] });

    const long = await resolve('long');
    expect(long.$or[0]).toEqual({ appUserId: { $in: ['u9'] } });
    expect(JSON.stringify(long.$or[1])).toContain('$legacyMonths');
  });

  test('поиск: имя, почты, тег, @ник, телефон по цифрам, почта приложения', async () => {
    User.find.mockImplementation(() => q([{ _id: 'u7' }]));
    const m = await clientList.searchMatch('+375 (29) 123');
    const keys = m.$or.map((c) => Object.keys(c)[0]);
    expect(keys).toEqual(expect.arrayContaining(['name', 'primaryEmail', 'emails.email', 'tags', 'phoneNorm', 'appUserId']));
    expect(m.$or.find((c) => c.phoneNorm).phoneNorm.source).toBe('37529123');

    const t = await clientList.searchMatch('@anna_k');
    expect(t.$or.find((c) => c['telegram.username'])['telegram.username'].test('Anna_K')).toBe(true);
    expect(t.$or.find((c) => c.phoneNorm)).toBeUndefined();
    expect(await clientList.searchMatch('  ')).toEqual({});
  });

  test('список: строки, счётчики чипов, «Клуб по»', async () => {
    User.distinct.mockResolvedValue([]);
    CrmOrder.distinct.mockResolvedValue([]);
    CrmClient.aggregate.mockResolvedValue([
      {
        _id: OID(1),
        name: 'Мария Иванова',
        primaryEmail: 'm@mail.ru',
        appUserId: 'u1',
        _u: { email: 'app@mail.ru' },
        telegram: { username: 'maria' },
        _untilIdx: 2026 * 12 + 11, // 2026-12
        _ltv: 120.456,
        _last: NOW,
        balance: 5,
        tags: ['Акция'],
      },
      { _id: OID(2), name: 'Ольга', emails: [{ email: 'o@mail.ru' }], appUserId: null, _untilIdx: null, _ltv: 0 },
    ]);
    CrmClient.countDocuments.mockResolvedValue(2);

    const r = await clientList.listClients({ seg: 'all', sort: '-ltv', page: '1' }, NOW);
    expect(r.total).toBe(2);
    expect(r.currentMonth).toBe('2026-11');
    expect(Object.keys(r.counts)).toEqual(clientList.SEGMENTS);
    expect(r.items[0]).toMatchObject({
      name: 'Мария Иванова',
      email: 'm@mail.ru',
      appEmail: 'app@mail.ru',
      linked: true,
      telegram: '@maria',
      until: '2026-12',
      untilActive: true,
      ltv: 120.46,
      tags: ['Акция'],
    });
    expect(r.items[1]).toMatchObject({ email: 'o@mail.ru', linked: false, until: null, untilActive: false });

    const pipeline = CrmClient.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match).toEqual({ mergedInto: null });
    expect(pipeline.find((s) => s.$sort).$sort).toEqual({ _ltv: -1, _id: -1 });
    expect(pipeline.slice(-1)[0]).toEqual({ $limit: 15 });
    const lookups = pipeline.filter((s) => s.$lookup).map((s) => s.$lookup.from);
    expect(lookups).toEqual(['users', 'crmorders']);
  });

  test('сортировка по имени — страница до $lookup', async () => {
    CrmClient.aggregate.mockResolvedValue([]);
    CrmClient.countDocuments.mockResolvedValue(0);
    User.distinct.mockResolvedValue([]);
    CrmOrder.distinct.mockResolvedValue([]);
    await clientList.listClients({ sort: 'name', page: '2' }, NOW);
    const pipeline = CrmClient.aggregate.mock.calls[0][0];
    const idx = (k) => pipeline.findIndex((s) => s[k]);
    expect(idx('$skip')).toBeLessThan(idx('$lookup'));
    expect(pipeline[idx('$skip')].$skip).toBe(15);
  });
});

describe('Заказы: фильтры, вкладки, сумма', () => {
  test('способ оплаты, источник, менеджер, период, номер', async () => {
    expect(await orderList.buildBaseMatch({ source: 'transfer' })).toEqual({ 'payments.method': 'transfer' });
    expect(await orderList.buildBaseMatch({ source: 'app_store' })).toEqual({ source: 'app_store' });
    expect(await orderList.buildBaseMatch({ source: 'free' })).toEqual({ status: 'free' });
    expect(await orderList.buildBaseMatch({ manager: 'none' })).toEqual({ managerId: null });
    const m = await orderList.buildBaseMatch({ manager: OID(3), from: '2026-11-01', to: '2026-11-15', q: '#8921' });
    expect(String(m.$and[0].managerId)).toBe(OID(3));
    expect(m.$and[1].createdAt.$gte).toEqual(new Date(2026, 10, 1));
    expect(m.$and[1].createdAt.$lte).toEqual(new Date(2026, 10, 15, 23, 59, 59, 999));
    expect(m.$and[2]).toEqual({ num: 8921 });
  });

  test('текстовый поиск — по клиенткам, продуктам, позиции стора и тегам', async () => {
    CrmClient.find.mockImplementation(() => q([{ _id: OID(1) }]));
    CrmProduct.find.mockImplementation(() => q([{ _id: OID(2) }]));
    const m = await orderList.buildBaseMatch({ q: 'Зимний' });
    const or = m.$or;
    expect(or.find((c) => c.clientId).clientId.$in).toEqual([OID(1)]);
    expect(or.find((c) => c.productId).productId.$in).toEqual([OID(2)]);
    expect(or.find((c) => c.productTitle)).toBeTruthy();
  });

  test('вкладки как в плане: «Не оплачены» = new + partial', () => {
    expect(orderList.tabMatch('unpaid')).toEqual({ status: { $in: ['new', 'partial'] } });
    expect(orderList.tabMatch('confirm')).toEqual({ status: 'confirm' });
    expect(orderList.tabMatch('all')).toBeNull();
  });

  test('список: счётчики вкладок, получено в BYN, менеджеры, строки', async () => {
    CrmOrder.aggregate
      .mockResolvedValueOnce([
        {
          items: [
            {
              _id: OID(10),
              num: 8921,
              clientId: OID(1),
              productId: OID(2),
              status: 'paid',
              source: 'manual',
              price: 100,
              cur: 'BYN',
              payments: [{ amount: 100, method: 'transfer' }],
              managerId: OID(3),
            },
          ],
          total: [{ n: 1 }],
        },
      ])
      .mockResolvedValueOnce([
        {
          byStatus: [
            { _id: 'new', n: 2 },
            { _id: 'partial', n: 1 },
            { _id: 'paid', n: 5 },
            { _id: 'refund', n: 1 },
          ],
          received: [{ s: 512.345 }],
        },
      ]);
    CrmMember.find.mockImplementation((cond) =>
      q(cond && cond.active ? [{ _id: OID(3), name: 'Тамуна' }] : [{ _id: OID(3), name: 'Тамуна' }])
    );
    CrmProduct.find.mockImplementation(() => q([{ _id: OID(2), name: 'Зимний сезон', grant: { type: 'months' } }]));
    CrmClient.find.mockImplementation(() => q([{ _id: OID(1), name: 'Мария', appUserId: null }]));

    const r = await orderList.listOrders({ status: 'paid', sort: 'amount:desc' }, NOW);
    expect(r.tabs).toEqual({ all: 9, unpaid: 3, confirm: 0, paid: 5, free: 0, fake: 0, refund: 1 });
    expect(r.receivedByn).toBe(512.35);
    expect(r.managers).toEqual([{ id: OID(3), name: 'Тамуна' }]);
    expect(r.items[0]).toMatchObject({
      num: 8921,
      clientName: 'Мария',
      product: 'Зимний сезон',
      managerName: 'Тамуна',
      sourceLabel: 'Перевод на карту',
      app: { text: 'Ждёт привязки', tone: 'warn' },
    });

    const [listPipe] = CrmOrder.aggregate.mock.calls[0];
    expect(listPipe[0].$match).toEqual({ status: 'paid' });
    const items = listPipe[1].$facet.items;
    expect(items.find((s) => s.$sort).$sort).toEqual({ _sort: -1, _id: -1 });
    // курс USD из настроек попадает в пересчёт суммы
    expect(JSON.stringify(items)).toContain('3.3');
  });
});
