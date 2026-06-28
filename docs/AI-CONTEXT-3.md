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

**✅ ПРИЛОЖЕНИЕ В TESTFLIGHT И НА ФИЗ.АЙФОНЕ (26.06).** Первый билд Codemagic, Apple Sign In в проде. Анна уже установила TestFlight (приглашение в Internal Testing ещё НЕ отправлено — добавить через ASC → TestFlight → Internal Testing; Анна = Account Holder, есть в Users and Access).

**✅ ДЕПЛОЙ СЕРВЕРА (26.06).** `https://api.chitatel.app` HTTPS, своя MongoDB, каталог+клуб залиты.

**✅ ПОЛИРОВКА ЧАТА + БАГ БЕЛОГО ЭКРАНА КЛУБА (27.06).**

**✅ ВТОРАЯ ОТЛАДКА ЧАТА (27-28.06).** 3 серьёзных бага чата устранены (исчезающие = soft-delete+limit; кэш картинок = плавающий exp; дёрганье клавиатуры = AlertDialog). Закреп-связка завершена. **Юзер подтвердил, баги ушли на билде.**

**✅ РЕДИЗАЙН ЧАТА ПОЛНОСТЬЮ ПРИМЕНЁН В КОД (28.06).** Все 6 пунктов запушены (см. блок РЕДИЗАЙН). Ждёт проверки на билде. Косметика, только чат.

**Фаза 3 (Платежи) — КОД ГОТОВ + КАБИНЕТ + РУЧНЫЕ ШАГИ 3.2 СДЕЛАНЫ.** `.env` неполон (пусты APPLE_*_IAP, GOOGLE_CLIENT_ID, OPENAI_API_KEY, APNS_*). Sandbox-тестировщики и webhook URL — не настроены.

**⚠️ СТРАТЕГИЧЕСКОЕ: аудитория РФ+РБ+Грузия. Apple-оплата в РФ/РБ НЕ работает. Канал №1 по деньгам — САЙТ + КОДЫ АКТИВАЦИИ.**

---

## 🚨 ТЕХДОЛГ К ФАЗЕ 6 (ПОЛИРОВКА) — НАЙДЕНО ПРИ АУДИТЕ 28.06

> Всплыло при разборе вопроса Анны про жалобы. Доделать ДО сабмита в App Store. Не косметика — это требования/недоделки плана.

### 🔴 БЛОКИРОВКА ПОЛЬЗОВАТЕЛЯ — НЕ РЕАЛИЗОВАНА (MVP + Apple Guideline 1.2, БЛОКЕР РЕВЬЮ)
**Статус:** жалоба («Пожаловаться») работает и шлёт `Report` (pending) на сервер. А вот **самостоятельной блокировки пользователя участником НЕТ** — ни на сервере, ни в приложении. Подтверждено чтением кода 28.06:
- `server/src/models/User.js` — поля `blockedUsers[]` НЕТ (есть только `isBanned`/`mutedUntil` — это инструменты модератора-Анны, не self-service).
- `server/src/routes/club.js` — эндпоинтов `POST/DELETE /api/users/:id/block` НЕТ. Socket.io НЕ фильтрует заблокированных.
- Шторка жалобы во Flutter (`report_sheet`/`chat_tab`) — toggle «Заблокировать пользователя», скорее всего, отсутствует (проверить при реализации).

**Это НЕ «забытая придумка», а недоделанный пункт плана.** Заложено в:
- `STEP-BY-STEP.md` Задача 4.2: `POST /api/users/:id/block` → `blockedUsers[]` + фильтрация; `DELETE .../block`.
- `STEP-BY-STEP.md` Задача 4.3: Socket.io «не отправлять сообщения от заблокированных».
- `STEP-BY-STEP.md` Задача 4.5: шторка жалобы (4.36) = «6 причин + toggle Заблокировать»; чеклист «Report + Block → сообщения скрыты».
- `MASTER.md` 4.35/4.36 (кнопка «Заблокировать пользователя»), 7.4 (эндпоинты block), 6.1 п.8 (UGC: Report + Block — статус ✅ ОШИБОЧНО, block не сделан), секция 8 (MVP: «Жалобы и блокировки»).

**Почему важно:** Apple 1.2 для UGC требует 4 вещи — фильтр контента (есть: запрет ссылок), **репорт** (есть), **блокировка обидчика пользователем** (НЕТ), реакция модератора ≤24ч (через админку, Фаза 6.6 — админки ещё нет). Отсутствие self-service блокировки — частая причина reject по 1.2.

**Объём (НЕ начинать без согласования + чтения MASTER, оформить как задачу):**
- Сервер (нужен `git pull`+`pm2 restart`): `blockedUsers[]` в User; `POST/DELETE /api/users/:id/block`; фильтрация в выдаче истории чата (`liveMessagesFilter`/выдача) и в Socket.io эмите.
- Клиент (ребилд): toggle/кнопка «Заблокировать» в шторке жалобы; локально прятать сообщения заблокированных.
- Док: галочку в MASTER 6.1 п.8 не считать закрытой, пока не сделано.

**Решение юзера (28.06):** добавить блок в техдолг, доделать В КОНЦЕ на Фазе полировки (не сейчас).

### 🟡 ТЁМНАЯ ТЕМА — Post-MVP, НЕ блокер
Спрашивал юзер. Проверено: `MASTER.md` 6.2 («Dark Mode — Post-MVP») и секция 8 (в списке «НЕ входит в MVP»). **Apple НЕ требует** тёмную тему для ревью (это «рекомендуется», не «обязательно»). К запуску не нужна, риска отказа нет. Оставляем на потом, в техдолг можно НЕ тащить как блокер.

### Прочее из техдолга (уже было в плане, не потерять):
- **Account deletion** — реальное удаление данных ≤24ч (Apple 5.1.1(v), БЛОКЕР). Экран есть, серверный flow проверить/доделать (Фаза 6).
- **Privacy + Terms + Support URL** на chitatel.app — сейчас заглушки (БЛОКЕР ревью).
- **Админка Анны (Фаза 6.6)** — разбор жалоб (hide/warn/mute/ban), ответы Q&A. Без неё «реакция ≤24ч» формально не закрыта.
- Убрать заглушки `_Placeholder` перед сабмитом.

---

## ✅ СЕССИЯ 28.06.2026 — РЕДИЗАЙН ЧАТА ДОВЕДЁН ДО КОНЦА

Все оставшиеся пункты редизайна применены и запушены. Косметика поверх рабочей логики, только чат. Палитра строго из `app_colors.dart`. Claude не компилирует Flutter (урок #44) → ждёт проверки на билде.

### Что добавлено в этой сессии:
3. **Бейдж «АВТОР КЛУБА» + полоска слева** у сообщений Анны (автор-админ) — коммиты `34f1824` (`chat_message_bubble.dart`: параметр `authorIsAdmin`, флаг `showAuthorBadge=authorIsAdmin && !isMine`, виджет `_AuthorBadge` terracotta на `terracotta.withOpacity(0.10)` fontSize 9 w700, `adminBorder` левая полоска terracotta 2.5px в обеих ветках inner) + `b0eca94` (`chat_tab.dart`: `Set<String> _adminIds` из `_mentionable.where(isAdmin)` в `_bootstrap`, `_authorIsAdmin(m)`, проброс `authorIsAdmin`).
4. **Текстура бумаги на фоне** — `649d32a`. ⚠️ РЕАЛИЗОВАНО НЕ PNG (план с PNG-тайлом ОТМЕН�ён): прототип-HTML показал, что «бумага» = чистый CSS-паттерн из точек (radial-gradient 1px точки, шаг 3px, rgba(150,130,100,0.045)). В Dart сделано `_PaperTexturePainter` (CustomPainter, `canvas.drawCircle` r=0.6, шаг 3.0) внутри `Positioned.fill > RepaintBoundary > CustomPaint` ПОД списком. База фона `#FAFAF7` НЕ менялась. Прозрачность вынесена в ЕДИНУЮ top-level const `_paperDotOpacity = 0.08` вверху `chat_tab.dart` (поднята с прототипных 0.045 — юзер одобрил превышение, чтобы читалось на телефоне). ⚠️ Крутить эту одну цифру если на устройстве слабо/сильно.
5. **Разделители дат** — пилюля по центру «Сегодня/Вчера/5 июня», фон `surfaceMedium #F0EDE8`, текст `textTertiary` w500, радиус 12. Коммит `1215f7e9` (`chat_tab.dart`). Хелперы top-level `_formatDateLabel(dt)` (Сегодня/Вчера/«D месяц» родит. падеж, +год для прошлых лет, сравнение toLocal) и `_sameDay(a,b)`. В `itemBuilder` (reverse:true → сосед сверху/старше = index+1): `showDateHeader` над самым старым сообщением дня; виджет `_DateSeparator`.
6. **Аватар без дублей в серии** — коммит `1215f7e9` (тот же, `chat_tab.dart` + `chat_message_bubble.dart`). У чужих сообщений аватар только у первого в серии того же автора (после смены автора/дня/у самого старого); у остальных пустой `SizedBox(width:32)` для выравнивания. Флаг `showAvatar=!prevSameAuthor` считается в `chat_tab`, новый параметр `showAvatar` в `ChatMessageBubble` (default true; имя НЕ дедуплицируется — только аватар, по плану).

⚠️ Мелочь: в коммите `1215f7e9` в ОДНОМ `///`-комментарии `chat_message_bubble.dart` (~стр. 504, доккоммент `_ActionMenuContent`) опечатка при ручном кодировании кириллицы — «применялall к всей» вместо «применялась ко всей». На компиляцию/работу НЕ влияет (комментарий). Поправить при следующей правке этого файла.

### Итог редизайна (все 6 пунктов в коде, ждут билда):
1. ✅ Закреп кофейный `b3d4c4e`. 2. ✅ Скругления 18px + хвостики + компактные реакции `9d9d04c`. 3. ✅ Бейдж «Автор клуба» + полоска `34f1824`+`b0eca94`. 4. ✅ Текстура (CSS-точки CustomPainter, НЕ PNG) `649d32a`. 5. ✅ Разделители дат `1215f7e9`. 6. ✅ Аватар-серия `1215f7e9`.
**ОТМЕНЕНО:** галочки прочтения; кофейный/коричневый в пузырях (только закреп); книжный паттерн иконками; смена базового фона.

### Состояние файлов чата в репо (sha на 28.06, после редизайна):
- `pinned_message_banner.dart` — кофейная плашка (`b3d4c4e`).
- `chat_message_bubble.dart` — HEAD после `1215f7e9` (скругления+реакции+бейдж+showAvatar). До этого `34f1824`.
- `chat_tab.dart` — HEAD после `1215f7e9` (удаление SnackBar, закреп, _adminIds/бейдж, текстура `_PaperTexturePainter`+`_paperDotOpacity`, даты `_DateSeparator`, аватар-серия). До этого `649d32a`.
- `chat_message.dart` (модель) — `cb9e5318`, у `ChatAuthor` есть `id`/`name`/`avatarUrl`, `MessageReaction.containsUser`, `message.isMine`.
- `app_colors.dart` — `744f38803`.

---

## ✅ СЕССИЯ 27-28.06.2026 — ВТОРАЯ ОТЛАДКА ЧАТА

Роль ассистента: исполнитель, читает код а не гадает, СПРАШИВАЕТ перед правками/откатами (юзер резко против действий без спроса).

### 🔴 БАГ A: ИСЧЕЗАЮЩИЕ СООБЩЕНИЯ (серверный) — РЕШЁН `ea18610`
**Симптом:** «то 3, то 5, то 6 из 9» после перезахода. Юзер сам нащупал связь с УДАЛЕНИЕМ.
**Причина:** в `GET /chat` фильтр без `deletedAt`, `.limit(20)` к строкам ВКЛЮЧАЯ удалённые (soft-delete) → клиент `_notDeleted` их выбрасывал → непредсказуемо мало живых.
**Фикс:** `server/src/routes/club.js` — `liveMessagesFilter = (clubMonthId) => ({clubMonthId, isHidden:{$ne:true}, deletedAt:null})` в `GET /chat` и `/context`. **БЕЗ РЕБИЛДА — `git pull` + `pm2 restart`.**

### 🔴 БАГ B: КАРТИНКИ НЕ КЭШИРУЮТСЯ + СКАЧОК — РЕШЁН (сервер `dfd19f9` + клиент `d0df5f3`)
**Причина кэша:** `audio.service.js`: `exp = Date.now()/1000 + ttl` — плавает → URL меняется → кэш мимо.
**Фикс сервера** (`dfd19f9`, `image.service.js`): `IMAGE_URL_FIXED_EXP = Math.floor(Date.UTC(2099,0,1)/1000)` + `generateImageSignedUrl` с фикс. exp. Аудио НЕ тронуто (TTL 1ч).
**Фикс клиента** (`d0df5f3`, `_ChatImage`): `progressIndicatorBuilder` + minWidth/minHeight. **Ребилд.** Проверять на НОВОЙ картинке после рестарта.

### 🔴 БАГ C: ДЁРГАНЬЕ КЛАВИАТУРЫ ПРИ УДАЛЕНИИ — РЕШЁН `d3a8f23`
**Причина:** AlertDialog — overlay поверх ещё-живой клавиатуры → layout прыгает.
**Решение (путь А):** убрать AlertDialog. `_deleteMessage`: оптимистичный `removeAt` + SnackBar «Сообщение удалено · Отменить» (floating, textPrimary, терракота, 3800мс). Запрос через `Timer(4 сек)` → `_commitPendingDelete`. «Отменить» → `_undoPendingDelete`. Поля `_deleteTimer/_pendingDelete*`. В `dispose` дослать pending. **Ребилд. ✅ Юзер подтвердил.**

### ✅ СВЯЗКА ЗАКРЕПА
Сервер `12714b3` + сервис `5c826fe` + клиент `7966ccc`. **Подтверждено юзером.**

### ⏭️ Применить фиксы
- **Сервер** (`ea18610`, `dfd19f9`): `git checkout -- server/package-lock.json` → `git pull` → `pm2 restart chitatel-api`. Исчезающие чинятся БЕЗ ребилда.
- **Приложение:** новый билд Codemagic. Всё клиентское ВСЛЕПУЮ — при падении прислать лог.

---

## ✅ СЕССИЯ 27.06.2026 — ПОЛИРОВКА ЧАТА + БАГ БЕЛОГО ЭКРАНА КЛУБА

### 🔴 ГЛАВНЫЙ БАГ: белый экран клуба после перезахода (`60f3f4a`)
**Причина:** `main.dart` НЕ вызывал `checkAuth()` при старте → authProvider навсегда `initial` → GuestGate вечно крутит → ClubScreen не строится. Каталог работал (не в GuestGate).
**Фикс:** `await checkAuth()` в `main()` до runApp. **✅ Проверено юзером.**

### Баги чата (исправлены)
1. Удалённые исчезают (`f25c7a3`). 2. Перемотка к закрепу/reply (`f25c7a3`). 3. Дёрганье скролла — гистерезис 300/120px (`f25c7a3`). 4. Оптимистичная отправка (`3c235a3`). 5. Клавиатура закрывается (`3c235a3`). 6. Телеграм-меню long-press `showGeneralDialog`+Scale/Fade (`644f487`). 7. Эмодзи крупнее (`644f487`). 8. Фото после перезахода — `withFreshMedia()` (`bc2fdeb`, СЕРВЕРНОЕ, pm2 restart).

### Серверные фиксы
- `trust proxy` (`7b8228f`). Graceful shutdown async/await (`742e676`). Очередь 401 → один refresh (`d13370`). Debug убраны (`171af17`,`d13370`).

---

## ✅ CODEMAGIC + TESTFLIGHT (26.06)

⚠️ **Аккаунт Анны Individual** → локальная Xcode-подпись приглашённым недостижима (команда Анны `3GS6F87RKZ` не появляется в Xcode у `g.akhmeteli89@gmail.com`). Путь — Codemagic + ASC API key.
- **ASC API key:** Team Keys, Key ID `UN4ZB8T93H`, в Codemagic `chitatel-key`. ⚠️ Для верификации покупок возможно нужен ОТДЕЛЬНЫЙ ключ.
- **Codemagic:** Individual, GitHub App в `anna-busel`. `codemagic.yaml` в КОРНЕ (`working_directory: app`, `79fa03d`). workflow `ios-testflight`: mac_mini_m2, Flutter 3.22.3, fetch-signing-files --create → build ipa. submit=false. groups `appstore_credentials`.
- ⚠️ **CERTIFICATE_PRIVATE_KEY** RSA в env. НЕ в репо.
- Грабли (решены): No matching profiles → --create; Cannot save certs → CERTIFICATE_PRIVATE_KEY; 90474 iPad-ориентации → `TARGETED_DEVICE_FAMILY "1,2"→"1"` (`a1e4c6e`).
- TestFlight: билд 1.0.0(1), Export Compliance exempt. Группа Internal Testing, добавлен ТОЛЬКО юзер. **Анна установила TestFlight, но в Internal Testing ещё НЕ добавлена — приглашение отправить (ASC → TestFlight → Internal Testing → группа → добавить Анну; нужна обработанная сборка). После добавления Анне придёт письмо-приглашение (разово), дальше сборки прилетают в TestFlight без писем.**
- Пересобрать: Codemagic → Start new build → `ios-testflight`, main.

---

## ✅ ПОДКЛЮЧЕНИЕ К БОЕВОМУ СЕРВЕРУ (26.06)
- `api_endpoints.dart` (`b79eb68`): baseUrl через `String.fromEnvironment('API_BASE', defaultValue:'https://api.chitatel.app')`. Локально `--dart-define=API_BASE=http://localhost:3000`.
- Ручные шаги 3.2: `flutter pub add in_app_purchase url_launcher`+pod install; роутер `367fe48`; Xcode capabilities IAP+Sign in, `Runner.entitlements` (`03086a6`); DEVELOPMENT_TEAM Personal `669ZY8S56N`; bundle `app.chitatel.ios`. Push с мака — PAT (`g1orgi89`).
- ⚠️ **TODO .gitignore:** `audio-storage/`, `.env*`; удалить мусор `app/-H app/-d`. На сервере перед pull `git checkout -- server/package-lock.json`.

---

## ✅ ДЕПЛОЙ СЕРВЕРА (26.06)
VPS Contabo (общий с reader-bot), **строго изолированно**. SSH `deploy@161.97.102.73` (с мака по паролю). ⚠️ Чужие сайты/Node18/глобальный PM2 не трогать.
- Домен `chitatel.app` (Namecheap), A-записи api+@+www → 161.97.102.73. Node 20.20.2 nvm. Mongo Docker `chitatel-mongodb` mongo:8.0 `127.0.0.1:27018` root `chitatel_admin`. Бэкенд `/home/deploy/chitatel/Chitatel_app` (`npm audit fix --force` НЕ запускать). `.env` 600: есть PORT/MONGO_URI/секреты/APPLE_TEAM_ID=3GS6F87RKZ/BUNDLE=app.chitatel.ios; пусто APPLE_*_IAP/GOOGLE/OPENAI/APNS. AUDIO_BASE_PATH `/var/audio/chitatel`. PM2 `ecosystem.config.js` interpreter nvm node20, процесс `chitatel-api`. nginx `api.chitatel.app` proxy→3000, WebSocket, client_max_body_size 12M. certbot до 24.09.2026. seed+seed:club прошли.
- **Тест-аккаунты прод:** anna@chitatel.app/anna123456 (admin), test-premium@chitatel.app/test123456 (premium), test-basic, test-expired (test123456).
- ХВОСТЫ: Mongo-пароль в логах seed; заглушка «Нет описания» 3 книги; факультативы 7 разборов+обложка отсутствуют; seed-club +21→+31 не менять.
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
⚠️ **Редизайн чата СЕРВЕР НЕ ТРОГАЛ** — для редизайна `git pull`/`pm2 restart` НЕ нужны. Серверный pull нужен только для фиксов `ea18610`/`dfd19f9` (если ещё не применены) и будущей блокировки.

---

## КАТАЛОГ (14.06) — 54 разбора + 10 пакетов. seed.js `2c893cd`, json `c8a2ccb`. Дослать (Анна): обложки #44-54+facultativ_tolstoy, описания 3, 7 факультативов, аудио. appleProductId=book.{slug}/package.{slug}.

## ✅ ЗАДАЧА 3.1 ASC (16.06) — Hanna Busel ИП Тбилиси, Paid Apps/W-8BEN/банк активны. SBP (15%) подана. Приложение «Читатель: книжный клуб» Apple ID 6779357856, bundle app.chitatel.ios. Продукты (group 22166930): club.basic.monthly (6781739637, $27.99), club.basic.season (3мес ~$54.99). 64 разбора non-consumable — позже скриптом.

## 🔑 МОДЕЛЬ ПОДПИСОК (15.06): беспл+IAP, в iOS только Apple. Месяц club.basic.monthly ~$28, Сезон 3мес club.basic.season ~$54 (ОДИН продукт автопродление). Сезонный тариф на paywall только в начале сезона. Доступ активного = скользящее окно «текущий+предыдущий месяц». Деньги по дате Apple/контент по календарю.

## 🧩 КОДЫ АКТИВАЦИИ (РФ/РБ) — ПРИОРИТЕТ ВЫСОКИЙ, КАНАЛ №1. Оплата на сайте→код→нейтральное поле в приложении→сервер открывает доступ. ⚠️ Apple: только нейтральное поле, БЕЗ рекламы внешней покупки. Модель `ActivationCode`.

## ЗАДАЧИ 3.3/3.4/3.2 ✅ ГОТОВО: верификация Purchase.js/purchases.js/purchase.service.js (+@apple/app-store-server-library 3.1.0), ⚠️subscriptionPlan enum без 'season', APPLE_*_IAP пусто. webhook `/api/webhooks/apple`. paywall purchase_service/provider/success/paywall screens. Terms/Privacy заглушки.

---

## ДАЛЬШЕ ПО ПЛАНУ
```
✅ Сервер, приложение против прода, Codemagic+TestFlight+Apple Sign In
✅ Полировка чата + баг белого экрана (checkAuth) [27.06]
✅ Вторая отладка чата (исчезающие/картинки/клавиатура) [27-28.06], юзер подтвердил
✅ Редизайн чата ПОЛНОСТЬЮ применён в код [28.06]: закреп кофейный b3d4c4e, скругления/реакции 9d9d04c, бейдж Автор клуба 34f1824+b0eca94, текстура (CSS-точки CustomPainter) 649d32a, разделители дат 1215f7e9, аватар-серия 1215f7e9. Галочки отменены. Только чат.
СЛЕДУЮЩЕЕ:
  1. Серверные фиксы (ea18610, dfd19f9): pull+pm2 restart [возможно уже сделано].
  2. Пересобрать билд Codemagic → проверить ВЕСЬ редизайн на устройстве (закреп, скругления, реакции, бейдж, текстура — крутить _paperDotOpacity если надо, даты, аватары).
  3. Анну в Internal Testing → удалённый тест.
  4. 🚨 ТЕХДОЛГ Фазы 6: БЛОКИРОВКА пользователя (MVP/Apple 1.2 — блокер ревью; см. блок ТЕХДОЛГ вверху). + account deletion, Privacy/Terms/Support, админка.
  5. ТЕСТ ПОКУПОК: ASC ключ верификации → APPLE_*_IAP в .env (+root certs, +APPLE_APP_APPLE_ID=6779357856, +APPLE_ENVIRONMENT=sandbox). Webhook в ASC + sandbox-аккаунты. pm2 restart.
  6. Privacy+Terms+Support на chitatel.app (ревью Apple).
  7. Логика доступа к клубу (скользящее окно+31 день+сезоны+окна продаж).
  8. Коды активации (РФ/РБ — КАНАЛ №1).
  9. Продукты-разборы в Apple (64 non-consumable).
  10. Фаза 5 (ИИ-дневник), Фаза 6 (профиль+админка+пуши+онбординг+accessibility+error states+account deletion+БЛОКИРОВКА), Фаза 7 (публикация).
ХВОСТЫ: .gitignore (audio-storage/, .env*, удалить app/-H app/-d); Info.plist ITSAppUsesNonExemptEncryption=false; seed.js пароль; subscriptionPlan enum +'season'; опечатка в комментарии chat_message_bubble.dart стр.~504 (применялall→применялась, при следующей правке файла); индикатор печатает (по желанию). Тёмная тема — Post-MVP, НЕ блокер.
```
**БЛОКЕРЫ РЕВЬЮ APPLE:** account deletion (5.1.1(v)); Privacy+Support URL; UGC-модерация = **БЛОКИРОВКА пользователя (НЕ сделана!)** + EULA + реакция ≤24ч (админка); убрать заглушки `_Placeholder`.
**От Анны:** ASC-ключ верификации (тип); $28 цена клиента или доход; наполнение Базовый/Премиум; реальные описания/обложки.
⚠️ Сделаны Фазы 0-4 (код)+инфра+TestFlight+редизайн чата. НЕ начато: Фаза 5 (ИИ), бóльшая часть Фазы 6 (профиль+7 подэкранов, админка React ~20ч включая ответы Q&A, пуши, онбординг, accessibility, error states, account deletion, **блокировка**), вся Фаза 7. + вне плана (коды активации, лендинг, логика клуба, продукты-разборы). «✅ по коду» ≠ протестировано вживую.

---

## УРОКИ (#28+; #1-27 в AC/AC-2)
**#28** формат пакета по registry. **#29** Apple-подписка старт=покупка. **#30** активация извне легальна только нейтральное поле. **#31 ⚠️** Apple-оплата НЕ в РФ/РБ → сайт+коды №1. **#32** ценообразование Apple. **#33** продукты-разборы через ASC API капризны. **#34 ⚠️** AI-CONTEXT обновлять ПОЛНЫМ файлом. **#35 ⚠️** общий сервер — изоляция. **#36 ⚠️** секреты в логах маскировать. **#37 ⚠️** Apple Individual — локальная подпись недостижима → Codemagic+ASC key. **#38 ⚠️** Codemagic автоподпись — CERTIFICATE_PRIVATE_KEY, yaml в КОРНЕ. **#39 ⚠️** .ipa iPad-ориентации (90474) → TARGETED_DEVICE_FAMILY="1".

**#40 ⚠️ ЛОГИ ВАЖНЕЕ ДОГАДОК (27.06).** Прорыв по белому экрану — debug-print HTTP. Сначала инструментировать.
**#41 ⚠️ checkAuth() ПРИ СТАРТЕ (27.06).** main.dart не вызывал → GuestGate вечно крутил.
**#42 ⚠️ trust proxy (27.06).** express-rate-limit за nginx без `app.set('trust proxy', 1)` падает.
**#43 ⚠️ ПЕРЕВЫПУСК SIGNED URL ПРИ ОТДАЧЕ (27.06).** Хранить `*StoragePath`, перевыпускать на КАЖДОЙ отдаче (`withFreshMedia`), рекурсивно для reply.
**#44 (процесс) FLUTTER ВСЛЕПУЮ (27.06).** Claude не компилирует Flutter → малые коммиты, юзер проверяет билд.
**#45 ⚠️⚠️ SOFT-DELETE + LIMIT (28.06).** Фильтровать `deletedAt:null` В ЗАПРОСЕ (ДО лимита), во ВСЕХ эндпоинтах. При «данные пропадают непредсказуемо» сразу спросить про удаление. Без ребилда.
**#46 ⚠️⚠️ СТАБИЛЬНОСТЬ SIGNED URL = СТАБИЛЬНОСТЬ exp, НЕ ДЛИНА TTL (28.06).** Иммутабельный контент — exp ФИКС. КОНСТАНТОЙ (2099). Аудио TTL 1ч.
**#47 ⚠️ ДЁРГАНЬЕ LAYOUT ОТ OVERLAY НА КЛАВИАТУРЕ (28.06).** AlertDialog поверх живой клавиатуры → прыжок. Убрать диалог (оптимистично + SnackBar «Отменить»).
**#48 (процесс) ДИЗАЙН ЧЕРЕЗ ПРОТОТИПЫ (28.06).** Прототипы через visualize до кода. НЕ рисовать иконки/паттерны кодом. Дизайн по одному элементу с проверкой на билде. Минимум цветов. Не менять базовый фон. СПРАШИВАТЬ перед правкой/откатом.

**#49 ⚠️ АУДИТ ПЛАНА ПРОТИВ КОДА — ВСПЛЫВАЮТ НЕДОДЕЛКИ (28.06).** Вопрос Анны «куда идёт жалоба» вскрыл: «Пожаловаться» есть, а **блокировка пользователя (MVP + Apple 1.2) НЕ реализована** — хотя в STEP-BY-STEP 4.2/4.3/4.5 и MASTER 4.36/7.4/6.1 заложена (галочка в MASTER 6.1 п.8 стояла ОШИБОЧНО). Вывод: статус-галочки в доках ≠ факт в коде; периодически сверять «обязательные требования Apple» со СБОРКОЙ, особенно UGC (report+block+24ч+EULA), account deletion, Privacy/Support URL. Тёмная тема — наоборот, честно Post-MVP, не блокер. При вопросе юзера про требования — проверять по коду (get_file_contents), а не по памяти.

---

*Обновлён 28.06.2026. **✅ TESTFLIGHT+ФИЗ.АЙФОН+APPLE SIGN IN. ✅ ЧАТ: 3 БАГА ИСПРАВЛЕНЫ (soft-delete+limit ea18610; фикс.exp dfd19f9/d0df5f3; AlertDialog→SnackBar d3a8f23), юзер подтвердил. ✅ ЗАКРЕП-СВЯЗКА 7966ccc. ✅ РЕДИЗАЙН ЧАТА ПОЛНОСТЬЮ В КОДЕ (6/6): закреп b3d4c4e, скругления/реакции 9d9d04c, бейдж Автор клуба 34f1824+b0eca94, текстура CSS-точки 649d32a, даты 1215f7e9, аватар-серия 1215f7e9 — ждёт билда.** 🚨 ТЕХДОЛГ Фазы 6: БЛОКИРОВКА пользователя НЕ реализована (MVP/Apple 1.2 блокер) + account deletion + Privacy/Terms/Support + админка. Тёмная тема = Post-MVP (не блокер). Сервер api.chitatel.app (Node20/nvm, Mongo Docker 27018, PM2, nginx+certbot) — редизайн его НЕ трогал. Codemagic iOS (yaml в корне, Flutter 3.22.3). ⏭️ Пересобрать билд → проверить редизайн → Анна в TestFlight → ТЕХДОЛГ блокировки → тест покупок → Terms/Privacy → логика клуба → коды активации. Уроки #45-49. Прогресс фиксировать далее ТОЛЬКО здесь.*
