/**
 * CRM D3 (19.11.2026): дубли клиенток и объединение — поиск по телефону и
 * почтам, перенос заказов/баланса/тегов/комментариев/почт, аккаунт
 * приложения, отмена, скрытие объединённой карточки из списков.
 *
 * БД не нужна: модели подменены маленьким хранилищем в памяти (fakeModel) —
 * понимает фильтры и обновления, которыми пользуется client-merge.service.
 */

/* ------------------------- хранилище в памяти ------------------------- */

let seq = 0;
const newId = () => `64d${String(++seq).padStart(21, '0')}`;
const clone = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
const eq = (a, b) => (a === null || a === undefined ? b === null || b === undefined : String(a) === String(b));

function values(doc, path) {
  let cur = [doc];
  for (const k of path.split('.')) {
    const next = [];
    cur.forEach((v) => {
      if (v === null || v === undefined) {return;}
      if (Array.isArray(v) && !/^\d+$/.test(k)) {
        v.forEach((x) => next.push(x && typeof x === 'object' ? x[k] : undefined));
      } else {
        next.push(v[k]);
      }
    });
    cur = next;
  }
  return cur.flatMap((v) => (Array.isArray(v) ? (v.length ? v : [v]) : [v]));
}

function matchCond(vals, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$in': return vals.some((v) => arg.some((a) => eq(v, a)));
        case '$nin': return !vals.some((v) => arg.some((a) => eq(v, a)));
        case '$ne': return !vals.some((v) => eq(v, arg));
        case '$gte': return vals.some((v) => v !== null && v !== undefined && v >= arg);
        case '$exists': return vals.some((v) => v !== undefined) === Boolean(arg);
        case '$elemMatch': return true;
        default: throw new Error(`fake: оператор ${op}`);
      }
    });
  }
  return vals.length ? vals.some((v) => eq(v, cond)) : eq(undefined, cond);
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') {return cond.some((f) => matches(doc, f));}
    if (k === '$and') {return cond.every((f) => matches(doc, f));}
    if (k === '$nor') {return !cond.some((f) => matches(doc, f));}
    if (k === '$expr') {return true;}
    return matchCond(values(doc, k), cond);
  });
}

function setPath(doc, path, value) {
  const keys = path.split('.');
  let o = doc;
  keys.slice(0, -1).forEach((k) => {
    if (o[k] === null || o[k] === undefined) {o[k] = {};}
    o = o[k];
  });
  o[keys[keys.length - 1]] = clone(value);
}
const getPath = (doc, path) => path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), doc);

function applyUpdate(doc, update) {
  Object.entries(update).forEach(([op, fields]) => {
    Object.entries(fields).forEach(([path, arg]) => {
      const cur = getPath(doc, path);
      switch (op) {
        case '$set': setPath(doc, path, arg); break;
        case '$inc': setPath(doc, path, (Number(cur) || 0) + arg); break;
        case '$addToSet': {
          const list = cur || [];
          (arg && arg.$each ? arg.$each : [arg]).forEach((x) => { if (!list.some((y) => eq(y, x))) {list.push(x);} });
          setPath(doc, path, list);
          break;
        }
        case '$push': setPath(doc, path, (cur || []).concat(arg && arg.$each ? arg.$each : [arg])); break;
        case '$pullAll': setPath(doc, path, (cur || []).filter((x) => !arg.some((a) => eq(a, x)))); break;
        case '$pull': setPath(doc, path, (cur || []).filter((x) => !matches(x, arg))); break;
        default: throw new Error(`fake: обновление ${op}`);
      }
    });
  });
}

function chain(fn) {
  const c = {
    select: () => c,
    lean: () => c,
    sort: () => c,
    skip: () => c,
    limit: () => c,
    then: (res, rej) => Promise.resolve().then(fn).then(res, rej),
  };
  return c;
}

function mockFakeModel() {
  const m = {
    docs: [],
    reset() { m.docs = []; },
    seed(list) { list.forEach((d) => m.docs.push({ _id: d._id || newId(), ...clone(d) })); },
    get(id) { return m.docs.find((d) => eq(d._id, id)); },
    find: jest.fn((f) => chain(() => m.docs.filter((d) => matches(d, f)).map(clone))),
    findOne: jest.fn((f) => chain(() => clone(m.docs.find((d) => matches(d, f)) || null))),
    findById: jest.fn((id) => chain(() => clone(m.get(id) || null))),
    findOneAndUpdate: jest.fn((f, u, opts = {}) => chain(() => {
      const d = m.docs.find((x) => matches(x, f));
      if (!d) {return null;}
      const before = clone(d);
      applyUpdate(d, u);
      return opts.new ? clone(d) : before;
    })),
    updateOne: jest.fn((f, u) => chain(() => {
      const d = m.docs.find((x) => matches(x, f));
      if (d) {applyUpdate(d, u);}
      return { modifiedCount: d ? 1 : 0 };
    })),
    updateMany: jest.fn((f, u) => chain(() => {
      const list = m.docs.filter((x) => matches(x, f));
      list.forEach((d) => applyUpdate(d, u));
      return { modifiedCount: list.length };
    })),
    create: jest.fn((d) => chain(() => {
      const doc = { _id: newId(), ...clone(d) };
      m.docs.push(doc);
      return clone(doc);
    })),
    insertMany: jest.fn((list) => chain(() => list.map((d) => { const doc = { _id: newId(), ...clone(d) }; m.docs.push(doc); return doc; }))),
    countDocuments: jest.fn((f) => chain(() => m.docs.filter((d) => matches(d, f)).length)),
    distinct: jest.fn(() => chain(() => [])),
    aggregate: jest.fn((pipeline) => chain(() => {
      const first = pipeline[0] && pipeline[0].$match;
      const skip = (pipeline.find((s) => s.$skip) || {}).$skip || 0;
      const limit = (pipeline.find((s) => s.$limit) || {}).$limit || Infinity;
      return m.docs.filter((d) => matches(d, first || {})).slice(skip, skip + limit).map(clone);
    })),
    collection: { name: 'x' },
  };
  return m;
}

/* ------------------------------- моки -------------------------------- */

jest.mock('../src/crm/models/CrmClient', () => mockFakeModel());
jest.mock('../src/crm/models/CrmOrder', () => mockFakeModel());
jest.mock('../src/crm/models/CrmBalanceOp', () => mockFakeModel());
jest.mock('../src/crm/models/CrmEvent', () => mockFakeModel());
jest.mock('../src/crm/models/CrmTask', () => mockFakeModel());
jest.mock('../src/crm/models/CrmSalesCard', () => mockFakeModel());
jest.mock('../src/crm/models/CrmThread', () => mockFakeModel());
jest.mock('../src/crm/models/CrmTgRequest', () => mockFakeModel());
jest.mock('../src/crm/models/CrmSend', () => mockFakeModel());
jest.mock('../src/crm/models/CrmMerge', () => mockFakeModel());
jest.mock('../src/models/User', () => mockFakeModel());
jest.mock('../src/crm/services/settings.service', () => ({
  getCrmSettings: jest.fn(() => Promise.resolve({ rates: {} })),
}));
jest.mock('../src/config/logger', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('../src/crm/services/access.service', () => ({
  applyClientOrders: jest.fn(),
  undoGrant: jest.fn(),
}));

const CrmClient = require('../src/crm/models/CrmClient');
const CrmOrder = require('../src/crm/models/CrmOrder');
const CrmBalanceOp = require('../src/crm/models/CrmBalanceOp');
const CrmEvent = require('../src/crm/models/CrmEvent');
const CrmTask = require('../src/crm/models/CrmTask');
const CrmMerge = require('../src/crm/models/CrmMerge');
const access = require('../src/crm/services/access.service');
const svc = require('../src/crm/services/client-merge.service');
const clientList = require('../src/crm/services/client-list.service');

const ALL = [CrmClient, CrmOrder, CrmBalanceOp, CrmEvent, CrmTask, CrmMerge,
  require('../src/crm/models/CrmSalesCard'), require('../src/crm/models/CrmThread'),
  require('../src/crm/models/CrmTgRequest'), require('../src/crm/models/CrmSend')];

const A = '64a000000000000000000001';
const B = '64a000000000000000000002';
const C = '64a000000000000000000003';
const D = '64a000000000000000000004';
const U1 = '64b0000000000000000000a1';
const U2 = '64b0000000000000000000a2';
const MEMBER = { id: '64c0000000000000000000f1', name: 'Тамуна', role: 'manager' };

const client = (over) => ({
  name: '', emails: [], primaryEmail: null, phone: null, phoneNorm: null, city: null, country: null,
  telegram: { username: null, chatId: null, botSubscribed: false }, whatsapp: false, appUserId: null,
  tags: [], comments: [], legacyMonths: [], balance: 0, mergedInto: null, ...over,
});

beforeEach(() => {
  ALL.forEach((m) => m.reset());
  jest.clearAllMocks();
  // Как B5/B6: связанной клиентке выдаются оплаченные невыданные заказы.
  access.applyClientOrders.mockImplementation(async (clientId) => {
    const c = CrmClient.get(clientId);
    if (!c || !c.appUserId) {return 0;}
    const list = CrmOrder.docs.filter((o) => eq(o.clientId, clientId) && o.status === 'paid' && !(o.granted && o.granted.at));
    list.forEach((o) => { o.granted = { at: new Date().toISOString(), subscriptionSet: { userId: c.appUserId } }; });
    return list.length;
  });
  access.undoGrant.mockImplementation(async (order) => {
    CrmOrder.get(order._id).granted = { at: null };
    return { action: 'revoked' };
  });
});

function seedPair() {
  CrmClient.seed([
    client({
      _id: A, name: 'Анна К.', primaryEmail: 'anna@gk.ru', emails: [{ email: 'anna@gk.ru', source: 'gk' }],
      phone: '+375 (29) 111-22-33', phoneNorm: '375291112233', tags: ['VIP'], balance: 10,
      comments: [{ _id: '64e000000000000000000001', text: 'Старая карточка', at: '2026-01-01' }],
      legacyMonths: ['2026-12'], city: 'Минск',
    }),
    client({
      _id: B, name: 'Анна Ковалёва', primaryEmail: 'anna@mail.by', emails: [{ email: 'anna@mail.by', source: 'site' }],
      phone: '375291112233', phoneNorm: '375291112233', tags: ['Акция'], balance: 5,
      telegram: { username: 'anna_k', chatId: null, botSubscribed: false },
    }),
    client({ _id: C, name: 'Другая', primaryEmail: 'other@x.ru', emails: [{ email: 'other@x.ru', source: 'gk' }] }),
  ]);
  CrmOrder.seed([
    { _id: '64f000000000000000000001', num: 1, clientId: A, status: 'paid', granted: { at: null }, gift: {} },
    { _id: '64f000000000000000000002', num: 2, clientId: A, status: 'new', granted: { at: null }, gift: {} },
    { _id: '64f000000000000000000003', num: 3, clientId: C, status: 'paid', granted: { at: null }, gift: { recipientClientId: A } },
    { _id: '64f000000000000000000004', num: 4, clientId: B, status: 'paid', granted: { at: null }, gift: {} },
  ]);
  CrmBalanceOp.seed([{ clientId: A, amount: 10, reason: 'Депозит' }, { clientId: B, amount: 5, reason: 'Акция' }]);
  CrmEvent.seed([{ clientId: A, text: 'Заказ №1 создан', who: 'Сайт' }]);
  CrmTask.seed([{ clientId: A, type: 'call', title: 'Позвонить' }]);
}

/* ------------------------------- поиск -------------------------------- */

describe('поиск дублей', () => {
  test('по телефону и по общей почте, связной группой; объединённые не считаются', async () => {
    CrmClient.seed([
      client({ _id: A, name: 'А', phoneNorm: '375291112233', primaryEmail: 'a@x.ru' }),
      client({ _id: B, name: 'Б', phoneNorm: '375291112233', emails: [{ email: 'b@x.ru', source: 'gk' }] }),
      // Общая почта с Б (в emails у одной, primaryEmail у другой) — та же группа.
      client({ _id: C, name: 'В', primaryEmail: 'B@x.ru' }),
      client({ _id: D, name: 'Г', primaryEmail: 'a@x.ru', mergedInto: A }),
      client({ name: 'Короткий телефон 1', phoneNorm: '123' }),
      client({ name: 'Короткий телефон 2', phoneNorm: '123' }),
    ]);
    const r = await svc.findDuplicates({ page: 1, limit: 20 });
    expect(r.total).toBe(1);
    const g = r.items[0];
    expect(g.clients.map((c) => c.id).sort()).toEqual([A, B, C]);
    expect(g.reasons).toEqual(expect.arrayContaining([
      { type: 'phone', value: '375291112233' },
      { type: 'email', value: 'b@x.ru' },
    ]));
  });

  test('дубли одной карточки — с причиной и количеством заказов', async () => {
    seedPair();
    const r = await svc.duplicatesOf(A);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: B, reasons: ['phone'], orders: 1, email: 'anna@mail.by' });
    const none = await svc.duplicatesOf(C);
    expect(none.items).toEqual([]);
  });

  test('по почте без телефона', async () => {
    CrmClient.seed([
      client({ _id: A, emails: [{ email: 'x@y.ru', source: 'gk' }] }),
      client({ _id: B, emails: [{ email: 'x@y.ru', source: 'app' }] }),
    ]);
    const r = await svc.duplicatesOf(A);
    expect(r.items.map((c) => [c.id, c.reasons])).toEqual([[B, ['email']]]);
  });
});

/* ---------------------------- объединение ----------------------------- */

describe('объединение', () => {
  test('переносит заказы, баланс, теги, комментарии, почты; пустые поля заполняются', async () => {
    seedPair();
    const r = await svc.merge(A, B, MEMBER);
    expect(r).toMatchObject({ fromId: A, intoId: B, balance: 10, linkMoved: false, emails: ['anna@gk.ru'] });
    expect(r.moved.orders).toBe(3);

    expect(CrmOrder.get('64f000000000000000000001').clientId).toBe(B);
    expect(CrmOrder.get('64f000000000000000000002').clientId).toBe(B);
    expect(CrmOrder.get('64f000000000000000000003').gift.recipientClientId).toBe(B);
    expect(CrmOrder.get('64f000000000000000000003').clientId).toBe(C);
    expect(CrmBalanceOp.docs.every((o) => o.clientId === B)).toBe(true);
    expect(CrmTask.docs[0].clientId).toBe(B);

    const into = CrmClient.get(B);
    const from = CrmClient.get(A);
    expect(into.balance).toBe(15);
    expect(from.balance).toBe(0);
    expect(from.mergedInto).toBe(B);
    expect(into.tags.sort()).toEqual(['VIP', 'Акция']);
    expect(into.comments.map((c) => c.text)).toEqual(['Старая карточка']);
    expect(into.emails).toEqual([
      { email: 'anna@mail.by', source: 'site' },
      { email: 'anna@gk.ru', source: 'gk' },
    ]);
    expect(into.legacyMonths).toEqual(['2026-12']);
    expect(into.city).toBe('Минск');
    // Не пустые у intoId — не трогаем.
    expect(into.phone).toBe('375291112233');
    expect(into.primaryEmail).toBe('anna@mail.by');
    expect(into.telegram.username).toBe('anna_k');
    // Не связана с приложением — ничего не выдаём.
    expect(access.applyClientOrders).not.toHaveBeenCalled();

    // История — в обеих карточках.
    const texts = (id) => CrmEvent.docs.filter((e) => e.clientId === id && e.type === 'merge').map((e) => e.text);
    expect(texts(B)[0]).toMatch(/Объединена с дублем «Анна К\.» \(anna@gk\.ru\)\. Перенесено заказов: 3, баланс 10 BYN/);
    expect(texts(A)[0]).toMatch(/Объединена с карточкой «Анна Ковалёва»/);
    expect(CrmEvent.docs.find((e) => e.text === 'Заказ №1 создан').clientId).toBe(B);
    expect(CrmMerge.docs).toHaveLength(1);
  });

  test('объединённая карточка пропадает из списков и поиска дублей', async () => {
    seedPair();
    await svc.merge(A, B, MEMBER);
    const list = await clientList.listClients({}, new Date(2026, 10, 19));
    expect(list.items.map((x) => x.id).sort()).toEqual([B, C]);
    expect(list.total).toBe(2);
    expect((await svc.findDuplicates()).total).toBe(0);
    expect((await svc.duplicatesOf(B)).items).toEqual([]);
  });

  test('у обеих разные аккаунты приложения — отказ, ничего не меняется', async () => {
    seedPair();
    CrmClient.get(A).appUserId = U1;
    CrmClient.get(B).appUserId = U2;
    await expect(svc.merge(A, B, MEMBER)).rejects.toMatchObject({ statusCode: 409 });
    expect(CrmClient.get(A).mergedInto).toBeNull();
    expect(CrmOrder.get('64f000000000000000000001').clientId).toBe(A);
    expect(CrmClient.get(B).balance).toBe(5);
  });

  test('связь только у дубля — переходит на оставшуюся карточку, оплаченное выдаётся', async () => {
    seedPair();
    CrmClient.get(A).appUserId = U1;
    const r = await svc.merge(A, B, MEMBER);
    expect(r.linkMoved).toBe(true);
    expect(CrmClient.get(B).appUserId).toBe(U1);
    expect(CrmClient.get(A).appUserId).toBeNull();
    expect(access.applyClientOrders).toHaveBeenCalledWith(B, { who: 'Тамуна' });
    // Заказы 1 (перенесён) и 4 (свой у B) оплачены — выданы.
    expect(r.applied).toBe(2);
    expect(CrmMerge.docs[0].grantedOrderIds.sort()).toEqual(['64f000000000000000000001', '64f000000000000000000004']);
  });

  test('нельзя саму с собой и уже объединённую', async () => {
    seedPair();
    await expect(svc.merge(A, A, MEMBER)).rejects.toMatchObject({ statusCode: 400 });
    await svc.merge(A, B, MEMBER);
    await expect(svc.merge(A, C, MEMBER)).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.merge(C, A, MEMBER)).rejects.toMatchObject({ statusCode: 409 });
  });
});

/* ------------------------------- отмена ------------------------------- */

describe('отмена объединения', () => {
  test('возвращает всё как было', async () => {
    seedPair();
    const before = { a: clone(CrmClient.get(A)), b: clone(CrmClient.get(B)) };
    CrmClient.get(A).appUserId = U1;
    before.a.appUserId = U1;
    const r = await svc.merge(A, B, MEMBER);
    const u = await svc.undoMerge(r.mergeId, MEMBER);
    expect(u).toMatchObject({ fromId: A, intoId: B, revoked: 2 });
    expect(access.undoGrant).toHaveBeenCalledTimes(2);

    const a = CrmClient.get(A);
    const b = CrmClient.get(B);
    expect(a.mergedInto).toBeNull();
    expect(a.appUserId).toBe(U1);
    expect(a.balance).toBe(10);
    expect(b.appUserId).toBeNull();
    expect(b.balance).toBe(5);
    expect(b.tags).toEqual(before.b.tags);
    expect(b.emails).toEqual(before.b.emails);
    expect(b.comments).toEqual([]);
    expect(b.legacyMonths).toEqual([]);
    expect(b.city).toBeNull();
    expect(CrmOrder.get('64f000000000000000000001').clientId).toBe(A);
    expect(CrmOrder.get('64f000000000000000000003').gift.recipientClientId).toBe(A);
    expect(CrmOrder.get('64f000000000000000000004').granted.at).toBeNull();
    expect(CrmBalanceOp.docs.find((o) => o.amount === 10).clientId).toBe(A);
    expect(CrmEvent.docs.find((e) => e.text === 'Заказ №1 создан').clientId).toBe(A);
    expect(CrmEvent.docs.filter((e) => /отменено/.test(e.text)).map((e) => e.clientId).sort()).toEqual([A, B]);

    await expect(svc.undoMerge(r.mergeId, MEMBER)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('отказ: прошло больше 30 минут, заказ изменился, баланс потрачен', async () => {
    seedPair();
    const r = await svc.merge(A, B, MEMBER);
    const late = new Date(Date.now() + svc.UNDO_MS + 1000);
    await expect(svc.undoMerge(r.mergeId, MEMBER, late)).rejects.toMatchObject({ statusCode: 409 });

    CrmOrder.get('64f000000000000000000002').status = 'paid';
    await expect(svc.undoMerge(r.mergeId, MEMBER)).rejects.toThrow(/заказы изменились/);
    CrmOrder.get('64f000000000000000000002').status = 'new';

    CrmClient.get(B).balance = 3;
    await expect(svc.undoMerge(r.mergeId, MEMBER)).rejects.toThrow(/Баланс/);
    CrmClient.get(B).balance = 15;

    await svc.undoMerge(r.mergeId, MEMBER);
    expect(CrmClient.get(A).mergedInto).toBeNull();
  });
});

/* -------------------------------- роуты ------------------------------- */

describe('роуты', () => {
  test('маршруты дублей объявлены до /:id', () => {
    const router = require('../src/crm/routes/clients');
    const routes = router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
    const idx = (r) => routes.indexOf(r);
    expect(idx('get /duplicates')).toBeGreaterThan(-1);
    expect(idx('get /duplicates')).toBeLessThan(idx('get /:id'));
    expect(idx('post /merge/:mergeId/undo')).toBeGreaterThan(-1);
    expect(idx('post /:id/merge')).toBeGreaterThan(-1);
    expect(idx('get /:id/duplicates')).toBeGreaterThan(-1);
  });
});
