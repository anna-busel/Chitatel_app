const Package = require('../models/Package');
const ClubMonth = require('../models/ClubMonth');
const { archiveWindowEnd, clubMonthKey } = require('../middleware/subscription');

// Вынесено из routes/books.js 30.10.2026 без изменений логики: тем же правом
// пользуются отзывы (UPDATES-PLAN C2, routes/reviews.js) — второй проверки
// доступа к разбору быть не должно.

/**
 * Полный доступ юзера к платной книге (без учёта isFree и превью — их
 * проверяют вызывающие).
 *
 * МОДЕЛЬ ДОСТУПА (пересмотрена 30.07.2026 — ХРАНИМЫЙ ОПЛАЧЕННЫЙ НАБОР, та же
 * что у клуба, см. resolveClubAccess в middleware/subscription.js):
 * 1. Книга куплена отдельно (purchasedBooks) → доступ.
 * 2. Книга входит в купленный пакет (purchasedPackages) → доступ.
 * 3. Админ (Анна) → доступ ко всему.
 * 4. Книга клуба открывается, ТОЛЬКО если этот клуб входит в оплаченный набор
 *    месяцев (user.clubMonthsEntitled). Дальше: если сейчас месяц этого клуба —
 *    нужна активная подписка (basic/premium, не истекла ЛИБО grace period);
 *    если клуб в архивном окне (следующий календарный месяц) — это бонус-месяц,
 *    разбор слушается даже без продления. Набор пополняется в purchase.service.
 *    Пример: месячный подписчик слушает клуб своего оплаченного месяца; клуб
 *    следующего месяца подписка НЕ открывает, пока не продлит. Сезон
 *    оплачивает 3 клуба вперёд — все они в наборе.
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
  // Оплаченный набор клубных месяцев — ХРАНИМЫЙ (пополняется в
  // purchase.service при каждой транзакции подписки).
  const coveredKeys = new Set(user.clubMonthsEntitled || []);
  if (coveredKeys.size === 0) return false;

  // Подписка открывает книгу, только если она — книга ОПЛАЧЕННОГО клуба:
  // либо сейчас месяц этого клуба (нужна активная подписка), либо клуб в
  // архивном окне — бонус-месяц, дослушать свой разбор.
  const clubs = await ClubMonth.find({ bookId: book._id })
    .select('startsAt endsAt month year')
    .lean();

  return clubs.some((club) => {
    // ⛔️ 17.08.2026 — сверка с оплаченным набором обязательна и для архива.
    // Раньше архивная ветка возвращала true любому активному подписчику, и
    // человек, впервые оплативший сентябрь, бесплатно получал августовский
    // разбор. Синхронно с computeClubAccess в middleware/subscription.js.
    if (!coveredKeys.has(clubMonthKey(club))) return false;

    const isCurrent = club.startsAt <= now && now <= club.endsAt;
    if (isCurrent) return hasActiveSub;

    // Бонус-месяц: разбор оплаченного клуба слушается весь следующий
    // календарный месяц, даже если подписку не продлили (status=expired).
    const inArchive = club.endsAt < now && now <= archiveWindowEnd(club.endsAt);
    if (inArchive) return true;

    return false; // будущий клуб аудио не открывает (даже сезон — до старта месяца)
  });
}

module.exports = { userHasBookAccess };
