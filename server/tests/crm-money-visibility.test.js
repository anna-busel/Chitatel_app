/**
 * 27.11.2026: менеджер в CRM не видит выручку («получено» над заказами),
 * суммы покупок клиенток и не выгружает базу в Excel. Это право «stats»
 * (владелец, админ, маркетинг).
 */
jest.mock('../src/crm/middleware/auth', () => {
  const { can } = jest.requireActual('../src/crm/services/permissions');
  return {
    requireCrm: (perm) => {
      const mw = (req, _res, next) => {
        if (perm && !can(req.crmMember.role, perm)) {
          const err = new Error('Недостаточно прав');
          err.statusCode = 403;
          return next(err);
        }
        return next();
      };
      mw.perm = perm;
      return mw;
    },
  };
});
jest.mock('../src/crm/services/order-list.service', () => ({
  listOrders: jest.fn(),
  exportOrders: jest.fn(),
}));
jest.mock('../src/crm/services/client-list.service', () => ({
  listClients: jest.fn(),
  exportClients: jest.fn(),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));

const { listOrders } = require('../src/crm/services/order-list.service');
const { listClients } = require('../src/crm/services/client-list.service');
const ordersRouter = require('../src/crm/routes/orders');
const clientsRouter = require('../src/crm/routes/clients');

function route(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer.route.stack.map((s) => s.handle);
}

async function call(handlers, role, query = {}) {
  const req = { crmMember: { id: 'm1', name: 'Тест', role }, query };
  let body = null;
  let error = null;
  const res = {
    status() { return res; },
    json(b) { body = b; return res; },
  };
  for (const h of handlers) {
    let passed = false;
    await h(req, res, (err) => { passed = !err; if (err) {error = err;} });
    if (!passed) {break;}
  }
  return { body, error, query: req.query };
}

beforeEach(() => jest.clearAllMocks());

describe('заказы', () => {
  beforeEach(() => listOrders.mockResolvedValue({ items: [], total: 0, receivedByn: 1234 }));

  test('менеджер не видит «получено»', async () => {
    const { body } = await call(route(ordersRouter, 'get', '/'), 'manager');
    expect(body.data.receivedByn).toBeNull();
  });

  test('админ видит «получено»', async () => {
    const { body } = await call(route(ordersRouter, 'get', '/'), 'admin');
    expect(body.data.receivedByn).toBe(1234);
  });

  test('выгрузка заказов — только с правом stats', async () => {
    const h = route(ordersRouter, 'get', '/export.csv');
    expect((await call(h, 'manager')).error.statusCode).toBe(403);
  });
});

describe('клиентки', () => {
  beforeEach(() => listClients.mockResolvedValue({ items: [{ id: 'c1', name: 'Оля', ltv: 500 }], total: 1 }));

  test('менеджер не видит сумму покупок и не сортирует по ней', async () => {
    const { body } = await call(route(clientsRouter, 'get', '/'), 'manager', { sort: '-ltv' });
    expect(body.data.items[0].ltv).toBeNull();
    expect(body.data.items[0].name).toBe('Оля');
    expect(listClients.mock.calls[0][0].sort).toBeUndefined();
  });

  test('владелец видит сумму покупок', async () => {
    const { body } = await call(route(clientsRouter, 'get', '/'), 'owner', { sort: '-ltv' });
    expect(body.data.items[0].ltv).toBe(500);
    expect(listClients.mock.calls[0][0].sort).toBe('-ltv');
  });

  test('выгрузка клиенток — только с правом stats', async () => {
    const h = route(clientsRouter, 'get', '/export.csv');
    expect((await call(h, 'manager')).error.statusCode).toBe(403);
  });
});
