# AI-CONTEXT-3 — ЧИТАТЕЛЬ (продолжение)

> **ТРЕТИЙ ФАЙЛ КОНТЕКСТА.** Предыдущие: `AI-CONTEXT.md` (база, Фазы 1-2, чат 4.1-4.8, уроки #1-19) и `AI-CONTEXT-2.md` (Фаза 4, задачи 1.3/1.7/1.8, уроки #20-27).
>
> **Порядок чтения для AI:** `AI-CONTEXT.md` → `AI-CONTEXT-2.md` → **этот файл**.
>
> **Прогресс фиксировать ДАЛЕЕ ТОЛЬКО ЗДЕСЬ.** Первые два не редактировать (архив). AC-2 разросся до ~58KB → начат AC-3 (урок #20).
>
> ⚠️ **Юзеру:** добавить упоминание `AI-CONTEXT-3.md` в Project Instructions проекта Claude (чтобы будущие сессии его читали).

---

## ТЕКУЩИЙ СТАТУС (на 14.06.2026)

**Сделано в этой сессии:** (1) пересобран каталог разборов под новый xlsx; (2) согласована модель подписок под Apple; (3) **Фаза 3 (Платежи) начата — задача 3.3 (бэкенд-верификация) ГОТОВА.**

**Дальше по Фазе 3:** 3.4 (S2S webhook, бэк) · 3.2 (Flutter paywall — нужны финальные product ID + цены от Анны) · 3.1 (кабинет — Анна: Paid Apps agreement, налог/банк-анкеты, создать продукты, sandbox).

---

## КАТАЛОГ РАЗБОРОВ — ПЕРЕСОБРАН (14.06.2026)

Новый источник истины: `Каталог_разборов.xlsx` (загружал юзер). Заменил прежний `reader-bot-catalog.json` (был 42 книги + 6 факультативов, без USD).

**Итог:** **54 разбора + 10 пакетов** (4 тематических ПАКЕТА: `paket_woman`, `paket_love_rel`, `paket_goals_ach`, `paket_understand_yourself` + 6 ФАКУЛЬТАТИВОВ). Новые цены BYN+USD (USD округлён под ценовые точки Apple `.99`). Слаги существующих книг и состав факультативов сохранены; новые разборы #43-54 — слаги транслитерированы.

**Коммиты:** `seed.js` (`2c893cd` → подключены обложки 4 тематических пакетов + `priceUsd` берётся из каталога) · `reader-bot-catalog.json` (54+10, `2854ecf` → авторы 3 разборам `b31c037`). Проверено: JSON валиден, цены сошлись с таблицей 1-в-1.

**Обложки:** уже лежат в `app/assets/book-covers/` (копировать не пришлось), включая 9 из 10 пакетов. Юзер вручную переименовал `43.png` → `beguschaya_s_volkami.png`. Авторы проставлены разборам #52 (Чехов и Бунин), #53 (Фромм), #54 (Холлис); 2 биографии оставлены с «еще не вышел» (автор не нужен).

**Что осталось ДОСЛАТЬ (отдано юзеру файлами в чат — `Каталог_что_дослать.md/.xlsx/.txt`, НЕ в репо):**
- Обложки: 11 новых разборов (#44-54: lolita, zhenschiny_kotorye_lyubyat_slishkom_silno, telo_pomnit_vse, telo_ne_vret, tanets_gneva, odin_na_odin_s_zhiznyu, skazat_zhizni_da, paket_latypov_frankl, razbory_zhenskaya_druzhba_chehov_i_bunin, razbor_erih_fromm_begstvo_ot_svobody, razbor_dzheyms_hollis_dushevnye_omuty) + обложка пакета `facultativ_tolstoy.png` (нет нигде).
- Описания: 3 (Лолита, Тело помнит все, Пакет Латыпов+Франкл).
- Разборы, которых нет в каталоге но нужны факультативам (7): bednye_lyudi (Достоевский); dar (Набоков); protsess (Зарубежная); skazka_o_rybake_i_rybke, rusalochka, alenushka_ivanushka, skazka_o_mertvoy_tsarivne (Детская). Пока их нет — эти факультативы соберутся неполно (seed логирует).
- Аудио всех разборов (отдельный этап, позже).

**PENDING:** «Пакет Латыпов + Франкл» (#51) заведён как разбор — решить: разбор или пакет. Обложки-серия в едином стиле — ОТЛОЖЕНО (рабочего ИИ-генератора в чате нет: Stability MCP стабильно падает «Tool execution failed» — вероятно не настроен ключ; гнать 54 обложки нечем). Идея на будущее: единый шаблон/грейдинг или внешняя генерация + наложение текста кодом.

---

## ТАРИФЫ ПОДПИСКИ — СОГЛАСОВАНО (14.06.2026, решение команды Анны)

Проанализированы реальные тарифы с сайта annabusel.org (там сложнее: 3 именованных тарифа × 1/6/12 мес + сезоны + zoom-терапия + «навсегда» + рассрочка/подарки/росс.карты). Для приложения упрощено под Apple.

**Модель для v1:**
- **Подписка «Клуб» (auto-renewable), subscription group «Клуб ЧИТАТЕЛЬ»:** месяц ~$28 + сезон 3 мес ~$54. Сезон = 3-месячный авто-период Apple (легально), «сезон» — косметическое название контента в UI.
- **«Навсегда»** = `archive.forever`, **non-consumable (разовая покупка)**, не подписка.
- **Премиум — позже:** добавится в ту же subscription group как второй уровень (`club.premium.*`); имена задаём с заделом. Apple сам делает upgrade/downgrade внутри группы.
- **Подарок — позже (не v1):** авто-подписку дарить НЕЛЬЗЯ (привязана к Apple ID). Дарить можно non-renewing/consumable + механика кодов-редемпшна на нашем сервере. Оплата всё равно через Apple.

**Правила Apple (проверено web-поиском 14.06):**
- Доступ к клубу в приложении = ТОЛЬКО Apple IAP (комиссия 15% Small Business / 30%). Ссылки `bebusel.info` как оплата в iOS — реджект (3.1.1). Цену в приложении закладывать выше, чтобы покрыть комиссию.
- Периоды auto-renewable: неделя/месяц/2мес/3мес/6мес/год — сезон(3мес) подходит.
- Рассрочка, подарочные сертификаты, оплата любыми картами — в iOS невозможно, остаётся на сайте.
- «Доступ к разбору до 21 числа след.месяца» (правило с сайта) — это НАША серверная логика доступа (не Apple). Реализуется в модели доступа, легко меняется.

**Что нужно от Анны до создания продуктов (блокер 3.1/3.2):** финальные цены в USD под ценовые точки Apple + что входит в Базовый (и потом Премиум).

⚠️ **Расхождение с MASTER 6.3:** там `club.basic/premium × monthly/semiannual/annual`. Реальная модель — месяц+сезон(+премиум позже). Бэкенд написан **product-agnostic** (см. `mapProduct`), смена тарифов код не ломает — меняется только маппинг и список продуктов в App Store Connect.

---

## ЗАДАЧА 3.3 — БЭКЕНД-ВЕРИФИКАЦИЯ ПОКУПОК — ✅ ГОТОВО (14.06.2026)

Всё в `main`. Серверная проверка покупок Apple по MASTER 6.3 / 7.3 / 7.4.

**Коммиты:**
- `server/src/models/Purchase.js` (`20f8d00`, новый) — модель покупки. Покрывает подписку (`itemType:'subscription'`, expiresAt+status) и разовые (book/package/archive). **Product-agnostic:** appleProductId хранится как есть, маппинг тарифов — в сервисе. `transactionId` (= Apple originalTransactionId) unique sparse → идемпотентность.
- `server/src/routes/purchases.js` (`3821edb`, новый) — `POST /api/purchases/verify` (requireAuth, Zod `{signedTransaction}`).
- `server/src/services/purchase.service.js` (`889b87c`, новый) — `verifyPurchase()`: `SignedDataVerifier.verifyAndDecodeTransaction(jws)` → `mapProduct(productId)` → upsert Purchase → обновление прав User. `mapProduct`: `archive.forever`→archive; `club.{tier}.{period}`→subscription; `book.{slug}`/`package.{slug}`→разовые (lookup по bookSlug/packageSlug). Корневые сертификаты Apple PKI из `config.apple.rootCertsPath` (кэш); нет сертификатов → `PURCHASE_VERIFICATION_UNAVAILABLE` (503).
- `server/src/app.js` (`31ea07a`) — `app.use('/api/purchases', purchaseRoutes)`.
- `server/src/config/index.js` (`f1e4514`) — `apple.bundleId/issuerId/appAppleId/environment/rootCertsPath`.
- `server/package.json` (`7839dc5`) — `+@apple/app-store-server-library ^3.1.0`.
- `User.js` НЕ менялся — поля подписки (`subscriptionStatus/Plan/ExpiresAt/OriginalTransactionId`, `gracePeriodExpiresAt`, `hasArchiveAccess`, `purchasedBooks/Packages`) уже были.

**Дизайн-решения:**
- Библиотека `@apple/app-store-server-library` грузится лениво (`require` внутри функции) — сервер стартует даже без `npm install`, ошибка прилетит только при вызове verify.
- `subscriptionPlan` enum пока `['monthly','semiannual','annual']` — неизвестный период (например `season`) в это поле НЕ пишем (ставим null), полный период хранится в `Purchase.itemId`. ⚠️ Когда финализируем тарифы — **добавить `season` в enum `User.subscriptionPlan`**.
- priceUsd в Purchase пока не заполняется из payload (валюта/величина payload.price неоднозначны) — оставлен null, при необходимости добавить позже.

**⚠️ Для реальной работы (НЕ сейчас, Фаза 7/деплой):**
- `cd server && npm install` (поставить новый пакет).
- Корневые сертификаты Apple PKI (https://www.apple.com/certificateauthority/) в `APPLE_ROOT_CERTS_PATH`.
- `APPLE_ISSUER_ID` + App Store Server API key (App Store Connect → Users and Access → Integrations → In-App Purchase, роль Admin — заказывает Анна), `APPLE_ENVIRONMENT`, `APPLE_APP_APPLE_ID` (для production).
- Без них verify → 503. Локально проверено только `node --check` (все файлы ОК). End-to-end — sandbox в Фазе 7.

---

## ДАЛЬШЕ ПО ПЛАНУ

```
Фаза 3 (Платежи) — В РАБОТЕ
  3.3 бэкенд-верификация ✅ (14.06)
  3.4 S2S webhook (бэк) — СЛЕДУЮЩЕЕ по коду (renew/expire/refund/grace)
  3.2 Flutter paywall + StoreKit 2 — нужны финальные product ID + цены (Анна)
  3.1 кабинет (Анна) — Paid Apps agreement, налог/банк, создать продукты, sandbox
  → потом Фаза 5 (ИИ-дневник) / Фаза 6 (полировка) / Фаза 7 (TestFlight через Codemagic)
```

Прочие открытые вопросы — см. AC-2 (PENDING/вопросы к Анне): обложка клуба (как книга или арт), эксклюзивы пакетов, когда MP3 остальных разборов, и т.д.

---

## УРОКИ (продолжение, #28+; #1-27 в AC/AC-2)

**#28 ⚠️ ФОРМАТ И ВЕРСИЯ ПАКЕТА — ПРОВЕРЯТЬ ПО npm REGISTRY ПЕРЕД ИСПОЛЬЗОВАНИЕМ (14.06.2026):** для `@apple/app-store-server-library` сверил по `registry.npmjs.org`: latest `3.1.0`, `main: dist/index.js`, без `type:module` → CommonJS, `require` работает (ESM-проблемы нет). API (`new SignedDataVerifier(rootCAs[], enableOnlineChecks, environment, bundleId, appAppleId?)`, `verifyAndDecodeTransaction`) сверил по github/докам Apple, не по памяти. Продолжение #21/#22/#27: перед нативным/серверным пакетом проверять (1) версию, (2) формат модуля (CJS/ESM), (3) актуальный API.

---

*Создан 14.06.2026. Продолжение AC-2 (разросся ~58KB). В этой сессии: каталог пересобран (54 разбора + 10 пакетов, новые цены, авторы); согласована модель подписок под Apple (месяц $28 + сезон 3мес $54 авто + archive.forever разовая, премиум/подарок позже); **Фаза 3 начата — задача 3.3 (бэкенд-верификация покупок) ГОТОВА** (Purchase + /verify + SignedDataVerifier, product-agnostic). Следующее — 3.4 webhook / 3.2 paywall. Прогресс фиксировать далее ТОЛЬКО здесь.*
