const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { success, paginated } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Book = require('../models/Book');
const User = require('../models/User');
const ClubMonth = require('../models/ClubMonth');
const Package = require('../models/Package');
const {
  archiveWindowEnd,
  coveredClubMonthKeys,
  clubMonthKey,
} = require('../middleware/subscription');
const { generateSignedUrl } = require('../services/audio.service');

const router = Router();

/**
 * GET /api/books
 * MASTER 7.4: список всех книг (с пагинацией, фильтрами)
 * Query: ?category=&isFree=&page=&limit=
 *
 * Примечание: ?category=КРИЗИСЫ матчится против массива Book.categories
 * (одна книга может быть в нескольких категориях — см. AI-CONTEXT РАСХОЖДЕНИЯ).
 */
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { isPublished: true };
    if (req.query.category) {
      filter.categories = req.query.category;
    }
    if (req.query.isFree !== undefined) {
      filter.isFree = req.query.isFree === 'true';
    }

    const [books, total] = await Promise.all([
      Book.find(filter)
        .select('-parts.audioFilename')
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Book.countDocuments(filter),
    ]);

    return paginated(res, { items: books, total, page, limit });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/featured
 * MASTER 7.4: рекомендованные для главной
 */
router.get('/featured', async (_req, res, next) => {
  try {
    const freeBooks = await Book.find({ isPublished: true, isFree: true })
      .select('-parts.audioFilename')
      .sort({ publishedAt: -1 })
      .limit(6)
      .lean();

    const popularBooks = await Book.find({ isPublished: true, isFree: false, isPartOfClub: false })
      .select('-parts.audioFilename')
      .sort({ rating: -1, reviewCount: -1 })
      .limit(6)
      .lean();

    return success(res, { freeBooks, popularBooks });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/search
 * MASTER 4.11: поиск по названию/автору в реальном времени.
 * Query: ?q=
 */
router.get('/search', async (req, res, next) => {
  try {
    const query = req.query.q;
    if (!query || query.trim().length === 0) {
      return success(res, { books: [] });
    }

    // Поиск по подстроке (регистронезависимо) по названию и автору.
    // MASTER 4.11 требует результаты «в реальном времени» по мере ввода —
    // MongoDB $text матчит только целые слова, поэтому здесь regex-substring
    // (каталог небольшой, это дёшево). Ввод экранируется от regex-инъекций.
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');

    const books = await Book.find({
      isPublished: true,
      $or: [{ title: rx }, { author: rx }],
    })
      .select('-parts.audioFilename')
      .limit(20)
      .lean();

    return success(res, { books });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/:id
 * MASTER 7.4: детальная информация о книге.
 *
 * optionalAuth: если юзер авторизован — в объект книги добавляется
 * ВЫЧИСЛЯЕМОЕ поле hasAccess (true = полный доступ: куплена отдельно /
 * бесплатная / открыта подпиской как книга клуба в календарном окне /
 * админ). Клиент (book_screen) по нему решает «Слушать» vs «Купить».
 * Без авторизации hasAccess = isFree.
 */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const book = await Book.findOne({
      _id: req.params.id,
      isPublished: true,
    })
      .select('-parts.audioFilename')
      .lean();

    if (!book) {
      throw new AppError('BOOK_NOT_FOUND', 'Разбор не найден', 404);
    }

    let hasAccess = !!book.isFree;
    if (!hasAccess && req.user && req.user.userId) {
      const user = await User.findById(req.user.userId).lean();
      if (user) {
        hasAccess = await userHasBookAccess(book, user);
      }
    }

    return success(res, { book: { ...book, hasAccess } });
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/books/:id/audio/:partNumber
 * Возвращает SIGNED URL для проигрывания аудио (задача 2.3).
 * URL действует AUDIO_URL_TTL_SECONDS (по умолчанию 1 час).
 *
 * Доступ:
 * - Бесплатная книга — без авторизации, любой может слушать
 * - Платная часть с isPreviewAvailable: true — без авторизации (5-минутное превью)
 * - Платная часть без превью — нужна авторизация + доступ по userHasBookAccess
 *   (куплена / книга клуба по подписке в календарном окне / админ)
 */
router.get('/:id/audio/:partNumber', optionalAuth, async (req, res, next) => {
  try {
    const book = await Book.findOne({
      _id: req.params.id,
      isPublished: true,
    }).lean();

    if (!book) {
      throw new AppError('BOOK_NOT_FOUND', 'Разбор не найден', 404);
    }

    const partNumber = parseInt(req.params.partNumber, 10);
    const part = book.parts.find((p) => p.number === partNumber);

    if (!part || !part.audioFilename) {
      throw new AppError('NOT_FOUND', 'Часть не найдена или аудио не загружено', 404);
    }

    // Проверка доступа
    const isAccessible = await checkPartAccess(book, part, req.user);
    if (!isAccessible) {
      throw new AppError('PURCHASE_REQUIRED', 'Контент платный, не куплен', 403);
    }

    // Генерируем signed URL
    const audioUrl = generateSignedUrl(part.audioFilename);

    return success(res, {
      audioUrl,
      duration: part.duration,
      partNumber: part.number,
      title: part.title,
      isPreview: !!part.isPreviewAvailable && !book.isFree,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * Проверка доступа к части аудиоразбора.
 * Возвращает true если можно проигрывать, false если нужна покупка/подписка.
 */
async function checkPartAccess(book, part, userPayload) {
  // Бесплатная книга — всем
  if (book.isFree) return true;

  // Превью платной части (1-я часть платной книги) — всем
  if (part.isPreviewAvailable) return true;

  // Дальше нужна авторизация
  if (!userPayload) return false;

  // Загружаем юзера для проверки покупок/подписки
  const user = await User.findById(userPayload.userId).lean();
  if (!user) return false;

  return userHasBookAccess(book, user);
}

/**
 * Полный доступ юзера к платной книге (без учёта isFree и превью — их
 * проверяют вызывающие).
 *
 * МОДЕЛЬ ДОСТУПА (пересмотрена 30.07.2026 — ПРИВЯЗКА К ОПЛАЧЕННОМУ МЕСЯЦУ,
 * та же что у клуба, см. resolveClubAccess в middleware/subscription.js):
 * 1. Книга куплена отдельно (purchasedBooks) → доступ.
 * 2. Книга входит в купленный пакет (purchasedPackages) → доступ.
 * 3. Админ (Анна) → доступ ко всему.
 * 4. Активная подписка (basic/premium, не истекла ЛИБО grace period)
 *    открывает книгу клуба, ТОЛЬКО если этот клуб входит в оплаченный набор
 *    месяцев (coveredClubMonthKeys) и сейчас его месяц, ЛИБО клуб в архивном
 *    окне (следующий месяц) — тогда бывший подписчик дослушивает прошлый клуб.
 *    Пример: месячный подписчик слушает клуб своего оплаченного месяца; клуб
 *    следующего месяца подписка НЕ открывает, пока не продлит (чтобы оплата
 *    Apple с 5 числа не давала бесплатно клуб, стартовавший 1 числа).
 *    Сезон оплачивает 3 клуба вперёд — все они в наборе.
 * 5. Остальной каталог подписка НЕ открывает — только за отдельную плату.
 *
 * Архивное окно считается через archiveWindowEnd — единая функция с логикой
 * клуба, чтобы доступ к аудио и доступ к чату клуба не расходились.
 */
async function userHasBookAccess(book, user) {
  // Куплена ли книга отдельно
  const hasPurchased = user.purchasedBooks && user.purchasedBooks.some(
    (id) => id.toString() === book._id.toString()
  );
  if (hasPurchased) return true;

  // Книга входит в купленный пакет (Non-Consumable IAP на пакет).
  // purchasedPackages заполняется в purchase.service.js при покупке package.{slug}.
  if (user.purchasedPackages && user.purchasedPackages.length > 0) {
    const inOwnedPackage = await Package.exists({
      _id: { $in: user.purchasedPackages },
      books: book._id,
    });
    if (inOwnedPackage) return true;
  }

  // Админ — доступ ко всему
  if (user.role === 'admin') return true;

  // Активная подписка (учитываем истечение и grace period)
  const now = new Date();
  const isInGrace =
    user.gracePeriodExpiresAt && user.gracePeriodExpiresAt > now;
  const hasActiveSub =
    (user.subscriptionStatus === 'basic' ||
      user.subscriptionStatus === 'premium') &&
    ((user.subscriptionExpiresAt && user.subscriptionExpiresAt > now) ||
      isInGrace);
  if (!hasActiveSub) return false;

  // Оплаченный набор клубных месяцев текущего периода подписки.
  const coveredKeys = coveredClubMonthKeys(
    user.subscriptionExpiresAt,
    user.subscriptionPlan
  );

  // Подписка открывает книгу, только если она — книга клуба, и либо этот клуб
  // в оплаченном наборе и сейчас его месяц, либо клуб в архивном окне
  // (следующий месяц) — дослушать прошлый оплаченный клуб.
  const clubs = await ClubMonth.find({ bookId: book._id })
    .select('startsAt endsAt month year')
    .lean();

  return clubs.some((club) => {
    const isCurrent = club.startsAt <= now && now <= club.endsAt;
    if (isCurrent) return coveredKeys.has(clubMonthKey(club));
    const inArchive = club.endsAt < now && now <= archiveWindowEnd(club.endsAt);
    if (inArchive) return true; // hasActiveSub уже проверен — был подписчиком
    return false; // будущий клуб аудио не открывает (даже сезон — до старта месяца)
  });
}

module.exports = router;
