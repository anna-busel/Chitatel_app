const { Router } = require('express');
const { z } = require('zod');
const mongoose = require('mongoose');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin, archiveWindowEnd } = require('../middleware/subscription');
const { success } = require('../utils/response');
const { AppError } = require('../middleware/error');
const Book = require('../models/Book');
const ClubMonth = require('../models/ClubMonth');

const router = Router();

// Управление клубом месяца — только админ.
router.use(requireAuth, requireAdmin);

/* ------------------------------------------------------------------ *
 *                          ХЕЛПЕРЫ                                   *
 * ------------------------------------------------------------------ */

// 'YYYY-MM' (padded) — формат Book.clubMonth (см. модель Book, '2026-03').
function clubMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// Активность клуба ОПРЕДЕЛЯЕТСЯ ДАТАМИ, а не флагом: приложение (routes/club.js)
// ищет текущий клуб по startsAt <= now <= endsAt. Поле isActive — вторичное,
// держим его в синхроне с датами, чтобы админка/статистика не врали.
function computeIsActive(startsAt, endsAt) {
  const now = Date.now();
  return startsAt.getTime() <= now && now <= endsAt.getTime();
}

function serializeClub(club, book) {
  return {
    id: String(club._id),
    month: club.month,
    year: club.year,
    bookId: String(club.bookId),
    bookTitle: book ? book.title : club.title,
    bookSlug: book ? book.bookSlug : '',
    title: club.title,
    author: club.author,
    startsAt: club.startsAt,
    endsAt: club.endsAt,
    archiveUntilDate: club.archiveUntilDate,
    isActive: club.isActive,
    participantCount: club.participantCount,
    messageCount: club.messageCount,
    partSchedule: (club.partSchedule || []).map((p) => ({
      partNumber: p.partNumber,
      opensAt: p.opensAt,
    })),
  };
}

/**
 * Проставить/снять обратную связь на книге (Book.isPartOfClub / clubMonth).
 * Книга-разбор клуба исключается из списков «популярное/бесплатное» именно
 * по isPartOfClub (см. books.js, home.js).
 */
async function markBookInClub(bookId, year, month) {
  await Book.updateOne(
    { _id: bookId },
    { $set: { isPartOfClub: true, clubMonth: clubMonthKey(year, month) } }
  );
}

async function unmarkBookIfUnused(bookId, exceptClubId) {
  const stillUsed = await ClubMonth.exists({
    bookId,
    _id: { $ne: exceptClubId },
  });
  if (!stillUsed) {
    await Book.updateOne(
      { _id: bookId },
      { $set: { isPartOfClub: false, clubMonth: null } }
    );
  }
}

/* ------------------------------------------------------------------ *
 *                          СПИСОК КЛУБОВ                             *
 * ------------------------------------------------------------------ */
// GET /api/admin/club — все клубы (новые сверху).
router.get('/', async (_req, res, next) => {
  try {
    const clubs = await ClubMonth.find().sort({ startsAt: -1 }).lean();
    const bookIds = clubs.map((c) => c.bookId);
    const books = await Book.find({ _id: { $in: bookIds } })
      .select('title bookSlug')
      .lean();
    const bookById = new Map(books.map((b) => [String(b._id), b]));

    const items = clubs.map((c) =>
      serializeClub(c, bookById.get(String(c.bookId)))
    );
    return success(res, { items, total: items.length });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                           ОДИН КЛУБ                                *
 * ------------------------------------------------------------------ */
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
    }
    const club = await ClubMonth.findById(req.params.id).lean();
    if (!club) {
      throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
    }
    const book = await Book.findById(club.bookId)
      .select('title bookSlug')
      .lean();
    return success(res, { club: serializeClub(club, book) });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                         СОЗДАНИЕ КЛУБА                             *
 * ------------------------------------------------------------------ */
const partScheduleItemSchema = z.object({
  partNumber: z.coerce.number().int().min(1).max(50),
  opensAt: z.coerce.date(),
});

const clubSchema = z.object({
  bookId: z.string().refine((s) => mongoose.Types.ObjectId.isValid(s), {
    message: 'bookId должен быть валидным ObjectId',
  }),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2024).max(2100).optional(),
  partSchedule: z.array(partScheduleItemSchema).max(50).default([]),
});

router.post('/', validate(clubSchema), async (req, res, next) => {
  try {
    const data = req.body;
    if (data.endsAt <= data.startsAt) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Дата окончания должна быть позже даты начала',
        400
      );
    }

    const book = await Book.findById(data.bookId);
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор для клуба не найден', 404);
    }

    // month/year: из payload или выводим из startsAt (UTC — детерминированно).
    const year = data.year || data.startsAt.getUTCFullYear();
    const month = data.month || data.startsAt.getUTCMonth() + 1;

    const dup = await ClubMonth.findOne({ year, month });
    if (dup) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Клуб на ${clubMonthKey(year, month)} уже существует`,
        400
      );
    }

    const club = await ClubMonth.create({
      month,
      year,
      bookId: book._id,
      title: book.title,
      author: book.author,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      archiveUntilDate: archiveWindowEnd(data.endsAt),
      partSchedule: data.partSchedule,
      isActive: computeIsActive(data.startsAt, data.endsAt),
      participantCount: 0,
      messageCount: 0,
    });

    await markBookInClub(book._id, year, month);

    return success(res, { club: serializeClub(club, book) }, 201);
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                       РЕДАКТИРОВАНИЕ КЛУБА                         *
 * ------------------------------------------------------------------ */
router.patch('/:id', validate(clubSchema), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
    }
    const club = await ClubMonth.findById(req.params.id);
    if (!club) {
      throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
    }

    const data = req.body;
    if (data.endsAt <= data.startsAt) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Дата окончания должна быть позже даты начала',
        400
      );
    }

    const book = await Book.findById(data.bookId);
    if (!book) {
      throw new AppError('NOT_FOUND', 'Разбор для клуба не найден', 404);
    }

    const year = data.year || data.startsAt.getUTCFullYear();
    const month = data.month || data.startsAt.getUTCMonth() + 1;

    // Проверка уникальности (year, month), исключая сам этот клуб.
    const dup = await ClubMonth.findOne({
      year,
      month,
      _id: { $ne: club._id },
    });
    if (dup) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Клуб на ${clubMonthKey(year, month)} уже существует`,
        400
      );
    }

    const prevBookId = String(club.bookId);

    club.month = month;
    club.year = year;
    club.bookId = book._id;
    club.title = book.title;
    club.author = book.author;
    club.startsAt = data.startsAt;
    club.endsAt = data.endsAt;
    club.archiveUntilDate = archiveWindowEnd(data.endsAt);
    club.partSchedule = data.partSchedule;
    club.isActive = computeIsActive(data.startsAt, data.endsAt);
    await club.save();

    // Если книгу клуба сменили — снять флаг со старой (если она больше нигде
    // не используется) и проставить новой.
    if (prevBookId !== String(book._id)) {
      await unmarkBookIfUnused(prevBookId, club._id);
    }
    await markBookInClub(book._id, year, month);

    return success(res, { club: serializeClub(club, book) });
  } catch (err) {
    return next(err);
  }
});

/* ------------------------------------------------------------------ *
 *                          УДАЛЕНИЕ КЛУБА                           *
 * ------------------------------------------------------------------ */
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
    }
    const club = await ClubMonth.findById(req.params.id);
    if (!club) {
      throw new AppError('NOT_FOUND', 'Клуб не найден', 404);
    }

    const bookId = String(club.bookId);
    await club.deleteOne();
    await unmarkBookIfUnused(bookId, club._id);

    return success(res, { deleted: true, id: String(club._id) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
