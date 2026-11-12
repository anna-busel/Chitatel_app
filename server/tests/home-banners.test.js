/**
 * Баннеры на главной (UPDATES-PLAN T, 05.11.2026).
 *
 * Проверяем listActiveBanners (services/home-banner.service) и
 * GET /api/home/banners:
 * - показ только при startsAt <= now < endsAt и isActive;
 * - платформа: по умолчанию только iOS, android — если отмечен;
 * - без платформы (старые клиенты) — пусто, в БД не ходим;
 * - сортировка по order;
 * - действия: снятый с публикации разбор → none, подборка — только
 *   опубликованные в заданном порядке.
 *
 * БД не нужна: модели подменены jest.mock.
 */

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../src/models/HomeBanner', () => ({ find: jest.fn() }));
jest.mock('../src/models/Book', () => ({ find: jest.fn() }));
jest.mock('../src/models/Package', () => ({ find: jest.fn() }));
jest.mock('../src/services/image.service', () => ({
  generateImageSignedUrl: (p) => `https://test/images/${p}?sig=x`,
}));

const HomeBanner = require('../src/models/HomeBanner');
const Book = require('../src/models/Book');
const Package = require('../src/models/Package');
const {
  listActiveBanners,
  normalizePlatform,
} = require('../src/services/home-banner.service');

const NOW = new Date('2026-11-14T12:00:00Z');
const B1 = '64b000000000000000000001';
const B2 = '64b000000000000000000002';
const B3 = '64b000000000000000000003';

function banner(id, extra = {}) {
  return {
    _id: id,
    imageStoragePath: `home-banners/${id}.jpg`,
    startsAt: new Date('2026-11-13T00:00:00Z'),
    endsAt: new Date('2026-11-19T00:00:00Z'),
    platforms: ['ios'],
    action: { kind: 'none' },
    order: 0,
    isActive: true,
    createdAt: new Date('2026-11-05T00:00:00Z'),
    ...extra,
  };
}

function mockBanners(list) {
  HomeBanner.find.mockReturnValue({ lean: async () => list });
}
function mockBooks(list) {
  Book.find.mockReturnValue({ select: () => ({ lean: async () => list }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBooks([]);
});

describe('normalizePlatform', () => {
  test('ios/android, регистр не важен, остальное — null', () => {
    expect(normalizePlatform('ios')).toBe('ios');
    expect(normalizePlatform('Android')).toBe('android');
    expect(normalizePlatform('')).toBeNull();
    expect(normalizePlatform(undefined)).toBeNull();
    expect(normalizePlatform('web')).toBeNull();
  });
});

describe('listActiveBanners', () => {
  test('без платформы — пусто, в БД не ходим', async () => {
    mockBanners([banner('a')]);
    expect(await listActiveBanners(undefined, { now: NOW })).toEqual([]);
    expect(await listActiveBanners('web', { now: NOW })).toEqual([]);
    expect(HomeBanner.find).not.toHaveBeenCalled();
  });

  test('фильтр по датам: начало включительно, конец не включительно', async () => {
    mockBanners([
      banner('current'),
      banner('future', { startsAt: new Date('2026-11-15T00:00:00Z') }),
      banner('past', { endsAt: new Date('2026-11-14T00:00:00Z') }),
      banner('startsNow', { startsAt: NOW }),
      banner('endsNow', { endsAt: NOW }),
      banner('off', { isActive: false }),
    ]);
    const items = await listActiveBanners('ios', { now: NOW });
    expect(items.map((i) => i.id)).toEqual(['current', 'startsNow']);
    expect(HomeBanner.find.mock.calls[0][0]).toEqual({
      isActive: true,
      platforms: 'ios',
      endsAt: { $gt: NOW },
    });
  });

  test('фильтр по платформе: по умолчанию только iPhone', async () => {
    const list = [
      banner('iosOnly'),
      banner('both', { platforms: ['ios', 'android'] }),
      banner('androidOnly', { platforms: ['android'] }),
      banner('noPlatforms', { platforms: [] }),
    ];
    mockBanners(list);
    expect((await listActiveBanners('ios', { now: NOW })).map((i) => i.id)).toEqual([
      'iosOnly',
      'both',
      'noPlatforms',
    ]);
    mockBanners(list);
    expect((await listActiveBanners('android', { now: NOW })).map((i) => i.id)).toEqual([
      'both',
      'androidOnly',
    ]);
  });

  test('сортировка по order, при равном — по дате создания', async () => {
    mockBanners([
      banner('c', { order: 3 }),
      banner('a2', { order: 1, createdAt: new Date('2026-11-06T00:00:00Z') }),
      banner('b', { order: 2 }),
      banner('a1', { order: 1, createdAt: new Date('2026-11-01T00:00:00Z') }),
    ]);
    const items = await listActiveBanners('ios', { now: NOW });
    expect(items.map((i) => i.id)).toEqual(['a1', 'a2', 'b', 'c']);
  });

  test('ответ: подписанная ссылка на картинку и действие', async () => {
    mockBanners([banner('x')]);
    const [item] = await listActiveBanners('ios', { now: NOW });
    expect(item).toEqual({
      id: 'x',
      imageUrl: 'https://test/images/home-banners/x.jpg?sig=x',
      action: { kind: 'none' },
      showInCatalog: false,
    });
    expect(Book.find).not.toHaveBeenCalled();
  });

  test('действия: разбор и подборка — только опубликованные, порядок подборки сохраняется', async () => {
    mockBanners([
      banner('one', { order: 1, action: { kind: 'book', bookId: B1 } }),
      banner('hidden', { order: 2, action: { kind: 'book', bookId: B3 } }),
      banner('list', {
        order: 3,
        action: { kind: 'books', bookIds: [B2, B3, B1], listTitle: 'Чёрная пятница' },
      }),
    ]);
    // B3 не опубликован — Book.find его не вернёт.
    mockBooks([
      { _id: B1, title: 'Первая' },
      { _id: B2, title: 'Вторая' },
    ]);
    const items = await listActiveBanners('ios', { now: NOW });

    expect(Book.find.mock.calls[0][0]).toEqual({
      _id: { $in: [B1, B3, B2] },
      isPublished: true,
    });
    expect(items[0].action).toEqual({ kind: 'book', bookId: B1 });
    expect(items[1].action).toEqual({ kind: 'none' });
    expect(items[2].action.kind).toBe('books');
    expect(items[2].action.listTitle).toBe('Чёрная пятница');
    expect(items[2].action.books.map((b) => b.title)).toEqual(['Вторая', 'Первая']);
  });

  test('markOwned применяется к разборам подборки', async () => {
    mockBanners([banner('list', { action: { kind: 'books', bookIds: [B1], listTitle: 'T' } })]);
    mockBooks([{ _id: B1, title: 'Первая' }]);
    const items = await listActiveBanners('ios', {
      now: NOW,
      markOwned: async (books) => books.map((b) => ({ ...b, isOwned: true })),
    });
    expect(items[0].action.books[0].isOwned).toBe(true);
  });

  test('пустая подборка (все сняты) → none', async () => {
    mockBanners([banner('list', { action: { kind: 'books', bookIds: [B3], listTitle: 'T' } })]);
    mockBooks([]);
    const items = await listActiveBanners('ios', { now: NOW });
    expect(items[0].action).toEqual({ kind: 'none' });
  });

  // 1.0.5 (12.11.2026): пакеты в подборке и вкладка каталога.
  test('подборка с пакетами: только опубликованные, без дублей; showInCatalog только у подборки', async () => {
    const P1 = '64c000000000000000000001';
    const P2 = '64c000000000000000000002';
    mockBanners([
      banner('bf', {
        showInCatalog: true,
        action: { kind: 'books', bookIds: [B1], packageIds: [P1, P2, P1], listTitle: 'Чёрная пятница' },
      }),
      banner('one', { order: 1, showInCatalog: true, action: { kind: 'book', bookId: B1 } }),
    ]);
    mockBooks([{ _id: B1, title: 'Первая' }]);
    // P2 не опубликован.
    Package.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: P1 }] }) });
    const items = await listActiveBanners('ios', { now: NOW });

    expect(Package.find.mock.calls[0][0]).toEqual({ _id: { $in: [P1, P2] }, isPublished: true });
    expect(items[0].action.packageIds).toEqual([P1]);
    expect(items[0].action.books.map((b) => b.title)).toEqual(['Первая']);
    expect(items[0].showInCatalog).toBe(true);
    expect(items[1].showInCatalog).toBe(false);
  });

  test('подборка только из пакетов — books пустой, но подборка есть; без пакетов в БД не ходим', async () => {
    const P1 = '64c000000000000000000001';
    mockBanners([banner('pk', { action: { kind: 'books', bookIds: [], packageIds: [P1], listTitle: 'T' } })]);
    mockBooks([]);
    Package.find.mockReturnValue({ select: () => ({ lean: async () => [{ _id: P1 }] }) });
    const items = await listActiveBanners('ios', { now: NOW });
    expect(items[0].action).toEqual({ kind: 'books', listTitle: 'T', books: [], packageIds: [P1] });
    expect(items[0].showInCatalog).toBe(false);

    Package.find.mockClear();
    mockBanners([banner('b', { action: { kind: 'books', bookIds: [B1], listTitle: 'T' } })]);
    mockBooks([{ _id: B1, title: 'Первая' }]);
    await listActiveBanners('ios', { now: NOW });
    expect(Package.find).not.toHaveBeenCalled();
  });
});
