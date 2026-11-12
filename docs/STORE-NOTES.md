# Тексты для магазинов

Обновлять при каждом релизе. «Что нового» — один текст для App Store и Google Play
(абзацы, без маркеров; Google Play — до 500 знаков, в `<ru-RU>…</ru-RU>`).
Notes для проверяющих Apple — лимит 4000 знаков; держать полную актуальную версию здесь
и дописывать раздел NEW IN THIS VERSION.

## 1.0.4 — «Что нового» (Google Play, 365 знаков)

```
Отзывы на разборы: ставьте оценку и делитесь впечатлениями, свой отзыв можно изменить или удалить.

Восстановление пароля: нажмите «Забыли пароль?», на почту придёт код. Сменить пароль можно в профиле.

Уведомления, когда Анна пишет в чат клуба, и вечерняя сводка. Выключить можно в Профиль → Уведомления.

Плеер продолжает разбор с того места, где вы остановились.
```

## 1.0.4 — Notes для Apple (App Review Information → Notes, ~3000 знаков)

Демо-аккаунты — `claude/reviewer-accounts.md` в проекте (appreview@, appreview2@).
Структура: описание приложения → NEW IN 1.0.4 (отзывы и UGC 1.2 с путём для проверки
через бесплатный разбор, восстановление пароля, пуши чата, карусель баннеров) →
WITHOUT AN ACCOUNT → DEMO / BACKUP ACCOUNT → IN-APP PURCHASES (club.basic.monthly,
club.premium.monthly «Месяц + групповая встреча», book.*, package.*) → OTHER FEATURES
(дневник, ИИ) → UGC → ACCOUNT DELETION → SERVICES → CONTACT.
Названия кнопок сверять по коду (`Email и пароль`, `Забыли пароль?`, `Пожаловаться`,
`Заблокировать автора`, `Уведомления`, `Заблокированные`, `Удалить аккаунт`).
Отзыв можно оставить на любом бесплатном разборе (сервер: бесплатные — доступ всем вошедшим).

## 1.0.5 — «Что нового» (ушло в App Store 12.11)

```
Чат клуба: на вкладке «Чат» видно, сколько новых сообщений, а чат открывается с первого непрочитанного. На «Клубе» в нижнем меню появляется точка, когда в чате есть новое.
```
Notes Apple для 1.0.5: в NEW IN THIS VERSION — «Unread counter on the club chat tab and a dot on the Club tab; the chat opens at the first unread message. No new UGC or purchases.»

## 1.0.5 — Notes для Apple (отправлено 12.11, 2459 знаков)

Как 1.0.4, раздел NEW IN заменён (пароли демо-аккаунтов — в `claude/reviewer-accounts.md`, сюда не пишем):

```
Russian-language book club app: Anna Busel, a psychologist, publishes a monthly audio book analysis and hosts a members-only group chat.

NEW IN 1.0.5
- Club chat: unread counter on the Chat tab, a dot on the Club tab, and the chat opens at the first unread message. No new user-generated content or purchases.
- Catalog: during limited-time sales (e.g. Nov 13–18), a promo tab and badges highlight discounted in-app purchases. All purchases use Apple In-App Purchase; prices come from StoreKit.

WITHOUT AN ACCOUNT
Home, catalog, book pages, free analyses and 5-minute previews work without signing in. An account is needed for the Club and Profile tabs.

DEMO ACCOUNT (subscription NOT active, intentional)
appreview@chitatel.app / <пароль>
Club tab → "Email и пароль" → sign in → Club tab shows the paywall. A sandbox purchase unlocks the club immediately.

BACKUP ACCOUNT (active subscription incl. "Месяц + групповая встреча")
appreview2@chitatel.app / <пароль>
For the club chat, the club analysis and the group meeting card.

IN-APP PURCHASES
- club.basic.monthly: auto-renewable; the club for the calendar month plus the next month as an archive.
- club.premium.monthly "Месяц + групповая встреча": the same plus one live group video meeting with the author per month (3.1.3(d)). Same group; upgrade via the App Store. Club tab → paywall, or the meeting banner inside the club for basic subscribers.
- book.<slug>: non-consumable, one per analysis; Catalog → book page; 5-minute preview before purchase.
- package.<slug>: non-consumable bundles; Catalog → "Пакеты".
"Restore Purchases" is on the paywall.

OTHER FEATURES
Quotes diary: pen button (bottom right). AI analysis: Profile → "ИИ-анализ" → consent → "Анализ от Анны" on a quote. The AI only reflects on saved quotes, is off by default, opt-in, not a chatbot, with a "not therapy" disclaimer.

UGC (1.2)
Chat messages and reviews. Report (five reasons) and block on others' content; long-press a chat message. Blocked members disappear immediately; unblock in Profile → "Заблокированные". The club author can hide any review. Reports are handled within 24 hours.

ACCOUNT DELETION
Profile → bottom → "Удалить аккаунт", type УДАЛИТЬ. Personal data, quotes, reviews and progress are erased; purchase records kept for tax; chat messages anonymized.

SERVICES
StoreKit, Sign in with Apple, OpenAI API (opt-in only), api.chitatel.app. No analytics or ad SDKs. iPhone-only, portrait.
```

Запрос ускоренной проверки: developer.apple.com/contact/app-store/?topic=expedite — «Time-sensitive: our Black Friday sale runs November 13–18. This update adds a catalog tab and badges that show the discounted in-app purchases. We'd be grateful for an expedited review.»
