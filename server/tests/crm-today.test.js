/**
 * CRM D7/D8 (19.11.2026): «Сегодня», глобальный поиск, колокольчик.
 *
 * БД не нужна: модели подменены jest.mock, проверяем условия запросов,
 * сборку блоков и отметку прочитанного.
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
  find: jest.fn(),
  countDocuments: jest.fn(),
  collection: { name: 'crmorders' },
}));
jest.mock('../src/crm/models/CrmProduct', () => ({ find: jest.fn() }));
jest.mock('../src/crm/models/CrmMember', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../src/crm/models/CrmTask', () => ({ find: jest.fn() }));
jest.mock('../src/crm/models/CrmThread', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../src/crm/models/CrmTgRequest', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../src/crm/models/CrmTgChannel', () => ({ find: jest.fn() }));
jest.mock('../src/crm/models/CrmAudit', () => ({ find: jest.fn() }));
jest.mock('../src/crm/services/settings.service', () => ({
  getCrmSettings: jest.fn(() => Promise.resolve({ requireTransferConfirm: true, rates: {} })),
}));
jest.mock('../src/crm/services/store-ingest.service', () => ({
  productsWithStoreWarnings: jest.fn(),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const User = require('../src/models/User');
const CrmClient = require('../src/crm/models/CrmClient');
const CrmOrder = require('../src/crm/models/CrmOrder');
const CrmProduct = require('../src/crm/models/CrmProduct');
const CrmMember = require('../src/crm/models/CrmMember');
const CrmTask = require('../src/crm/models/CrmTask');
const CrmThread = require('../src/crm/models/CrmThread');
const CrmTgRequest = require('../src/crm/models/CrmTgRequest');
const CrmTgChannel = require('../src/crm/models/CrmTgChannel');
const CrmAudit = require('../src/crm/models/CrmAudit');
const { productsWithStoreWarnings } = require('../src/crm/services/store-ingest.service');
const today = require('../src/crm/services/today.service');
const search = require('../src/crm/services/search.service');
const notif = require('../src/crm/services/notifications.service');

// 19.11.2026 12:00 по локальному времени сервера.
const NOW = new Date(2026, 10, 19, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const OID = (n) => `64c0000000000000000000${String(n).padStart(2, '0')}`;
const OWNER = { id: OID(90), role: 'owner' };
const MANAGER = { id: OID(91), role: 'manager' };
const MARKETING = { id: OID(92), role: 'marketing' };

const linked = { _id: OID(1), name: 'Ольга', primaryEmail: 'olga@x.by', appUserId: 'u1' };
const unlinked = { _id: OID(2), name: 'Мария', primaryEmail: 'maria@x.by', appUserId: null };
const book = { _id: OID(50), name: 'Разбор «Анна Каренина»', grant: { type: 'book' } };

beforeEach(() => {
  jest.clearAllMocks();
  CrmOrder.find.mockImplementation(() => q([]));
  CrmOrder.aggregate.mockResolvedValue([]);
  CrmOrder.countDocuments.mockResolvedValue(0);
  CrmClient.find.mockImplementation(() => q([linked, unlinked]));
  CrmProduct.find.mockImplementation(() => q([book]));
  CrmMember.find.mockImplementation(() => q([{ _id: OID(90), name: 'Анна' }]));
  CrmMember.findById.mockImplementation(() => q({ notificationsRead: [], notificationsSeenAt: null }));
  CrmMember.updateOne.mockResolvedValue({});
  CrmTask.find.mockImplementation(() => q([]));
  CrmThread.find.mockImplementation(() => q([]));
  CrmThread.countDocuments.mockResolvedValue(0);
  CrmTgRequest.find.mockImplementation(() => q([]));
  CrmTgRequest.countDocuments.mockResolvedValue(0);
  CrmTgChannel.find.mockImplementation(() => q([]));
  CrmAudit.find.mockImplementation(() => q([]));
  User.find.mockImplementation(() => q([]));
  productsWithStoreWarnings.mockResolvedValue([]);
});

/** CrmOrder.find: ответ по первому совпавшему условию запроса. */
function ordersBy(rules) {
  CrmOrder.find.mockImplementation((cond) => {
    const hit = rules.find(([test]) => test(cond || {}));
    return q(hit ? hit[1] : []);
  });
}

describe('«Сегодня» (D7)', () => {
  test('пусто: KPI нули, блоки пустые, задачи/входящие/каналы читаются из своих коллекций', async () => {
    const d = await today.getToday(MANAGER, NOW);
    expect(d.kpis).toEqual({ unpaid: 0, unlinked: 0, inbox: 0, tg: 0 });
    expect(d.tasks).toEqual([]);
    expect(d.tg).toEqual([]);
    expect(d.unpaid).toEqual([]);
    expect(d.transfers).toEqual([]);
    expect(d.unlinked).toEqual([]);
    expect(d.recent).toEqual([]);
    expect(d.store).toEqual({ products: [], unmatchedCount: 0, unmatched: [] });
    expect(d.requireTransferConfirm).toBe(true);
    expect(d.canConfirm).toBe(false);
    expect(CrmThread.countDocuments).toHaveBeenCalledWith({ answered: false, spam: { $ne: true } });
    expect(CrmTgRequest.countDocuments).toHaveBeenCalledWith({ status: 'pending' });
  });

  test('KPI «неоплаченные» — new + partial, как вкладка «Не оплачены»', async () => {
    CrmOrder.countDocuments.mockImplementation((c) =>
      Promise.resolve(c.status && c.status.$in && c.status.$in.includes('partial') ? 4 : 0));
    CrmThread.countDocuments.mockResolvedValue(2);
    CrmTgRequest.countDocuments.mockResolvedValue(3);
    const d = await today.getToday(OWNER, NOW);
    expect(d.kpis.unpaid).toBe(4);
    expect(d.kpis.inbox).toBe(2);
    expect(d.kpis.tg).toBe(3);
    expect(CrmOrder.countDocuments).toHaveBeenCalledWith({ status: { $in: ['new', 'partial'] } });
  });

  test('мои задачи: исполнитель — я, до конца сегодняшнего дня, не выполнены', async () => {
    CrmTask.find.mockImplementation(() =>
      q([
        { _id: OID(70), type: 'call', title: 'Позвонить про сезон', clientId: OID(1), due: new Date(NOW.getTime() - HOUR), priority: 'high' },
        { _id: OID(71), type: 'msg', title: 'Написать', clientId: null, due: new Date(NOW.getTime() + HOUR) },
      ]));
    const d = await today.getToday(MANAGER, NOW);
    const cond = CrmTask.find.mock.calls[0][0];
    expect(String(cond.assigneeId)).toBe(MANAGER.id);
    expect(cond.done).toEqual({ $ne: true });
    expect(cond.due.$lte).toEqual(new Date(2026, 10, 19, 23, 59, 59, 999));
    expect(d.tasks).toHaveLength(2);
    expect(d.tasks[0]).toMatchObject({ title: 'Позвонить про сезон', typeLabel: 'Позвонить', priorityLabel: 'Высокий', overdue: true, clientName: 'Ольга' });
    expect(d.tasks[1]).toMatchObject({ overdue: false, clientName: null });
  });

  test('ждут оплаты: остаток с учётом скидки и подтверждённых платежей, просрочка', async () => {
    CrmOrder.aggregate.mockImplementation((p) => {
      if (p[0].$match.status && p[0].$match.status.$in && p[0].$match.status.$in.includes('partial')) {
        return Promise.resolve([
          {
            _id: OID(10), num: 5001, clientId: OID(1), productId: OID(50), price: 100, discount: 10, cur: 'BYN',
            status: 'partial', source: 'site', deadline: new Date(NOW.getTime() + 48 * HOUR),
            payments: [{ amount: 30, method: 'bepaid' }, { amount: 20, method: 'transfer', pending: true }],
          },
          {
            _id: OID(11), num: 5002, clientId: OID(2), productId: OID(50), price: 50, cur: 'BYN',
            status: 'new', source: 'manual', deadline: new Date(NOW.getTime() - 24 * HOUR), payments: [],
            remindersSent: [{ kind: 'r1' }],
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const d = await today.getToday(MANAGER, NOW);
    expect(d.unpaid[0]).toMatchObject({ num: 5001, left: 60, overdue: false, reminded: false });
    expect(d.unpaid[1]).toMatchObject({ num: 5002, left: 50, overdue: true, reminded: true, clientName: 'Мария' });
  });

  test('переводы ждут подтверждения: pending-платёж или статус confirm, без ложных и возвратов', async () => {
    ordersBy([
      [(c) => Array.isArray(c.$or) && c.$or.some((x) => x.status === 'confirm'), [
        {
          _id: OID(12), num: 5003, clientId: OID(1), productId: OID(50), price: 90, cur: 'BYN', status: 'confirm',
          source: 'manual', payments: [{ _id: OID(80), amount: 90, method: 'transfer', pending: true, account: 'Карта Анны · BYN', at: NOW }],
        },
      ]],
    ]);
    const d = await today.getToday(OWNER, NOW);
    const call = CrmOrder.find.mock.calls.find(([c]) => Array.isArray(c.$or) && c.$or.some((x) => x.status === 'confirm'));
    expect(call[0].status).toEqual({ $nin: ['fake', 'refund'] });
    expect(call[0].$or).toContainEqual({ 'payments.pending': true });
    expect(d.transfers).toHaveLength(1);
    expect(d.transfers[0].payment).toMatchObject({ amount: 90, methodLabel: 'Перевод на карту', account: 'Карта Анны · BYN' });
    expect(d.canConfirm).toBe(true);
  });

  test('оплатили — не связаны: «Ждёт привязки», по одной строке на клиентку, стор и админка исключены', async () => {
    const paid = (n, client, at) => ({
      _id: OID(n), num: 6000 + n, clientId: client._id, productId: OID(50), price: 50, cur: 'BYN',
      status: 'paid', source: 'site', payments: [{ amount: 50, method: 'bepaid', at }],
    });
    ordersBy([
      [(c) => c.source && c.source.$nin, [
        paid(20, unlinked, new Date(NOW.getTime() - 2 * HOUR)),
        paid(21, unlinked, new Date(NOW.getTime() - 30 * HOUR)),
        paid(22, linked, new Date(NOW.getTime() - HOUR)),
      ]],
    ]);
    const d = await today.getToday(MANAGER, NOW);
    const call = CrmOrder.find.mock.calls.find(([c]) => c.source && c.source.$nin);
    expect(call[0].source.$nin).toEqual(['app_store', 'google_play', 'admin']);
    expect(call[0].status).toEqual({ $in: ['paid', 'free'] });
    expect(call[0].$or[0]['payments.at'].$gte).toEqual(new Date(NOW.getTime() - 14 * 24 * HOUR));
    expect(d.unlinked).toHaveLength(1);
    expect(d.unlinked[0]).toMatchObject({ clientName: 'Мария', num: 6020, product: 'Разбор «Анна Каренина»' });
    expect(d.kpis.unlinked).toBe(1);
  });

  test('предупреждения стора (C2/L8): продукты без товара в App Store и заказы storeUnmatched', async () => {
    productsWithStoreWarnings.mockResolvedValue([
      { productId: OID(51), name: 'Атлант', warnings: [{ code: 'not_in_app_store', text: 'Разбор «Атлант» не заведён в App Store' }] },
    ]);
    CrmOrder.countDocuments.mockImplementation((c) => Promise.resolve(c.storeUnmatched ? 2 : 0));
    ordersBy([
      [(c) => c.storeUnmatched === true, [
        { _id: OID(30), num: 7001, clientId: OID(1), productId: null, productTitle: 'book.atlant', storeProductId: 'book.atlant', storeUnmatched: true, status: 'paid', source: 'app_store', price: 9.99, cur: 'USD' },
      ]],
    ]);
    const d = await today.getToday(MARKETING, NOW);
    expect(d.store.products).toEqual([
      { productId: OID(51), name: 'Атлант', warnings: [{ code: 'not_in_app_store', text: 'Разбор «Атлант» не заведён в App Store' }] },
    ]);
    expect(d.store.unmatchedCount).toBe(2);
    expect(d.store.unmatched[0]).toMatchObject({ num: 7001, productUnmatched: true, storeProductId: 'book.atlant' });
    expect(CrmOrder.countDocuments).toHaveBeenCalledWith({ storeUnmatched: true, productId: null });
  });

  test('заявки в каналы: ник, название канала, клиентка', async () => {
    CrmTgRequest.find.mockImplementation(() =>
      q([{ _id: OID(60), tgUserId: '777', username: 'reader', chatId: '-100', clientId: OID(2), reason: 'Оплата не найдена', at: NOW }]));
    CrmTgChannel.find.mockImplementation(() => q([{ chatId: '-100', title: 'Клуб · ноябрь' }]));
    const d = await today.getToday(MANAGER, NOW);
    expect(d.tg[0]).toMatchObject({ username: '@reader', channel: 'Клуб · ноябрь', reason: 'Оплата не найдена', clientName: 'Мария' });
  });

  test('последние оплаты: только подтверждённые, без ложных и возвратов, за 30 дней', async () => {
    CrmOrder.aggregate.mockImplementation((p) => {
      if (p[0].$match['payments.at']) {
        return Promise.resolve([
          { _id: OID(40), num: 8001, clientId: OID(1), productId: OID(50), price: 50, cur: 'BYN', status: 'paid', source: 'site', payments: [{ amount: 50, method: 'bepaid', at: NOW }], _paidAt: NOW },
        ]);
      }
      return Promise.resolve([]);
    });
    const d = await today.getToday(MANAGER, NOW);
    const pipe = CrmOrder.aggregate.mock.calls.map((c) => c[0]).find((p) => p[0].$match['payments.at']);
    expect(pipe[0].$match.status).toEqual({ $nin: ['fake', 'refund'] });
    expect(pipe[0].$match['payments.at'].$gte).toEqual(new Date(NOW.getTime() - 30 * 24 * HOUR));
    expect(d.recent[0]).toMatchObject({ num: 8001, sourceLabel: 'bePaid', paidAt: NOW });
  });

  test('журнал за сутки: имя участницы, действие, клиентка/заказ; служебное скрыто; только с правом «Настройки»', async () => {
    CrmAudit.find.mockImplementation(() =>
      q([
        { _id: OID(1), memberId: OID(90), at: NOW, action: 'client.link', entity: 'CrmClient', entityId: OID(2) },
        { _id: OID(2), memberId: OID(90), at: NOW, action: 'order.refund', entity: 'CrmOrder', entityId: OID(41) },
        { _id: OID(3), memberId: OID(99), at: NOW, action: 'POST /api/crm/clients/tags', entity: null, entityId: null },
      ]));
    ordersBy([[(c) => c._id && c._id.$in, [{ _id: OID(41), num: 8100 }]]]);
    const d = await today.getToday(OWNER, NOW);
    const cond = CrmAudit.find.mock.calls[0][0];
    expect(cond.at.$gte).toEqual(new Date(NOW.getTime() - 24 * HOUR));
    expect(cond.action).toEqual({ $nin: ['notifications.read'] });
    expect(d.journal[0]).toMatchObject({ who: 'Анна', text: 'связала клиентку с приложением', entity: 'Мария', link: { type: 'client', id: OID(2) } });
    expect(d.journal[1]).toMatchObject({ text: 'оформила возврат', entity: 'Заказ #8100', link: { type: 'order', id: OID(41) } });
    expect(d.journal[2]).toMatchObject({ who: 'Участница команды', text: 'POST /clients/tags', entity: null });

    CrmAudit.find.mockClear();
    const m = await today.getToday(MANAGER, NOW);
    expect(m.journal).toBeNull();
    expect(CrmAudit.find).not.toHaveBeenCalled();
  });
});

describe('глобальный поиск (D8)', () => {
  test('номер заказа: префикс номера диапазонами по индексу', () => {
    expect(search.numPrefixMatch('123456789')).toEqual({ num: { $gte: 123456789, $lt: 123456790 } });
    const m = search.numPrefixMatch('12345678');
    expect(m.$or).toEqual([
      { num: { $gte: 12345678, $lt: 12345679 } },
      { num: { $gte: 123456780, $lt: 123456790 } },
    ]);
    expect(search.numPrefixMatch('12a')).toBeNull();
    expect(search.orderNumQuery('#5001')).toBe('5001');
    expect(search.orderNumQuery('№ 5001')).toBe('5001');
    expect(search.orderNumQuery('Ольга')).toBeNull();
  });

  test('короткий текст — ничего не ищем', async () => {
    const r = await search.searchAll('о');
    expect(r.items).toEqual([]);
    expect(CrmClient.find).not.toHaveBeenCalled();
    expect(CrmOrder.find).not.toHaveBeenCalled();
  });

  test('текст: клиентки по имени/почте/@нику, без склеенных дублей; заказы не ищутся', async () => {
    CrmClient.find.mockImplementation(() =>
      q([{ _id: OID(1), name: 'Ольга', primaryEmail: 'olga@x.by', telegram: { username: 'olga_reads' } }]));
    const r = await search.searchAll('Ольга');
    const cond = CrmClient.find.mock.calls[0][0];
    expect(cond.$and[0]).toEqual({ mergedInto: null });
    const ors = cond.$and[1].$or.map((x) => Object.keys(x)[0]);
    expect(ors).toEqual(expect.arrayContaining(['name', 'primaryEmail', 'emails.email', 'telegram.username']));
    expect(CrmOrder.find).not.toHaveBeenCalled();
    expect(r.items).toEqual([{ kind: 'client', id: OID(1), title: 'Ольга', sub: 'olga@x.by · @olga_reads' }]);
  });

  test('«#5001» — только заказы, точный номер первым', async () => {
    ordersBy([[(c) => c.$or || c.num, [
      { _id: OID(11), num: 50010, clientId: OID(2), productId: OID(50), status: 'new', source: 'site' },
      { _id: OID(10), num: 5001, clientId: OID(1), productId: OID(50), status: 'paid', source: 'site' },
    ]]]);
    const r = await search.searchAll('#5001');
    expect(CrmClient.find).not.toHaveBeenCalledWith(expect.objectContaining({ $and: expect.anything() }));
    expect(r.items.map((x) => x.kind)).toEqual(['order', 'order']);
    expect(r.items[0]).toMatchObject({ id: OID(10), num: 5001, title: 'Заказ #5001', sub: 'Ольга · Разбор «Анна Каренина»', clientId: OID(1) });
  });

  test('цифры без «#» — и заказы по номеру, и клиентки по телефону', async () => {
    CrmClient.find.mockImplementation((c) =>
      q(c && c.$and ? [{ _id: OID(3), name: 'Ирина', phone: '+375 29 500 12 34' }] : [linked]));
    ordersBy([[(c) => c.$or, [{ _id: OID(10), num: 5001, clientId: OID(1), productId: OID(50), status: 'paid', source: 'site' }]]]);
    const r = await search.searchAll('5001');
    const cond = CrmClient.find.mock.calls.find(([c]) => c && c.$and)[0];
    expect(cond.$and[1].$or).toContainEqual({ phoneNorm: /5001/ });
    expect(r.items.map((x) => x.kind)).toEqual(['client', 'order']);
    expect(r.items[0]).toMatchObject({ title: 'Ирина', sub: '+375 29 500 12 34' });
  });
});

describe('уведомления (D8)', () => {
  const pendingOrder = {
    _id: OID(12), num: 5003, clientId: OID(1), productId: OID(50), price: 90, cur: 'BYN', status: 'confirm',
    source: 'manual', payments: [{ _id: OID(80), amount: 90, method: 'transfer', pending: true, at: new Date(NOW.getTime() - 3 * HOUR) }],
  };
  const paidOrder = {
    _id: OID(13), num: 5004, clientId: OID(2), productId: OID(50), price: 50, cur: 'BYN', status: 'paid', source: 'site',
    payments: [
      { _id: OID(81), amount: 50, method: 'bepaid', at: new Date(NOW.getTime() - HOUR) },
      { _id: OID(82), amount: 10, method: 'balance', at: new Date(NOW.getTime() - HOUR) },
      { _id: OID(83), amount: 5, method: 'bepaid', at: new Date(NOW.getTime() - 50 * HOUR) },
    ],
  };
  const overdueOrder = {
    _id: OID(14), num: 5005, clientId: OID(2), productId: OID(50), price: 50, cur: 'BYN', status: 'new', source: 'site',
    deadline: new Date(2026, 10, 17, 10, 0, 0), payments: [],
  };

  function setup() {
    ordersBy([
      [(c) => Array.isArray(c.$or) && c.$or.some((x) => x.status === 'confirm'), [pendingOrder]],
      [(c) => c.payments && c.payments.$elemMatch, [paidOrder]],
      [(c) => c.status === 'new' && c.deadline, [overdueOrder]],
    ]);
    CrmTask.find.mockImplementation(() =>
      q([{ _id: OID(70), title: 'Позвонить Ольге', clientId: OID(1), due: new Date(NOW.getTime() - 5 * HOUR) }]));
    CrmThread.find.mockImplementation(() =>
      q([{ _id: OID(71), clientId: OID(2), channel: 'bot', lastAt: new Date(NOW.getTime() - 2 * HOUR), messages: [{ dir: 'in', text: 'Не открывается клуб' }] }]));
    CrmTgRequest.find.mockImplementation(() =>
      q([{ _id: OID(72), tgUserId: '777', username: 'reader', chatId: '-100', at: new Date(NOW.getTime() - 4 * HOUR) }]));
    CrmTgChannel.find.mockImplementation(() => q([{ chatId: '-100', title: 'Клуб · ноябрь' }]));
  }

  test('собираются из данных: перевод, оплата (без баланса и старше суток), просроченный счёт, сообщение, задача, заявка', async () => {
    setup();
    const items = await notif.buildNotifications(OWNER, NOW);
    expect(items.map((n) => n.kind)).toEqual(['payment', 'message', 'transfer', 'tg', 'task', 'overdue']);
    const by = Object.fromEntries(items.map((n) => [n.kind, n]));
    expect(by.transfer).toMatchObject({
      id: `c${OID(12)}_${OID(80)}`,
      text: 'Перевод ждёт подтверждения · Ольга',
      sub: '90 BYN · заказ #5003 · подтвердите, что деньги пришли',
      link: { type: 'order', id: OID(12) },
    });
    expect(by.payment).toMatchObject({ id: `p${OID(13)}_${OID(81)}`, text: 'Оплата 50 BYN · Мария', sub: 'Разбор «Анна Каренина» · bePaid' });
    expect(by.overdue).toMatchObject({ text: 'Просрочен счёт #5005', sub: 'Мария · срок был 17.11.2026' });
    expect(by.message).toMatchObject({ text: 'Сообщение · Мария', sub: 'Telegram-бот · Не открывается клуб', link: { type: 'inbox', id: OID(71) } });
    expect(by.task).toMatchObject({ text: 'Просрочена задача · Ольга', sub: 'Позвонить Ольге' });
    expect(by.tg).toMatchObject({ text: 'Заявка в канал без оплаты · @reader', sub: 'Клуб · ноябрь' });

    const taskCond = CrmTask.find.mock.calls[0][0];
    expect(String(taskCond.assigneeId)).toBe(OWNER.id);
    expect(taskCond.due.$lt).toEqual(NOW);
  });

  test('без права «Входящие» сообщений нет; перевод «подтвердит Анна»', async () => {
    setup();
    const items = await notif.buildNotifications(MARKETING, NOW);
    expect(items.find((n) => n.kind === 'message')).toBeUndefined();
    expect(CrmThread.find).not.toHaveBeenCalled();
    expect(items.find((n) => n.kind === 'transfer').sub).toMatch(/подтвердит Анна$/);
  });

  test('отметка прочитанного по участнице и число непрочитанных', async () => {
    setup();
    CrmMember.findById.mockImplementation(() =>
      q({ notificationsRead: [`o${OID(14)}`, 'старое'], notificationsSeenAt: null }));
    const r = await notif.getNotifications(OWNER, NOW);
    expect(r.items).toHaveLength(6);
    expect(r.items.find((n) => n.kind === 'overdue').read).toBe(true);
    expect(r.unread).toBe(5);
  });

  test('отметить одно: только актуальные id, устаревшие вычищаются', async () => {
    setup();
    CrmMember.findById.mockImplementation(() => q({ notificationsRead: [`o${OID(14)}`, 'старое'] }));
    const r = await notif.markRead(OWNER, { ids: [`r${OID(72)}`, 'чужое'] }, NOW);
    const [filter, update] = CrmMember.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: OWNER.id });
    expect(update.$set.notificationsRead).toEqual([`o${OID(14)}`, `r${OID(72)}`]);
    expect(update.$set.notificationsSeenAt).toBeUndefined();
    expect(r.unread).toBe(4);
  });

  test('«Прочитать все» — все текущие id и время', async () => {
    setup();
    const r = await notif.markRead(OWNER, { all: true }, NOW);
    const update = CrmMember.updateOne.mock.calls[0][1];
    expect(update.$set.notificationsRead).toHaveLength(6);
    expect(update.$set.notificationsSeenAt).toEqual(NOW);
    expect(r.unread).toBe(0);
  });

  test('новое сообщение в том же диалоге — новое уведомление (id с lastAt)', async () => {
    setup();
    const a = (await notif.buildNotifications(OWNER, NOW)).find((n) => n.kind === 'message').id;
    CrmThread.find.mockImplementation(() =>
      q([{ _id: OID(71), clientId: OID(2), channel: 'bot', lastAt: NOW, messages: [{ dir: 'in', text: 'Ещё вопрос' }] }]));
    const b = (await notif.buildNotifications(OWNER, NOW)).find((n) => n.kind === 'message').id;
    expect(a).not.toBe(b);
  });
});
