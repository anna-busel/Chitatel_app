# AI-CONTEXT-3 — ЧИТАТЕЛЬ (продолжение)

> **ТРЕТИЙ ФАЙЛ КОНТЕКСТА.** Предыдущие: `AI-CONTEXT.md` (база, Фазы 1-2, чат 4.1-4.8, уроки #1-19) и `AI-CONTEXT-2.md` (Фаза 4, задачи 1.3/1.7/1.8, уроки #20-27).
>
> **Порядок чтения для AI:** `AI-CONTEXT.md` → `AI-CONTEXT-2.md` → **этот файл**.
>
> **Прогресс фиксировать ДАЛЕЕ ТОЛЬКО ЗДЕСЬ.** Первые два не редактировать (архив).
>
> ⚠️ **Юзеру:** добавить упоминание `AI-CONTEXT-3.md` в Project Instructions проекта Claude.

---

## ТЕКУЩИЙ СТАТУС (на 28.06.2026)

**✅ ПРИЛОЖЕНИЕ В TESTFLIGHT И НА ФИЗ.АЙФОНЕ (26.06).** Первый билд Codemagic, Apple Sign In в проде.

**✅ ДЕПЛОЙ СЕРВЕРА (26.06).** `https://api.chitatel.app` HTTPS, своя MongoDB, каталог+клуб залиты.

**✅ ПОЛИРОВКА ЧАТА + БАГ БЕЛОГО ЭКРАНА КЛУБА (27.06).**

**✅ ВТОРАЯ ОТЛАДКА ЧАТА + РЕДИЗАЙН ЧАСТИЧНО ПРИМЕНЁН (27-28.06).** 3 серьёзных бага чата устранены (исчезающие = soft-delete+limit; кэш картинок = плавающий exp; дёрганье клавиатуры = AlertDialog). Закреп-связка завершена. **Юзер подтвердил, баги ушли на билде.** Редизайн: закреп кофейный + скругления/реакции ПРИМЕНЕНЫ; остальное осталось (см. блок РЕДИЗАЙН).

**Фаза 3 (Платежи) — КОД ГОТОВ + КАБИНЕТ + РУЧНЫЕ ШАГИ 3.2 СДЕЛАНЫ.** `.env` неполон (пусты APPLE_*_IAP, GOOGLE_CLIENT_ID, OPENAI_API_KEY, APNS_*). Sandbox-тестировщики и webhook URL — не настроены.

**⚠️ СТРАТЕГИЧЕСКОЕ: аудитория РФ+РБ+Грузия. Apple-оплата в РФ/РБ НЕ работает. Канал №1 по деньгам — САЙТ + КОДЫ АКТИВАЦИИ.**

---

## ✅ СЕССИЯ 27-28.06.2026 — ВТОРАЯ ОТЛАДКА ЧАТА + РЕДИЗАЙН

Юзер тестировал на билде, нашёл 3 бага. Все исправлены и запушены. Роль ассистента: исполнитель, читает код а не гадает, СПРАШИВАЕТ перед правками/откатами (юзер резко против действий без спроса).

### 🔴 БАГ A: ИСЧЕЗАЮЩИЕ СООБЩЕНИЯ (серверный, главное) — РЕШЁН `ea18610`
**Симптом:** «то 3, то 5, то 6 из 9» после перезахода. Юзер сам нащупал связь с УДАЛЕНИЕМ.
**Причина:** в `GET /chat` фильтр без `deletedAt`, `.limit(20)` к строкам ВКЛЮЧАЯ удалённые (soft-delete) → клиент `_notDeleted` их выбрасывал → непредсказуемо мало живых.
**Фикс:** `server/src/routes/club.js` — хелпер `liveMessagesFilter = (clubMonthId) => ({clubMonthId, isHidden:{$ne:true}, deletedAt:null})` в `GET /chat` и `/context`. В /context целевое проверяется на `deletedAt` (404). **БЕЗ РЕБИЛДА — только `git pull` + `pm2 restart`.**

### 🔴 БАГ B: КАРТИНКИ НЕ КЭШИРУЮТСЯ + СКАЧОК РАЗМЕРА — РЕШЁН (сервер `dfd19f9` + клиент `d0df5f3`)
**Причина кэша:** `audio.service.js generateSignedUrl`: `exp = Date.now()/1000 + ttl` — плавает при каждом вызове → sig/URL меняются → кэш мимо. **Длинный TTL НЕ помогает — важна СТАБИЛЬНОСТЬ ТОЧКИ ОТСЧЁТА exp.**
**Фикс сервера** (`dfd19f9`, `image.service.js`): `IMAGE_URL_FIXED_EXP = Math.floor(Date.UTC(2099,0,1)/1000)` + локальный signPayload + `generateImageSignedUrl` с фикс. exp. Аудио НЕ тронуто (TTL 1ч). Защита на подписи, картинка иммутабельна (uuid).
**Фикс клиента** (`d0df5f3`, `chat_message_bubble.dart _ChatImage`): `placeholder` → `progressIndicatorBuilder` (поверх в тех же констрейнтах) + minWidth/minHeight. Нет скачка. **Требует РЕБИЛД.** Проверять на НОВОЙ картинке после рестарта.

### 🔴 БАГ C: ДЁРГАНЬЕ КЛАВИАТУРЫ ПРИ УДАЛЕНИИ — РЕШЁН `d3a8f23`
**Симптом:** при открытой клавиатуре при удалении AlertDialog подтверждения → контент прыгает на высоту клавиатуры. Только при удалении.
**Причина:** AlertDialog — второй overlay поверх ещё-живой клавиатуры; при удалении она лишняя, но на миг возвращается и гасится диалогом → layout прыгает. Ключ дал юзер: «при других действиях клавиатура нужна, при удалении нет».
**Решение (путь А):** УБРАТЬ AlertDialog. `_deleteMessage` (`chat_tab.dart`): оптимистично `removeAt` сразу + SnackBar «Сообщение удалено · Отменить» (floating, тёмный textPrimary, кнопка терракота, 3800мс). Запрос через `Timer(4 сек)` → `_commitPendingDelete`. «Отменить» → `_undoPendingDelete` (вернуть на `_pendingDeleteIndex`). Поля `_deleteTimer/_pendingDeleteMessage/_pendingDeleteIndex/_pendingDeleteWasPinned`. `_flushPendingDelete` при новом удалении. В `dispose` дослать pending. **Требует РЕБИЛД. ✅ Юзер подтвердил: дёрганья нет.**

### ✅ СВЯЗКА ЗАКРЕПА (виден сразу при входе)
Сервер `12714b3` (`GET /chat` отдаёт `pinnedMessage` отдельным полем) + сервис `5c826fe` (`ChatHistoryResult.pinnedMessage`) + клиент `7966ccc` (поле `_pinnedMessage`, баннер из него). **Подтверждено юзером.**

### Прочее (НЕ делать)
- **Q&A ответы Анны из приложения** — НЕ делать. В `qa_tab.dart` ответить нельзя никому. На сервере поля под ответ есть, эндпоинта POST нет. По плану ответы — через АДМИНКУ (Фаза 6.6). Не блокер.
- «Моргание» при переходе к ДАЛЁКОМУ закрепу — характер ветки 3 `_jumpToMessage`, НЕ баг.

### ⏭️ Применить фиксы
- **Сервер** (`ea18610`, `dfd19f9`): `git checkout -- server/package-lock.json` → `git pull origin main` → `pm2 restart chitatel-api`. Исчезающие чинятся БЕЗ ребилда.
- **Приложение** (`d0df5f3`, `d3a8f23`, `7966ccc` + редизайн): новый билд Codemagic. Всё клиентское ВСЛЕПУЮ (Claude не компилирует Flutter) — при падении прислать лог.

---

## 🎨 РЕДИЗАЙН ЧАТА — ЧАСТИЧНО ПРИМЕНЁН (статус на 28.06)

Прототипы через visualize:show_widget (HTML в реальной палитре). **Только чат, остальное НЕ трогаем** (оно цельное). КОСМЕТИКА поверх рабочей логики. **Палитра строго из `app_colors.dart`** (terracotta `#C73E28`, фон `#FAFAF7`, surfaceLight `#F5F3EF`, surfaceMedium `#F0EDE8`, lightCoffee `#3A2018`, coral `#E8734A`).

### ✅ УЖЕ ПРИМЕНЕНО В КОД (требует ребилда, юзер ещё не смотрел на билде):
1. **Закреп — кофейная плашка** — `b3d4c4e`, `pinned_message_banner.dart`. Фон `lightCoffee #3A2018` (тёмный, макс. контраст — главный недостаток «сливался» решён), терракотовый квадрат-пин 30×30 (`#C73E28`, радиус 8, белая иконка push_pin), подпись «Закреплено · Имя» — `coral`, текст белый, chevron-right `white.opacity(0.55)`. Логика (preview image/voice/deleted, onTap) не тронута. ⚠️ coral подписи проверить на устройстве (не слишком ли ярко).
2. **Скругления пузырей 18px** (было 16) + асимметричные хвостики (свой острый снизу-справа 4px, чужой снизу-слева) + **реакции компактнее** (padding 9/4, эмодзи fontSize 16, обводка своей 1.4px) — `9d9d04c`, `chat_message_bubble.dart`.

### ⏳ ОСТАЛОСЬ ПРИМЕНИТЬ (порядок):
3. **Бейдж «АВТОР КЛУБА»** у Анны — ⚠️ БЫЛ НАЧАТ, PUSH ПРЕРВАЛСЯ, НЕ ЗАКОММИЧЕН. Делать заново. План (БЕЗ серверных изменений): у `ChatAuthor` ЕСТЬ поле `id` (проверено, модель `chat_message.dart`). В `chat_tab.dart`: собрать `Set<String> _adminIds` из `_mentionable.where((m)=>m.isAdmin).map((m)=>m.id)` в `_bootstrap` (там же `_isAdmin = _adminIds.contains(_currentUserId)`); метод `_authorIsAdmin(m) => _adminIds.contains(m.author.id)`; передать в бубл новый параметр `authorIsAdmin: _authorIsAdmin(m)`. В `chat_message_bubble.dart`: параметр `final bool authorIsAdmin`, флаг `showAuthorBadge = authorIsAdmin && !isMine`. Виджет `_AuthorBadge` (текст «АВТОР КЛУБА», fontSize 9, w700, letterSpacing 0.3, цвет terracotta на `terracotta.withOpacity(0.10)`, padding 6/1, радиус 8). Показывать рядом с именем — обернуть имя в Row(mainAxisSize.min) с Flexible(Text overflow ellipsis) + если showAuthorBadge: SizedBox(width 6) + _AuthorBadge (в обеих ветках inner: caption-картинка и текстовый пузырь). Полоска слева: `adminBorder = showAuthorBadge ? Border(left: BorderSide(terracotta, 2.5)) : null`, добавить в `decoration` обоих Container'ов inner (image+caption и текстовый). Юзер выбрал текст «Автор клуба» (из Ведущая/Куратор/Автор). Тестовый аккаунт Анны → потом реальный, код не меняется.
4. **Текстура бумаги на фоне** — фон остаётся СВЕТЛЫМ `#FAFAF7` (НЕ менять цвет!) + очень слабая зернистость (Вариант A). PNG-тайлом 64×64 (НЕ кодом). **Нужен ассет бумаги (PNG seamless, очень бледный).** В `chat_tab.dart` фон Container списка: `DecorationImage(image: AssetImage(...), repeat: ImageRepeat.repeat)`. ПОСЛЕДНЕЙ, отключаемой, проверять на устройстве (легко переборщить → дёшево). Юзер согласен что для книжного чата фишка, ПРИ условии что еле заметна.
5. **Разделители дат** — пилюля по центру «Сегодня/Вчера/5 июня», фон `surfaceMedium #F0EDE8`, текст `textTertiary`. В `chat_tab.dart` `itemBuilder` (reverse:true → сравнивать день m с днём следующего более старого index+1; заголовок когда день меняется или самый старый). ⚠️ `chat_tab.dart` критичный файл (там удаление) — осторожно.
6. **Аватар без дублей в серии** — несколько подряд от одного автора → аватар у одного, у остальных пустой отступ 32px. В `chat_tab.dart`. У всех остальных аватар как сейчас.

### ❌ ОТМЕНЕНО / НЕ делаем:
- ❌ **Галочки прочтения** — РЕШЕНО НЕ ДЕЛАТЬ (групповой чат, «✓✓» неоднозначны; readBy оставлен для будущей статистики Анны).
- ❌ кофейный/коричневый в ПУЗЫРЯХ (только в закрепе). Один акцент в ленте — терракота.
- ❌ книжный паттерн ИКОНКАМИ (криво, удешевляет).
- ❌ менять базовый цвет фона (держать `#FAFAF7`).
- ❌ трогать остальное приложение. ❌ градиенты пузырей. ❌ звуки. ❌ анимация перехода к далёкому закрепу.

### Процесс: переносить ПО ОДНОМУ, юзер проверяет на билде (Claude не компилирует Flutter — урок #44).

### Состояние файлов чата в репо (sha на 28.06):
- `pinned_message_banner.dart` — кофейная плашка применена (коммит `b3d4c4e`).
- `chat_message_bubble.dart` — sha `f77d6cd2` (скругления 18 + реакции; бейджа НЕТ).
- `chat_tab.dart` — sha `e79b53c8` (удаление SnackBar, закреп; БЕЗ authorIsAdmin/дат/аватар-серии).
- `chat_message.dart` (модель) — sha `cb9e5318`, у `ChatAuthor` есть `id`, `MessageReaction.containsUser`, `message.isMine`.
- `app_colors.dart` — sha `744f38803`.

---

## ✅ СЕССИЯ 27.06.2026 — ПОЛИРОВКА ЧАТА + БАГ БЕЛОГО ЭКРАНА КЛУБА

### 🔴 ГЛАВНЫЙ БАГ: белый экран клуба после перезахода (`60f3f4a`)
**Причина:** маршрут клуба в `GuestGate` (крутилка на initial/loading); `authProvider` стартует `initial`, в `authenticated` только через `checkAuth()`; **`main.dart` НЕ вызывал `checkAuth()` при старте** → после перезахода статус навсегда `initial` → GuestGate вечно крутит → ClubScreen не строится. Свежий логин работал (signIn ставит authenticated). Каталог работал (не в GuestGate). Диагностика: debug-логи HTTP показали что запрос клуба НЕ уходит.
**Фикс:** `await checkAuth()` в `main()` до runApp. **✅ Проверено юзером.**

### Баги чата (все исправлены)
1. Удалённые исчезают (`f25c7a3`) — `removeWhere` + фильтр `_notDeleted`. 2. Перемотка к закрепу/reply (`f25c7a3`) — jumpTo по индексу → endOfFrame → ensureVisible. 3. Дёрганье скролла (`f25c7a3`) — гистерезис кнопки «вниз» (300/120px). 4. Оптимистичная отправка (`3c235a3`) — `_insertOwnMessage(sent)` из ответа POST + дедуп по id. 5. Клавиатура закрывается (`3c235a3`) — GestureDetector(translucent)+unfocus + onDrag. 6. Телеграм-меню long-press (`644f487`) — `showGeneralDialog` + Scale/Fade (по центру), `_ActionMenuContent`/`_ActionTile`. 7. Эмодзи крупнее (`644f487`). 8. Фото после перезахода (`bc2fdeb`, СЕРВЕРНОЕ) — `withFreshMedia()` перевыпускает signed URL из `*StoragePath` на КАЖДОЙ отдаче. **Требует pm2 restart.**

### Серверные фиксы (по pm2 logs)
- `trust proxy` (`7b8228f`) — `app.set('trust proxy', 1)`. express-rate-limit за nginx падал ERR_ERL_UNEXPECTED_X_FORWARDED_FOR. **pm2 restart.**
- Graceful shutdown (`742e676`) — Mongoose 8 убрал callback → async/await. **pm2 restart.**
- Клиент: очередь параллельных 401 (`d13370`) — один refresh на всех. Debug-логи убраны (`171af17`,`d13370`).

### Осталось по чату (не блокеры): звуки — НЕ делать. Индикатор «печатает...» — по желанию.

---

## ✅ CODEMAGIC + TESTFLIGHT (26.06)

⚠️ **Аккаунт Анны Individual** → локальная Xcode-подпись приглашённым недостижима (юзер `g.akhmeteli89@gmail.com` Admin в ASC, в Xcode видит только Personal Team `669ZY8S56N`, команда Анны `3GS6F87RKZ` не появляется). Путь — Codemagic + ASC API key.
- **ASC API key:** Team Keys, Key ID `UN4ZB8T93H`, имя в Codemagic `chitatel-key`. ⚠️ Для верификации покупок возможно нужен ОТДЕЛЬНЫЙ ключ «Встроенная покупка».
- **Codemagic:** план Individual, GitHub App в `anna-busel`. `codemagic.yaml` в КОРНЕ (`working_directory: app`, коммит `79fa03d`). workflow `ios-testflight`: mac_mini_m2, Flutter 3.22.3, fetch-signing-files --create → build ipa. submit=false. groups `appstore_credentials`.
- ⚠️ **CERTIFICATE_PRIVATE_KEY** RSA в env (иначе подпись падает). НЕ в репо.
- Грабли (решены): No matching profiles → --create; Cannot save certs → CERTIFICATE_PRIVATE_KEY; код 90474 iPad-ориентации → `TARGETED_DEVICE_FAMILY "1,2"→"1"` (`a1e4c6e`).
- TestFlight: билд 1.0.0(1), Export Compliance exempt. Группа Internal Testing, добавлен ТОЛЬКО юзер. **Анну добавить ПОЗЖЕ.** На айфоне работает. ✅
- Пересобрать: Codemagic → Start new build → `ios-testflight`, main.

---

## ✅ ПОДКЛЮЧЕНИЕ К БОЕВОМУ СЕРВЕРУ (26.06)
- `api_endpoints.dart` (`b79eb68`): baseUrl через `String.fromEnvironment('API_BASE', defaultValue: 'https://api.chitatel.app')`. Локально `--dart-define=API_BASE=http://localhost:3000`.
- Ручные шаги 3.2: `flutter pub add in_app_purchase url_launcher`+pod install; роутер `367fe48`; Xcode capabilities IAP+Sign in, `Runner.entitlements` (`03086a6`); DEVELOPMENT_TEAM Personal `669ZY8S56N`; bundle `app.chitatel.ios`. Push с мака — PAT (`g1orgi89`).
- ⚠️ **TODO .gitignore:** добавить `audio-storage/`, `.env*`; удалить мусор `app/-H app/-d`. На сервере перед pull `git checkout -- server/package-lock.json`.

---

## ✅ ДЕПЛОЙ СЕРВЕРА (26.06)
VPS Contabo (общий с reader-bot), **строго изолированно**. SSH `deploy@161.97.102.73` (с мака по паролю). ⚠️ Чужие сайты/Node18/глобальный PM2 не трогать.
- Домен `chitatel.app` (Namecheap), A-записи api+@+www → 161.97.102.73. Node 20.20.2 nvm. Mongo Docker `chitatel-mongodb` mongo:8.0 `127.0.0.1:27018` root `chitatel_admin`. Бэкенд `/home/deploy/chitatel/Chitatel_app` (`npm audit fix --force` НЕ запускать). `.env` 600: есть PORT/MONGO_URI/секреты/APPLE_TEAM_ID=3GS6F87RKZ/BUNDLE=app.chitatel.ios; пусто APPLE_*_IAP/GOOGLE/OPENAI/APNS. AUDIO_BASE_PATH `/var/audio/chitatel`. PM2 `ecosystem.config.js` interpreter nvm node20, процесс `chitatel-api` (interpreter-правка только на сервере). nginx `api.chitatel.app` proxy→3000, WebSocket, client_max_body_size 12M. certbot до 24.09.2026. seed+seed:club прошли.
- **Тест-аккаунты прод:** anna@chitatel.app/anna123456 (admin), test-premium@chitatel.app/test123456 (premium), test-basic, test-expired (test123456).
- ХВОСТЫ: Mongo-пароль в логах seed (по желанию); заглушка «Нет описания» 3 книги; факультативы 7 разборов+обложка отсутствуют; seed-club +21→+31 не менять.
```bash
ssh deploy@161.97.102.73
cd /home/deploy/chitatel/Chitatel_app
git checkout -- server/package-lock.json
git pull origin main
cd server && npm install   # если менялись зависимости
pm2 restart chitatel-api   # ТОЛЬКО если менялся server/
pm2 logs chitatel-api
curl -s https://api.chitatel.app/api/health
```

---

## КАТАЛОГ (14.06) — 54 разбора + 10 пакетов. seed.js `2c893cd`, json `c8a2ccb`. Дослать (Анна): обложки #44-54+facultativ_tolstoy, описания 3, 7 факультативов, аудио. appleProductId=book.{slug}/package.{slug}.

## ✅ ЗАДАЧА 3.1 ASC (16.06) — Hanna Busel ИП Тбилиси, Paid Apps/W-8BEN/банк активны. SBP (15%) подана. Приложение «Читатель: книжный клуб» Apple ID 6779357856, bundle app.chitatel.ios. Продукты (group 22166930): club.basic.monthly (6781739637, $27.99), club.basic.season (3мес ~$54.99). 64 разбора non-consumable — позже скриптом.

## 🔑 МОДЕЛЬ ПОДПИСОК (15.06): беспл+IAP, в iOS только Apple. Месяц club.basic.monthly ~$28, Сезон 3мес club.basic.season ~$54 (ОДИН продукт автопродление). Сезонный тариф на paywall только в начале сезона. Доступ активного = скользящее окно «текущий+предыдущий месяц» (предыдущий=архив 31 день). Деньги по дате Apple/контент по календарю.

## 🧩 КОДЫ АКТИВАЦИИ (РФ/РБ) — ПРИОРИТЕТ ВЫСОКИЙ, КАНАЛ №1. Оплата на сайте→код→нейтральное поле в приложении→сервер открывает доступ. ⚠️ Apple: только нейтральное поле, БЕЗ рекламы внешней покупки (Kindle/Spotify). Модель `ActivationCode`.

## ЗАДАЧИ 3.3/3.4/3.2 ✅ ГОТОВО: верификация Purchase.js/purchases.js/purchase.service.js (+@apple/app-store-server-library 3.1.0), ⚠️subscriptionPlan enum без 'season', APPLE_*_IAP пусто. webhook `/api/webhooks/apple`. paywall purchase_service/provider/success/paywall screens. Terms/Privacy заглушки.

---

## ДАЛЬШЕ ПО ПЛАНУ
```
✅ Сервер, приложение против прода, Codemagic+TestFlight+Apple Sign In
✅ Полировка чата + баг белого экрана (checkAuth) [27.06]
✅ Вторая отладка чата (исчезающие/картинки/клавиатура) [27-28.06], юзер подтвердил баги ушли
🔄 Редизайн чата В ПРОЦЕССЕ: ✅ закреп кофейный (b3d4c4e)+скругления/реакции (9d9d04c); ⏳ осталось бейдж «Автор клуба» (push прервался — делать заново) → текстура бумаги (PNG-тайл) → разделители дат → аватар-серия. Галочки ОТМЕНЕНЫ. Только чат.
СЛЕДУЮЩЕЕ:
  1. Серверные фиксы (ea18610, dfd19f9): pull+pm2 restart [возможно уже сделано].
  2. Пересобрать билд Codemagic → проверить редизайн (закреп кофейный, скругления, реакции).
  3. Доделать редизайн по одному (бейдж→текстура→даты→аватар-серия).
  4. Анну в Internal Testing → удалённый тест.
  5. ТЕСТ ПОКУПОК: ASC ключ верификации → APPLE_*_IAP в .env (+root certs, +APPLE_APP_APPLE_ID=6779357856, +APPLE_ENVIRONMENT=sandbox). Свериться с purchase.service.js. Webhook в ASC + sandbox-аккаунты. pm2 restart.
  6. Privacy+Terms+Support на chitatel.app (ревью Apple).
  7. Логика доступа к клубу (скользящее окно+31 день+сезоны+окна продаж).
  8. Коды активации (РФ/РБ — КАНАЛ №1).
  9. Продукты-разборы в Apple (64 non-consumable).
  10. Фаза 5 (ИИ-дневник), Фаза 6 (профиль 6.2+админка 6.6+пуши 6.1+онбординг 6.3+accessibility+error states+account deletion), Фаза 7 (публикация).
ХВОСТЫ: .gitignore (audio-storage/, .env*, удалить app/-H app/-d); Info.plist ITSAppUsesNonExemptEncryption=false; seed.js пароль; subscriptionPlan enum +'season'; индикатор печатает (по желанию).
```
**БЛОКЕРЫ РЕВЬЮ APPLE:** account deletion (reject 5.1.1(v)), Privacy+Support URL, UGC-модерация (блокировка+EULA), убрать заглушки `_Placeholder`.
**От Анны:** ASC-ключ верификации (тип); $28 цена клиента или доход; наполнение Базовый/Премиум; реальные описания/обложки.
⚠️ Сделаны Фазы 0-4 (код)+инфра+TestFlight. НЕ начато: Фаза 5 (ИИ), бóльшая часть Фазы 6 (профиль+7 подэкранов, админка React ~20ч включая ОТВЕТЫ Q&A, пуши, онбординг, accessibility, error states, account deletion), вся Фаза 7. + вне плана (коды активации, лендинг, логика клуба, продукты-разборы, редизайн чата). «✅ по коду» ≠ протестировано вживую.

---

## УРОКИ (#28+; #1-27 в AC/AC-2)
**#28** формат пакета по registry. **#29** Apple-подписка старт=покупка, предпродажа невозможна. **#30** активация извне легальна (Kindle/Spotify) только нейтральное поле. **#31 ⚠️** Apple-оплата НЕ в РФ/РБ → сайт+коды №1. **#32** ценообразование Apple (Proceeds, база США). **#33** продукты-разборы через ASC API капризны, сначала 1-2. **#34 ⚠️** AI-CONTEXT обновлять ПОЛНЫМ файлом (перезаписывается). **#35 ⚠️** общий сервер — изоляция (nvm/своя Mongo/свой PM2/nginx). **#36 ⚠️** секреты в логах маскировать. **#37 ⚠️** Apple Individual — локальная подпись приглашённым недостижима → Codemagic+ASC key. **#38 ⚠️** Codemagic автоподпись — нужен CERTIFICATE_PRIVATE_KEY, codemagic.yaml в КОРНЕ. **#39 ⚠️** .ipa iPad-ориентации (90474) → TARGETED_DEVICE_FAMILY="1", Export Compliance exempt, ITSAppUsesNonExemptEncryption=false.

**#40 ⚠️ ЛОГИ ВАЖНЕЕ ДОГАДОК (27.06).** Баг белого экрана искали догадками (refresh-токен, сокет — мимо). Прорыв — debug-print HTTP показал что запроса клуба НЕТ → ClubScreen не строится. Сначала инструментировать.

**#41 ⚠️ checkAuth() ПРИ СТАРТЕ (27.06).** authProvider стартует initial, в authenticated только через checkAuth/логин. main.dart не вызывал → GuestGate вечно крутил. Фикс: await checkAuth() в main() до runApp.

**#42 ⚠️ trust proxy (27.06).** express-rate-limit за nginx падает ERR_ERL_UNEXPECTED_X_FORWARDED_FOR без `app.set('trust proxy', 1)`.

**#43 ⚠️ ПЕРЕВЫПУСК SIGNED URL ПРИ ОТДАЧЕ (27.06).** signed URL с TTL в БД протухает → хранить относительный путь (`*StoragePath`), перевыпускать на КАЖДОЙ отдаче (`withFreshMedia`), рекурсивно для reply.

**#44 (процесс) FLUTTER ВСЛЕПУЮ (27.06).** Claude не компилирует Flutter → малые коммиты, юзер проверяет билд. Атомарные коммиты, предупреждать о риске компиляции.

**#45 ⚠️⚠️ SOFT-DELETE + LIMIT (28.06).** Удалённые фильтруются ТОЛЬКО на клиенте + `.limit(N)` к строкам ВКЛЮЧАЯ удалённые → непредсказуемо мало живых, «пропадают». Фильтровать `deletedAt:null` В ЗАПРОСЕ (на сервере, ДО лимита), консистентно во ВСЕХ эндпоинтах. При «данные пропадают непредсказуемо» сразу спросить про удаление. Чинится без ребилда.

**#46 ⚠️⚠️ СТАБИЛЬНОСТЬ SIGNED URL = СТАБИЛЬНОСТЬ ТОЧКИ ОТСЧЁТА exp, НЕ ДЛИНА TTL (28.06).** `exp=Date.now()+TTL` → URL меняется каждую генерацию → кэш мимо. Иммутабельный контент — exp ФИКСИРОВАННОЙ КОНСТАНТОЙ (2099). Аудио оставить TTL 1ч.

**#47 ⚠️ ДЁРГАНЬЕ LAYOUT ОТ OVERLAY НА КЛАВИАТУРЕ (28.06).** AlertDialog поверх ещё-живой клавиатуры → пересчёт viewInsets → прыжок. Проявляется когда действие не требует ввода (удаление). Решение: убрать диалог (телеграм: оптимистично + SnackBar «Отменить»). Ключ дал юзер.

**#48 (процесс) ДИЗАЙН ЧЕРЕЗ ПРОТОТИПЫ (28.06).** Прототипы через visualize:show_widget (HTML в реальной палитре) до правки кода. НЕ рисовать иконки/паттерны кодом (криво). Текстуры — PNG-тайлом. Дизайн ПОСЛЕ стабилизации, по одному элементу с проверкой на билде. Минимум цветов (1 акцент терракота; кофейный только в служебном закрепе). Не менять базовый фон. СПРАШИВАТЬ перед правкой/откатом.

---

*Обновлён 28.06.2026. **✅ TESTFLIGHT+ФИЗ.АЙФОН+APPLE SIGN IN. ✅ ЧАТ: 3 БАГА ИСПРАВЛЕНЫ (исчезающие=soft-delete+limit ea18610; кэш картинок=фикс.exp dfd19f9/d0df5f3; дёрганье клавиатуры=AlertDialog→SnackBar d3a8f23), юзер подтвердил. ✅ ЗАКРЕП-СВЯЗКА 7966ccc. 🔄 РЕДИЗАЙН В ПРОЦЕССЕ: закреп кофейный b3d4c4e + скругления/реакции 9d9d04c ПРИМЕНЕНЫ; осталось бейдж Автор клуба (push прервался, делать заново)+текстура бумаги PNG+разделители дат+аватар-серия; галочки отменены.** Сервер api.chitatel.app (Node20/nvm, Mongo Docker 27018, PM2, nginx+certbot). Codemagic iOS (yaml в корне, Flutter 3.22.3, ASC key+CERTIFICATE_PRIVATE_KEY). device-family=1. ⏭️ Пересобрать билд → проверить редизайн → доделать по одному → Анна в TestFlight → тест покупок → Terms/Privacy → логика клуба → коды активации. Уроки #45-48. Прогресс фиксировать далее ТОЛЬКО здесь.*
