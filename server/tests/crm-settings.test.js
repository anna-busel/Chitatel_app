/**
 * CRM: начальные настройки (A7) и счётчик номеров заказов (A1).
 * БД не нужна: методы моделей подменены.
 */

const CrmSettings = require('../src/crm/models/CrmSettings');
const CrmCounter = require('../src/crm/models/CrmCounter');
const { ensureCrmSettings, DEFAULTS } = require('../src/crm/services/settings.service');

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ensureCrmSettings', () => {
  test('создаёт документ только при отсутствии ($setOnInsert, upsert)', async () => {
    const spy = jest.spyOn(CrmSettings, 'findOneAndUpdate').mockReturnValue({
      lean: () => Promise.resolve({ key: 'main', ...DEFAULTS }),
    });

    const doc = await ensureCrmSettings();

    expect(spy).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = spy.mock.calls[0];
    expect(filter).toEqual({ key: 'main' });
    expect(Object.keys(update)).toEqual(['$setOnInsert']);
    expect(opts).toMatchObject({ upsert: true });
    expect(doc.key).toBe('main');
  });

  test('начальные значения: подтверждение переводов выкл, карт нет, курсы не заданы', () => {
    expect(DEFAULTS.requireTransferConfirm).toBe(false);
    expect(DEFAULTS.accounts).toEqual([]);
    expect(DEFAULTS.rates).toEqual({ USD: null, RUB: null, EUR: null, GEL: null });
  });

  test('схема по умолчанию совпадает с начальными значениями', () => {
    const doc = new CrmSettings();
    expect(doc.key).toBe('main');
    expect(doc.requireTransferConfirm).toBe(false);
    expect(doc.accounts.toObject()).toEqual([]);
    expect(doc.storeFeePct).toBe(15);
  });
});

describe('CrmCounter', () => {
  test('nextOrderNum — атомарный $inc с upsert', async () => {
    const spy = jest.spyOn(CrmCounter, 'findOneAndUpdate').mockReturnValue({
      lean: () => Promise.resolve({ _id: 'order', seq: 15001 }),
    });
    await expect(CrmCounter.nextOrderNum()).resolves.toBe(15001);
    expect(spy).toHaveBeenCalledWith(
      { _id: 'order' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
  });

  test('setOrderNumAtLeast не опускает счётчик ($max)', async () => {
    const spy = jest.spyOn(CrmCounter, 'updateOne').mockResolvedValue({});
    await CrmCounter.setOrderNumAtLeast(15000);
    expect(spy).toHaveBeenCalledWith(
      { _id: 'order' },
      { $max: { seq: 15000 } },
      { upsert: true }
    );
  });
});

describe('схемы CRM загружаются и валидируются без БД', () => {
  test('все модели раздела 2 подключаются', () => {
    const names = [
      'CrmClient', 'CrmEvent', 'CrmProduct', 'CrmOrder', 'CrmBalanceOp', 'CrmPromo',
      'CrmTask', 'CrmSalesCard', 'CrmSegment', 'CrmCampaign', 'CrmSend', 'CrmAuto',
      'CrmThread', 'CrmTgChannel', 'CrmTgRequest', 'CrmMember', 'CrmAudit',
      'CrmSettings', 'CrmCounter',
    ];
    for (const n of names) {
      // eslint-disable-next-line global-require
      const M = require(`../src/crm/models/${n}`);
      expect(M.modelName).toBe(n);
    }
  });

  test('заказ: неизвестный статус не проходит валидацию', () => {
    const CrmOrder = require('../src/crm/models/CrmOrder');
    const o = new CrmOrder({ num: 1, clientId: '64a000000000000000000001', status: 'overdue' });
    const err = o.validateSync();
    expect(err.errors.status).toBeDefined();
  });

  test('уникальные индексы: номер заказа, slug продукта, почта участницы', () => {
    const CrmOrder = require('../src/crm/models/CrmOrder');
    const CrmProduct = require('../src/crm/models/CrmProduct');
    const CrmMember = require('../src/crm/models/CrmMember');
    const hasUnique = (M, field) =>
      M.schema.indexes().some(([keys, opts]) => keys[field] === 1 && opts && opts.unique);
    expect(hasUnique(CrmOrder, 'num')).toBe(true);
    expect(hasUnique(CrmProduct, 'slug')).toBe(true);
    expect(hasUnique(CrmMember, 'email')).toBe(true);
  });
});
