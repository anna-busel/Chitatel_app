# AI-CONTEXT-3 — ЧИТАТЕЛЬ (продолжение)

> **ТРЕТИЙ ФАЙЛ КОНТЕКСТА.** Предыдущие: `AI-CONTEXT.md` (база, Фазы 1-2, чат 4.1-4.8, уроки #1-19) и `AI-CONTEXT-2.md` (Фаза 4, задачи 1.3/1.7/1.8, уроки #20-27).
>
> **Порядок чтения для AI:** `AI-CONTEXT.md` → `AI-CONTEXT-2.md` → **этот файл**.
>
> **Прогресс фиксировать ДАЛЕЕ ТОЛЬКО ЗДЕСЬ.** Первые два не редактировать (архив).
>
> ⚠️ **Юзеру:** добавить упоминание `AI-CONTEXT-3.md` в Project Instructions проекта Claude (чтобы будущие сессии его читали).

---

## ТЕКУЩИЙ СТАТУС (на 27.06.2026)

**✅ ПРИЛОЖЕНИЕ В TESTFLIGHT И ЗАПУЩЕНО НА ФИЗ.АЙФОНЕ (26.06.2026).** Первый билд через Codemagic, Apple Sign In работает в проде. Блок «CODEMAGIC + TESTFLIGHT» ниже.

**✅ ДЕПЛОЙ СЕРВЕРА ВЫПОЛНЕН (26.06.2026).** `https://api.chitatel.app` по HTTPS, своя MongoDB, каталог+клуб залиты. Блок «ДЕПЛОЙ СЕРВЕРА» ниже.

**✅ ПОЛИРОВКА ЧАТА + КРИТИЧЕСКИЙ БАГ БЕЛОГО ЭКРАНА КЛУБА ИСПРАВЛЕН (27.06.2026).** Большая сессия отладки. Блок «СЕССИЯ 27.06» ниже. Главное: найдена и устранена причина «вечной загрузки клуба после перезахода» — `checkAuth()` не вызывался при старте.

**Фаза 3 (Платежи) — КОД ГОТОВ + КАБИНЕТ + РУЧНЫЕ ШАГИ 3.2 СДЕЛАНЫ.**

**Не сделано / осталось до реального теста ПОКУПОК:**
- **`.env` на сервере неполон** — пусты `APPLE_*_IAP` (верификация покупок), `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`, `APNS_*`.
- **Sandbox-тестировщики** — не созданы. **Webhook URL** в ASC — не прописан (`https://api.chitatel.app/api/webhooks/apple`).
- **ASC API key выпущен** (для Codemagic) — для верификации покупок, возможно, нужен ОТДЕЛЬНЫЙ ключ «Встроенная покупка» (свериться с purchase.service.js).

**⚠️ КРИТИЧЕСКОЕ СТРАТЕГИЧЕСКОЕ: аудитория — РФ + РБ + Грузия. Apple-оплата в РФ/РБ НЕ РАБОТАЕТ. Канал №1 по деньгам — САЙТ + КОДЫ АКТИВАЦИИ.**

---

## ✅ СЕССИЯ 27.06.2026 — ПОЛИРОВКА ЧАТА + БАГ БЕЛОГО ЭКРАНА КЛУБА

Юзер тестировал на симуляторе/айфоне, нашёл баги чата + критический баг «белый экран клуба после перезахода». Все исправлены. **Проверка локально через `flutter run` на маке** (юзер может, быстрый цикл — в отличие от Codemagic). Все фиксы в репо, нужен **новый билд Codemagic**, чтобы попали на айфон.

### 🔴 ГЛАВНЫЙ БАГ: белый экран клуба после перезахода (`60f3f4a`)
**Симптом:** свежий логин (после удаления приложения) → клуб работает; закрыл-открыл приложение → клуб = вечный белый экран с загрузкой. Каталог/главная при этом работают.

**Диагностика (заняла много кругов — урок ниже):** добавили debug-логи HTTP (`api_client.dart`) + в `currentClubProvider`. Ключевая улика из лога `flutter run`: при открытии клуба **НЕТ ни одного `[HTTP →] /api/club`** — т.е. приложение вообще не шлёт запрос клуба. Значит `ClubScreen` не строится. Цепочка причины:
- маршрут клуба обёрнут в **`GuestGate`** (показывает ClubScreen если authenticated, иначе приглашение войти);
- `GuestGate` на статусе `initial`/`loading` показывает **вечную крутилку**;
- `authProvider` стартует в статусе `initial`, переходит в `authenticated` только если вызвать `checkAuth()`;
- **`main.dart` НЕ вызывал `checkAuth()` при старте!** → после перезахода статус навсегда `initial` → GuestGate вечно крутит → ClubScreen не строится → HTTP клуба не уходит.
- Свежий логин работал, т.к. `signInWithApple/login` ставят `authenticated` вручную в той же сессии. Каталог работал — он НЕ обёрнут в GuestGate.

**Фикс:** в `main.dart` добавлен `await container.read(authProvider.notifier).checkAuth()` до `runApp`. checkAuth читает токены из хранилища (без сети, быстро) → выставляет authenticated/guest. **✅ Проверено юзером — клуб открывается после перезахода.**

### Баги чата (доведение до Telegram-уровня) — все исправлены
Список от юзера: удалённые висят, перемотка к закрепу не работает, дёрганье скролла, фото пустое после перезахода, клавиатура не убирается, «резкое появление» сообщения, эмодзи мелкие, анимация long-press меню. Решения:

1. **Удалённые исчезают** (`f25c7a3`, `chat_tab.dart`) — вариант А (как Telegram): по WS-событию `ChatMessageDeletedEvent` и при своём удалении `removeWhere` вместо плашки «сообщение удалено»; при загрузке истории/контекста/loadMore фильтр `isDeleted` (хелпер `_notDeleted`). Если удалён закреп — баннер снимается.
2. **Перемотка к закрепу/reply** (`f25c7a3`) — `_jumpToMessage` переписан: если сообщение в ленте но виджет не построен (reverse ListView рисует только видимое), сначала грубо jumpTo по индексу → endOfFrame → ensureVisible (раньше зря грузил контекст с сервера).
3. **Дёрганье скролла** (`f25c7a3`) — гистерезис для кнопки «вниз» (`_showJumpDown` показ >300px, скрытие <120px), чтобы setState не дёргался каждый кадр.
4. **Оптимистичная отправка** (`3c235a3`, `chat_tab.dart`) — корень «резкого появления»: `sendTextMessage` ВОЗВРАЩАЕТ готовое сообщение с реальным id, но `_sendMessage` его игнорировал — сообщение появлялось только по WS-эху (задержка). Теперь `_insertOwnMessage(sent)` вставляет сразу + скролл вниз; WS-дубль отсекается дедупликацией по id. Применено к тексту/фото/голосу.
5. **Клавиатура закрывается** (`3c235a3`) — GestureDetector(translucent) с `FocusScope.unfocus()` на области списка + `keyboardDismissBehavior: onDrag`.
6. **Телеграм-меню по long-press** (`644f487`, `chat_message_bubble.dart`) — `showModalBottomSheet` (выезжал снизу — «некрасиво») заменён на `showGeneralDialog` с ScaleTransition+FadeTransition (всплывает по центру с увеличением). Ряд 6 эмодзи сверху (крупные, fontSize 30), карточка действий ниже. Вынесено в `_ActionMenuContent` + `_ActionTile`.
7. **Эмодзи реакций крупнее** (`644f487`) — в `_ReactionsRow` эмодзи fontSize 14→18, чипы просторнее.
8. **Фото после перезахода** (`bc2fdeb`, `server/src/routes/club.js`) — СЕРВЕРНОЕ. Причина: `imageUrl`/`voiceUrl` сохранялись в БД как signed URL с TTL 1 час; при отдаче истории отдавался сохранённый (протухший) → после перезахода картинка не грузилась. Фикс: хелпер `withFreshMedia()` перевыпускает signed URL из `imageStoragePath`/`voiceStoragePath` (хранятся в БД для этого) на КАЖДОЙ отдаче. Применён в `/chat`, `/chat/context`, `findMessagePopulated` + рекурсивно для reply-снапшота. **Требует `pm2 restart`.**

### Серверные фиксы (найдены по логам `pm2 logs`)
- **`trust proxy`** (`7b8228f`, `app.js`) — `app.set('trust proxy', 1)`. За nginx express-rate-limit падал с `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` на `/api/auth` (там висит authLimiter). Это ломало refresh-токена (500) при перезаходе. **НЕ был главной причиной белого экрана** (та — checkAuth), но реальный баг, теперь чинит. **Требует `pm2 restart`.**
- **Graceful shutdown** (`742e676`, `server.js`) — `mongoose.connection.close(false, cb)` → Mongoose 8 убрал callback → unhandledRejection при остановке. Переписан на async/await. **Требует `pm2 restart`.**

### Клиентский фикс refresh-токена (попутно, полезный)
- **Очередь параллельных 401** (`api_client.dart`, финал `d13370`) — при пачке одновременных запросов (клуб шлёт club/current + история + mentionable) с истёкшим токеном старый код ронял/вешал параллельные 401. Теперь один refresh на всех (`_ensureRefreshed` + `_refreshFuture`), остальные ждут и повторяются с новым токеном. Защита от петли через `__retried__` флаг. (Не был причиной белого экрана, но улучшение.)
- Двойной спиннер входа (`c873d07`, прошлая сессия) — уже исправлен.

### Debug-логи убраны
Временные debug-логи (HTTP в `api_client.dart`, в `club_provider.dart`) добавлялись для диагностики и **убраны** после (`171af17`, `d13370`). Боевой код чистый.

### ⚠️ ОСТАЛОСЬ по чату (не блокеры)
- Всё из списка юзера сделано. Не проверено вживую на айфоне (только симулятор + обещание проверить): клавиатура, фото с камеры, тактильные отклики — это нативное, нужен билд.
- **Звуки в чате — РЕШЕНО НЕ ДЕЛАТЬ** (конфликт с аудио-плеером разборов, низкий приоритет).
- Индикатор «печатает...» — сокет шлёт `chat:user_typing`, в UI пока нет. По желанию, позже.

### ⏭️ Для применения фиксов
- **Сервер:** `git pull` + `pm2 restart chitatel-api` (3 серверных фикса: фото, trust proxy, shutdown). ⚠️ При `git pull` может ругнуться на `server/package-lock.json` (перегенерён npm install) → `git checkout -- server/package-lock.json` сначала.
- **Приложение:** новый билд Codemagic (Start new build → ios-testflight → main) — все клиентские фиксы попадут на айфон. Юзер проверял на симуляторе через `flutter run` (компилируется ✅).

---

## ✅ CODEMAGIC + TESTFLIGHT — ВЫПОЛНЕНО (26.06.2026)

Первый iOS-билд собран в облаке (Codemagic), подписан, залит в TestFlight, установлен на физ.айфон. **Apple Sign In работает.**

### Почему Codemagic (а не локальная подпись)
⚠️ **Аккаунт Анны — Individual.** Подтверждено доками Apple (DTS): в Individual-команде владелец НЕ может добавить разработчика так, чтобы команда появилась в Xcode для подписи. Приглашённый аккаунт юзера `g.akhmeteli89@gmail.com` (Admin в ASC) в Xcode видит ТОЛЬКО Personal Team `669ZY8S56N`, команда Анны `3GS6F87RKZ` НЕ появляется. **Локальная Xcode-подпись недостижима.** Путь — Codemagic с ASC API key (минует Individual, без 2FA владельца). Мак юзера (2017, Xcode 15.2) Xcode 26 не соберёт.

### ASC API key
- Выпущен в Users and Access → Integrations → раздел **«App Store Connect»** (Team Keys). `.p8` + Issuer ID + Key ID (`UN4ZB8T93H`), роль Admin. Имя в Codemagic `chitatel-key`.
- ⚠️ Для ВЕРИФИКАЦИИ ПОКУПОК, возможно, нужен ОТДЕЛЬНЫЙ ключ «Встроенная покупка» (config ждёт `APPLE_ISSUER_ID`, `APPLE_KEY_ID_IAP`, `APPLE_IAP_PRIVATE_KEY_PATH`). Свериться с purchase.service.js.

### Codemagic — настройка
- План Individual (бесплатный, 500 мин/мес). GitHub App в аккаунте **anna-busel**.
- Монорепо → **`codemagic.yaml`** в КОРНЕ (путь к app через `working_directory: app`). Коммит `79fa03d` + правки.
- workflow `ios-testflight`: mac_mini_m2, Flutter 3.22.3, Xcode latest. Шаги: pub get → pod install → keychain initialize → `fetch-signing-files --type IOS_APP_STORE --create` → add-certificates → use-profiles → `flutter build ipa --release`. submit_to_testflight=false (внутр.тестер без ревью). integrations: `chitatel-key`. groups: `appstore_credentials`.
- ⚠️ **CERTIFICATE_PRIVATE_KEY** — RSA-ключ в env (иначе `Cannot save Signing Certificates without certificate private key`). `ssh-keygen -t rsa -b 2048 -m PEM`, Secret в группе `appstore_credentials`. НЕ в репозитории.

### Грабли первого билда (решены)
1. `No matching profiles` → `fetch-signing-files --create`.
2. `Cannot save Signing Certificates...` → `CERTIFICATE_PRIVATE_KEY`.
3. **Код 90474** (iPad-ориентации) → `TARGETED_DEVICE_FAMILY "1,2"→"1"` (только iPhone) во всех трёх Runner-конфигах (`a1e4c6e`).

### TestFlight
- Билд 1.0.0(1) обработан. **Export Compliance**: «Ни один из вышеперечисленных алгоритмов» (exempt).
- Группа **Internal Testing**, добавлен ТОЛЬКО юзер. **Анну добавить ПОЗЖЕ** (после теста юзера). Авто-распределение вкл.
- TestFlight: Apple ID в App Store на айфоне = тестер (`g.akhmeteli89@gmail.com`).
- **Установлено на айфон, Apple Sign In работает.** ✅

### Пересобрать билд
Codemagic → Start new build → `ios-testflight`, branch main. Build number автоинкремент. Авто-распределение пришлёт юзеру.

---

## ✅ ПОДКЛЮЧЕНИЕ ПРИЛОЖЕНИЯ К БОЕВОМУ СЕРВЕРУ (26.06.2026)

- `api_endpoints.dart` (`b79eb68`): baseUrl/socketBaseUrl через `String.fromEnvironment('API_BASE', defaultValue: 'https://api.chitatel.app')`. **Прод по умолчанию.** Локально: `flutter run --dart-define=API_BASE=http://localhost:3000`.
- Socket-сервис без хардкодов, https→wss автоматом.
- Проверено на симуляторе + физ.айфоне: каталог, вход, клуб с чатом, аудио, Apple Sign In.
- Аудио Маленького принца залито (rsync) → `/var/audio/chitatel/malenkii_princ/`. Играет.

### Ручные шаги 3.2 — СДЕЛАНЫ (на маке)
- `flutter pub add in_app_purchase url_launcher` + `pod install`.
- Роутер `app_router.dart` (`367fe48`): заглушка «Тарифы» → `PaywallScreen`.
- Xcode capabilities: In-App Purchase + Sign in with Apple (Team=None разблокировал список). `Runner.entitlements` создан. Коммит `03086a6`.
- ⚠️ `project.pbxproj`: DEVELOPMENT_TEAM → Personal `669ZY8S56N`. Для Codemagic неважно. Bundle `app.chitatel.ios`.
- Push с мака: нужен **PAT** (Username `g1orgi89` + токен), `credential.helper osxkeychain`.

### ⚠️ Git-гигиена на маке
- `.gitignore` НЕ покрывает `audio-storage/`, `.env*`, мусор `app/-H`/`app/-d`. Коммитили ВЫБОРОЧНО по именам.
- **TODO: добавить в `.gitignore`: `audio-storage/`, `.env*`; удалить мусор `app/-H app/-d`.** Не сделано.
- ⚠️ **На сервере** при `git pull` ругается на `server/package-lock.json` → `git checkout -- server/package-lock.json` перед pull.

---

## ✅ ДЕПЛОЙ СЕРВЕРА — ВЫПОЛНЕНО (26.06.2026)

VPS Contabo, тот же где reader-bot, **строго изолированно**. SSH под `deploy` (с мака — по паролю).

⚠️ **VPS ОБЩИЙ:** чужие сайты (`unibotz.com`, `beautycontentpro`), процессы, системный Node 18, глобальный PM2. Чужое не трогать.

| Шаг | Детали |
|-----|--------|
| **Домен** | `chitatel.app` (Namecheap). A-записи `api`+`@`+`www` → `161.97.102.73`. |
| **Node** | Наш Node 20.20.2 через nvm под `deploy` (системный 18 не трогать). |
| **MongoDB** | Docker `chitatel-mongodb`, mongo:8.0, `127.0.0.1:27018` (снаружи), внутри 27017. --auth, root `chitatel_admin`. |
| **Бэкенд** | `/home/deploy/chitatel/Chitatel_app`. `npm install` (`npm audit fix --force` НЕ запускать — сломает multer). |
| **.env** | `server/.env` (600). Есть: PORT=3000, MONGO_URI, JWT/REFRESH/AUDIO секреты, PUBLIC_BASE_URL, APPLE_TEAM_ID=3GS6F87RKZ, APPLE_CLIENT_ID/BUNDLE_ID=app.chitatel.ios. **Пусто:** APPLE_*_IAP, GOOGLE_CLIENT_ID, OPENAI_API_KEY, APNS_*. |
| **AUDIO_BASE_PATH** | `/var/audio/chitatel`. |
| **PM2** | Наш `ecosystem.config.js` с `interpreter` на nvm node20. Процесс **`chitatel-api`**, cluster 1. interpreter-правка ТОЛЬКО на сервере, в репо НЕ коммичена. |
| **nginx** | `/etc/nginx/sites-available/api.chitatel.app`. proxy→127.0.0.1:3000, WebSocket, `client_max_body_size 12M`. Перед reload `nginx -t`. |
| **HTTPS** | certbot до 24.09.2026, авто-обновление. |
| **Каталог+клуб** | `npm run seed` (54+3+10) + `npm run seed:club` — прошли. |

**Тест-аккаунты (прод):** anna@chitatel.app/anna123456 (admin), test-premium@chitatel.app/test123456 (premium активный), test-basic, test-expired (все test123456).

### ⚠️ ХВОСТЫ деплоя
1. Mongo-пароль в логах seed.js — замаскировать (по желанию, юзер решил не менять пароль).
2. Заглушка «Нет описания» 3 книги (`c8a2ccb`) — перезаписать когда Анна пришлёт.
3. Факультативы: 7 разборов + обложка `facultativ_tolstoy` отсутствуют (Анна досылает).
4. `seed-club.js` `+21`→`+31` — НЕ менять сейчас.

### Команды сервера
```bash
ssh deploy@161.97.102.73   # по паролю
cd /home/deploy/chitatel/Chitatel_app
git checkout -- server/package-lock.json   # если ругается на pull
git pull origin main
cd server && npm install        # если менялись зависимости
pm2 restart chitatel-api        # ТОЛЬКО если менялся код server/
pm2 logs chitatel-api           # живой лог (без --nostream); pm2 flush — очистить старое
curl -s https://api.chitatel.app/api/health
```
⚠️ Перезапускать ТОЛЬКО при изменениях в `server/`. Правки `app/` сервер не трогают.

---

## КАТАЛОГ РАЗБОРОВ — ПЕРЕСОБРАН (14.06.2026)

Источник: `Каталог_разборов.xlsx`. **54 разбора + 10 пакетов**. Цены BYN+USD (точки Apple `.99`).
**Коммиты:** `seed.js` (`2c893cd`) · `reader-bot-catalog.json` (`2854ecf`→`b31c037`→`c8a2ccb`).
**Дослать (Анна):** обложки #44-54 + `facultativ_tolstoy.png`; описания 3; 7 разборов факультативов; аудио.
**seed.js:** идемпотентный, `appleProductId = book.{slug}`/`package.{slug}`. Залит в прод 26.06.

---

## ✅ ЗАДАЧА 3.1 — APP STORE CONNECT — СДЕЛАНО (16.06.2026)

**Юр.лицо:** Hanna Busel, ИП Тбилиси. Paid Apps активно, W-8BEN активно, банк Bank of Georgia USD активно.
**Small Business Program (15%):** заявка подана, ждёт. До одобрения — 30%.
**Приложение:** «Читатель: книжный клуб», **Apple ID 6779357856**, SKU `chitatel-ios-001`, Bundle `app.chitatel.ios`, ru. Метаданные/скриншоты — Фаза 7. НЕ нажимать «Добавить для проверки».
**Продукты (group «Клуб ЧИТАТЕЛЬ», id 22166930):** `club.basic.monthly` (Apple ID 6781739637, $27.99), `club.basic.season` (3 мес, ~$54.99). ⚠️ Цены по странам не выровнены. $28 — уточнить у Анны (цена клиента или доход).
**Разборы/пакеты non-consumable** (64) — скриптом через ASC API, ПОЗЖЕ.
**Осталось:** Sandbox-тестировщики; webhook URL; метаданные (Фаза 7); APPLE_*_IAP ключ.

---

## 🔑 СОГЛАСОВАННАЯ МОДЕЛЬ ПОДПИСОК И ДОСТУПА (15.06.2026) — ВАЖНО

- **Бесплатное на скачивание + IAP.** Покупки в iOS → ТОЛЬКО Apple IAP. Никаких ссылок «оплати на сайте» внутри iOS.
- **Тарифы:** Месяц `club.basic.monthly` ~$28 авто. Сезон (3 мес) `club.basic.season` ~$54 авто. «Навсегда» `archive.forever` (позже). Премиум (позже). ⚠️ Сезон — ОДИН продукт с автопродлением, не отдельные.
- **Сезонность:** сезонный тариф на paywall только в начале сезона (июнь/сен/дек/мар). Вне окна — месячный.
- **Доступ активного = скользящее окно «текущий + предыдущий месяц»** (предыдущий = архив 31 день). Деньги по дате Apple / контент по календарю.
- **Нельзя через Apple → сайту:** предпродажа, рассрочка, сертификаты, росс./бел. карты.
- **Анонсы:** будущий клуб (статус `future`), кнопка «Напомнить» (не оплата). Broadcast-пуш (Фаза 6).

---

## 🧩 БУДУЩАЯ ФИЧА: КОДЫ АКТИВАЦИИ (РФ/РБ) — ПРИОРИТЕТ ВЫСОКИЙ

⚠️ КАНАЛ №1 ПО ДЕНЬГАМ. Сервер есть → можно браться.
- Оплата на сайте → код → нейтральное поле «Активировать код» в приложении → сервер открывает доступ.
- ⚠️ Apple: ТОЛЬКО нейтральное поле, БЕЗ рекламы внешней покупки. Kindle/Spotify-модель.
- Код = не Apple-подписка, без автопродления. Модель `ActivationCode` + экран + связка с оплатой сайта.

---

## ЗАДАЧИ 3.3 / 3.4 / 3.2 — ✅ ГОТОВО (14-15.06)
- **3.3 верификация:** `Purchase.js` (`20f8d00`), `purchases.js` (`3821edb`), `purchase.service.js` (`889b87c`→`6462df5`), `config` (`f1e4514`), `package.json` (`7839dc5`, +@apple/app-store-server-library ^3.1.0). ⚠️ `subscriptionPlan` enum без 'season' (добавить при финализации). ⚠️ APPLE_*_IAP в .env пусто.
- **3.4 webhook:** `webhook.service.js` (`7045ae1`), `webhooks.js` (`981bc75`), `app.js` (`9f766d7`). URL: `https://api.chitatel.app/api/webhooks/apple`.
- **3.2 paywall:** `api_endpoints.dart`, `purchase_service.dart` (`41a3c84`), `purchase_provider.dart` (`f7431d9`), `success_screen.dart` (`cf1f287`), `paywall_screen.dart` (`e75bad4`). Ручные шаги сделаны 26.06. Terms/Privacy — заглушки `chitatel.app/terms|privacy` (страницы создать — отдельная задача).

---

## ДАЛЬШЕ ПО ПЛАНУ

```
✅ Сервер (api.chitatel.app, своя Mongo, каталог+клуб)
✅ Приложение против прода (симулятор + физ.айфон)
✅ Codemagic + первый билд в TestFlight + Apple Sign In
✅ Полировка чата до Telegram-уровня + баг белого экрана клуба (checkAuth) [27.06]
СЛЕДУЮЩЕЕ (порядок согласован с юзером):
  1. Пересобрать билд Codemagic (все фиксы чата+белого экрана) + pm2 restart сервера → проверить на айфоне.
  2. Добавить Анну в Internal Testing → удалённый тест.
  3. ТЕСТ ПОКУПОК: ASC API key для верификации → APPLE_*_IAP в .env (+Apple root certs, +APPLE_APP_APPLE_ID=6779357856, +APPLE_ENVIRONMENT=sandbox). Свериться с purchase.service.js (нужен ли ОТДЕЛЬНЫЙ ключ «Встроенная покупка»). Webhook URL в ASC + sandbox-аккаунты. pm2 restart.
  4. Privacy + Terms + Support страницы на chitatel.app (ТОЛЬКО юр., для ревью Apple; маркетинг и кнопка «скачать» — после публикации).
  5. Логика доступа к клубу (скользящее окно + 31 день + сезоны + окна продаж).
  6. Коды активации (РФ/РБ — КАНАЛ №1; когда покупки работают + есть сайт).
  7. Продукты-разборы в Apple (64 non-consumable скриптом через ASC API).
  8. Фаза 5 (ИИ-дневник), Фаза 6 (профиль 6.2 + админка 6.6 + пуши 6.1 + онбординг 6.3 + accessibility + error states), Фаза 7 (метаданные + публикация).
МЕЛКИЕ ХВОСТЫ:
  - .gitignore: добавить audio-storage/, .env*, удалить app/-H app/-d.
  - Info.plist: ITSAppUsesNonExemptEncryption=false (export compliance не спрашивал каждый билд).
  - seed.js: замаскировать пароль в логе (по желанию).
  - Чат: индикатор «печатает...» (по желанию). Звуки — НЕ делать.
```

**От Анны:** уточнить ASC-ключ для верификации; $28 цена клиента или доход; наполнение Базовый/Премиум; реальные описания/обложки книг.

⚠️ **Полная картина оставшегося (сверка со STEP-BY-STEP.md 27.06):** сделаны Фазы 0-4 (код) + инфра + TestFlight. НЕ начато: Фаза 5 (ИИ), бóльшая часть Фазы 6 (профиль+7 подэкранов, админка React ~20ч, пуши, онбординг+опрос, accessibility, error states), вся Фаза 7 (публикация). + новые задачи вне плана (коды активации, лендинг, логика доступа клуба, продукты-разборы). «✅ по коду» ≠ протестировано вживую.

---

## УРОКИ (#28+; #1-27 в AC/AC-2)

**#28** — формат/версию пакета проверять по registry. `@apple/app-store-server-library` 3.1.0 CJS.

**#29 ⚠️** Apple-подписка: старт=момент покупки. Предпродажа невозможна → сайт. Деньги по дате Apple / контент по календарю.

**#30** — активация контента извне легальна (Kindle/Spotify), НО только нейтральное поле.

**#31 ⚠️ ГЛАВНОЕ:** Apple-оплата НЕ работает в РФ/РБ. Канал №1 — сайт+коды активации.

**#32** — ценообразование Apple: витрина = НДС + комиссия + Proceeds. Ориентир Proceeds. База США/USD.

**#33** — продукты-разборы через ASC API: создание ок, цены/скриншоты капризны. Сначала 1-2, потом массово.

**#34 ⚠️ ПРОЦЕСС:** AI-CONTEXT обновлять ПОЛНЫМ файлом (get → дописать → запушить целиком). create_or_update_file ПЕРЕЗАПИСЫВАЕТ весь файл.

**#35 ⚠️** Общий продакшен-сервер — изоляция обязательна (Node nvm, своя Mongo на своём порту, свой PM2 с interpreter, свой nginx). Чужое не трогать.

**#36 ⚠️** Секреты в логах скриптов: seed.js печатает MONGO_URI с паролем. Маскировать. Правки данных — через репозиторий.

**#37 ⚠️ APPLE INDIVIDUAL — ЛОКАЛЬНАЯ ПОДПИСЬ ПРИГЛАШЁННЫМ НЕДОСТИЖИМА (26.06).** В Individual-команде владелец не может дать разработчику команду в Xcode (только Personal Team видна). Решение: Codemagic + ASC API key. НЕ покупать «Purchase membership» под приглашённым.

**#38 ⚠️ CODEMAGIC АВТОПОДПИСЬ — НУЖЕН CERTIFICATE_PRIVATE_KEY (26.06).** Для `fetch-signing-files --create` нужен RSA-ключ в env `CERTIFICATE_PRIVATE_KEY` (Secret в группе, подключённой через `groups:`). Монорепо: codemagic.yaml в КОРНЕ, `working_directory: app`.

**#39 ⚠️ APPLE ВАЛИДАЦИЯ .ipa: iPad-ОРИЕНТАЦИИ (код 90474) (26.06).** `TARGETED_DEVICE_FAMILY="1,2"` без всех 4 ориентаций → reject. Вертикальное приложение: `="1"` (iPhone). Export Compliance «Ни один из алгоритмов» = exempt. Info.plist `ITSAppUsesNonExemptEncryption=false`. Внутр.тестер без beta review.

**#40 ⚠️ ОТЛАДКА: ЛОГИ ВАЖНЕЕ ДОГАДОК (27.06).** Баг «белый экран клуба» искали долго, потому что гадали (грешили на refresh-токен, на сокет — оба мимо). Прорыв дали ЛОГИ: добавили debug-print HTTP в `api_client.dart` + в провайдер, запустили `flutter run`, и увидели, что при открытии клуба **НЕТ HTTP-запроса вообще** — это сразу указало, что `ClubScreen` не строится (а не «запрос висит»). Мораль: при непонятном баге — сначала инструментировать (логи на каждом шаге), потом чинить. Не переписывать критические слои (api_client) по догадке. Серверный `pm2 logs` (живой режим + `pm2 flush` для очистки старого) — вторая половина картины. Юзер сам заметил «при открытии клуба логов нет» — это и был ключ.

**#41 ⚠️ checkAuth() ДОЛЖЕН ВЫЗЫВАТЬСЯ ПРИ СТАРТЕ (27.06).** `authProvider` стартует в статусе `initial`; в `authenticated`/`guest` переходит только через `checkAuth()` (читает токены) ИЛИ через явный логин. `main.dart` НЕ вызывал checkAuth при старте → после перезахода (без логина) статус навсегда `initial` → `GuestGate` (обёртка Клуба/Профиля) показывал вечную крутилку, не строя экран. Свежий логин маскировал баг (ставил authenticated вручную). Фикс: `await checkAuth()` в `main()` до runApp. Урок: проверка сессии при холодном старте — обязательна; гейты по auth-статусу должны иметь определённое состояние, а не висеть в initial.

**#42 ⚠️ EXPRESS ЗА NGINX: trust proxy (27.06).** express-rate-limit (и др. middleware, читающие IP) за обратным прокси падает с `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` если не выставлен `app.set('trust proxy', 1)`. Ставить ДО middleware, читающих IP. Для одного nginx перед приложением — значение `1`.

**#43 ⚠️ ПЕРЕВЫПУСК SIGNED URL ПРИ ОТДАЧЕ (27.06).** Если signed URL (картинки/аудио/голос с TTL) сохраняется в БД при создании, при отдаче истории он протухает. Решение: хранить в БД относительный путь (`*StoragePath`) и перевыпускать свежий signed URL на КАЖДОЙ отдаче (хелпер `withFreshMedia`), а не отдавать сохранённый. Касается reply-снапшотов тоже (рекурсивно).

**#44 (процессный) FLUTTER ПРАВКИ ВСЛЕПУЮ (27.06).** Claude не компилирует Flutter → правки тонких файлов чата делались малыми коммитами по файлам (не всё разом), чтобы при ошибке компиляции было ясно где. Юзер проверял локально `flutter run` (быстрый цикл), не Codemagic (20 мин). При большом объёме слепых правок — предупреждать о риске ошибки компиляции, держать коммиты атомарными.

---

*Обновлён 27.06.2026. **✅ TESTFLIGHT + ФИЗ.АЙФОН + APPLE SIGN IN. ✅ ЧАТ ДОВЕДЁН ДО TELEGRAM-УРОВНЯ. ✅ БАГ БЕЛОГО ЭКРАНА КЛУБА ИСПРАВЛЕН (checkAuth в main).** Сервер `api.chitatel.app` (Node20/nvm, Mongo Docker 27018, PM2, nginx+certbot, изолировано). Codemagic собирает iOS (codemagic.yaml в корне, Flutter 3.22.3, автоподпись ASC key `chitatel-key` + CERTIFICATE_PRIVATE_KEY). Только iPhone (device-family=1). Сессия 27.06: исправлены баги чата (удалённые, перемотка, дёрганье, оптимистичная отправка, клавиатура, телеграм-меню, эмодзи, фото) + серверные (trust proxy, shutdown, перевыпуск signed URL) + ГЛАВНЫЙ баг белого экрана клуба (checkAuth не вызывался при старте → GuestGate вечно крутил). Уроки #40-44 (логи важнее догадок, checkAuth при старте, trust proxy, перевыпуск signed URL, Flutter правки вслепую). ⏭️ Дальше: пересобрать билд + pm2 restart → проверить на айфоне → Анна в TestFlight → тест покупок → Terms/Privacy → логика клуба → коды активации. Прогресс фиксировать далее ТОЛЬКО здесь.*
