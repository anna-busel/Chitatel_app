# AI-CONTEXT-3 — ЧИТАТЕЛЬ (продолжение)

> **ТРЕТИЙ ФАЙЛ КОНТЕКСТА.** Предыдущие: `AI-CONTEXT.md` (база, Фазы 1-2, чат 4.1-4.8, уроки #1-19) и `AI-CONTEXT-2.md` (Фаза 4, задачи 1.3/1.7/1.8, уроки #20-27).
>
> **Порядок чтения для AI:** `AI-CONTEXT.md` → `AI-CONTEXT-2.md` → **этот файл** → `docs/AUDIT-2026-07.md` (чек-лист аудита, если уже в репо).
>
> **Прогресс фиксировать ДАЛЕЕ ТОЛЬКО ЗДЕСЬ.** Первые два не редактировать (архив).
>
> ⚠️ **Юзеру:** добавить упоминание `AI-CONTEXT-3.md` в Project Instructions проекта Claude.

---

## ТЕКУЩИЙ СТАТУС (на 07.07.2026)

**✅ АУДИТ ПРОЕКТА ПРОВЕДЁН (07.07).** Холистический аудит архитектуры + App Store compliance + безопасности (сессия Claude). Итог — документ-чеклист `docs/AUDIT-2026-07.md` (⚠️ передан юзеру, В РЕПО ЕЩЁ НЕ ДОБАВЛЕН — юзер добавляет сам; блоки: A=блокеры сабмита/Фаза 6, B=платёжный контур, C=после релиза, D=не трогать, E=синхронизация доков).

**✅ ФИКСЫ ПЛАТЕЖЕЙ B2/B3/B4 — В `main` (07.07).** См. блок «СЕССИЯ 07.07» ниже. Сервер: `git pull` + `pm2 restart`. Клиент: ребилд Codemagic (B2 — appAccountToken).

**✅ РЕШЕНИЕ ЮЗЕРА (07.07): блок A аудита (блокировка, account deletion, Privacy/Terms, Info.plist, мини-админка) — ЕДИНЫМ ПРОХОДОМ НА ФАЗЕ 6,** не сейчас. Блокировка пользователя из «следующего шага» ПЕРЕНЕСЕНА в Фазу 6. Блок B (платежи) — закрыт кодом сейчас (до теста покупок). B5 (красные линии кодов активации) — при написании кодов активации. Блок D («PM2 fork, 1 инстанс») — постоянное ограничение деплоя.

**✅ Шаг 0 перед тестом покупок закрыт (со слов юзера, 07.07):** серверные фиксы применены, билд с редизайном собран, Анна оттестировала.

**СЛЕДУЮЩЕЕ: ТЕСТ ПОКУПОК** (порядок — в «ДАЛЬШЕ ПО ПЛАНУ»).

**⚠️ СТРАТЕГИЧЕСКОЕ: аудитория РФ+РБ+Грузия. Apple-оплата в РФ/РБ НЕ работает. Канал №1 по деньгам — САЙТ + КОДЫ АКТИВАЦИИ.**

---

## ✅ СЕССИЯ 07.07.2026 — АУДИТ + ФИКСЫ ПЛАТЕЖЕЙ B2/B3/B4

Аудит: прочитаны все серверные файлы влияющие на выводы (app/server/socket/auth/rate-limit/purchase/webhook/club/admin/image.service/User/Info.plist) — код как источник истины, не галочки доков (урок #49). Полный чек-лист — `docs/AUDIT-2026-07.md`. НЕ покрыто аудитом: Flutter-клиент глубоко, MASTER/STEP-BY-STEP построчно, Фаза 5 (кода нет).

### Ключевые находки аудита (сверх известного техдолга)
- **B2 🔴:** webhook находил юзера ТОЛЬКО по сохранённой записи Purchase → продление по неизвестной транзакции (переустановка до restore, family sharing, ASK_TO_BUY) молча терялось. — **ИСПРАВЛЕНО 07.07.**
- **B3 🟡:** `DID_FAIL_TO_RENEW` игнорировался; `gracePeriodExpiresAt` читался проверками доступа, но никем не писался. — **ИСПРАВЛЕНО 07.07.**
- **B4 🟡:** enum `subscriptionPlan` не знал `'season'`. — **ИСПРАВЛЕНО 07.07.**
- **A2 🔴:** account deletion — серверного флоу НЕТ вообще (роута нет; поля isDeleted есть). Фаза 6.
- **A4 🔴:** `NSUserTrackingUsageDescription` в Info.plist стоит ОШИБОЧНО (ключ про ATT/IDFA, не про OpenAI) — удалить; usage descriptions Photo/Camera не соответствуют факту (чат, а не «фото профиля»). Фаза 6.
- **C1 🟡:** rate limiting только на /api/auth (чат/upload/report без лимитов). После релиза.
- **C2 🟡:** `POST /chat/:messageId/reaction` БЕЗ resolveClubAccess (расходится с собственным комментарием кода). После релиза.
- **C3 🟡:** refresh-токены в БД открытым текстом (rotation/reuse-detection при этом сделаны правильно). После релиза.
- **D:** Socket.io/signed-URL/auth-флоу/чат — добротно, НЕ трогать. **Ограничение деплоя: PM2 строго fork mode, 1 инстанс** (cluster сломает доставку WS-эмитов; Redis-адаптер — только при онлайне >2-3k).

### Фиксы B2/B3/B4 — коммиты в `main` (07.07)

| Коммит | Файл | Что |
|--------|------|-----|
| `ca68318` | `server/src/models/User.js` | B4: `subscriptionPlan` enum + `'season'` |
| `8c1e133` | `server/src/services/purchase.service.js` | B4: `'season'` в SUBSCRIPTION_PLAN_ENUM. B3: новый параметр `gracePeriodExpiresAt` в `applyTransaction` (undefined=не трогать / null=снять / Date=выставить; только для subscription) |
| `4adfe72` | `server/src/services/webhook.service.js` | B3: `DID_FAIL_TO_RENEW` → декодирует `signedRenewalInfo` (`verifyAndDecodeRenewalInfo`), grace в будущем → `statusOverride='active'` + `gracePeriodExpiresAt=дата`; `DID_RENEW`/`SUBSCRIBED`/`EXPIRED`/`REFUND` → grace снимается (null). B2: fallback-маппинг юзера по `tx.appAccountToken` (`userIdFromAppAccountToken`: UUID → снять дефисы → проверить нулевой хвост `00000000` → первые 24 hex = ObjectId → User существует). Purchase не найден И токена нет → warn+return (200 Apple) |
| `f1b3408` | `app/.../payments/services/purchase_service.dart` | B2: статик-хелпер `appAccountTokenFromUserId` (ObjectId 24 hex + `00000000` → канонический UUID 8-4-4-4-12; не ObjectId → null); `buy()` принимает `{String? appAccountToken}` → `PurchaseParam.applicationUserName` |
| `abd5e75` | `app/.../payments/providers/purchase_provider.dart` | B2: `PurchaseNotifier` инжектит `SecureStorage`; `buy()` читает `getUserId()` → строит токен → передаёт в сервис |

**Схема appAccountToken (зафиксировано):** Mongo ObjectId = 24 hex (12 байт), UUID = 32 hex (16 байт) → паддинг `00000000` справа, формат 8-4-4-4-12. Детерминированно и обратимо, БЕЗ изменений схемы БД. Сервер принимает только токены с нулевым хвостом (чужой случайный UUID не пройдёт). userId нет/не ObjectId → покупка без токена (как раньше, verify привяжет по JWT).

### Применить фиксы
- **Сервер** (`ca68318`, `8c1e133`, `4adfe72`): `ssh deploy@161.97.102.73` → `cd /home/deploy/chitatel/Chitatel_app` → `git checkout -- server/package-lock.json` → `git pull origin main` → `pm2 restart chitatel-api`. Зависимости не менялись, npm install не нужен.
- **Клиент** (`f1b3408`, `abd5e75`): ребилд Codemagic (Flutter вслепую, урок #44 — при падении сборки прислать лог). Токен уйдёт в Apple только из НОВОГО билда — тест продлений через webhook делать на нём.
- ⚠️ Юзеру: добавить `docs/AUDIT-2026-07.md` в репо (передан в чате) и строку о нём в Project Instructions.

---

## 🚨 ТЕХДОЛГ К ФАЗЕ 6 (ПОЛИРОВКА) — НАЙДЕНО ПРИ АУДИТЕ 28.06, РАСШИРЕНО АУДИТОМ 07.07

> **Решение юзера 07.07: весь блок A аудита — единым проходом на Фазе 6.** Полный чек-лист с деталями реализации — `docs/AUDIT-2026-07.md` (блок A). Здесь — краткий список, НЕ потерять.

### 🔴 БЛОКИРОВКА ПОЛЬЗОВАТЕЛЯ — НЕ РЕАЛИЗОВАНА (MVP + Apple Guideline 1.2, БЛОКЕР РЕВЬЮ)
**Статус:** жалоба («Пожаловаться») работает и шлёт `Report` (pending) на сервер. А вот **самостоятельной блокировки пользователя участником НЕТ** — ни на сервере, ни в приложении. Подтверждено чтением кода 28.06 (и повторно аудитом 07.07):
- `server/src/models/User.js` — поля `blockedUsers[]` НЕТ (есть только `isBanned`/`mutedUntil` — это инструменты модератора-Анны, не self-service).
- `server/src/routes/club.js` — эндпоинтов `POST/DELETE /api/users/:id/block` НЕТ. Socket.io НЕ фильтрует заблокированных.
- Шторка жалобы во Flutter — toggle «Заблокировать пользователя» отсутствует.

Заложено в: STEP-BY-STEP 4.2/4.3/4.5, MASTER 4.35/4.36/7.4, 6.1 п.8 (галочка там ОШИБОЧНАЯ), секция 8.
**Из аудита 07.07 (дополнение к объёму):** фильтровать заблокированных надо не только в GET /chat и /context, но И в `pinnedMessage`, И в reply-снапшотах (populated `replyToId`) — иначе контент протечёт через превью. Заодно: клиентский эндпоинт жалобы «на пользователя» (Report model поддерживает `targetType:'user'`, роута из клиента нет).

### 🔴 Остальной блок A (Фаза 6, детали в AUDIT блок A):
- **A2 Account deletion** — серверный флоу отсутствует ПОЛНОСТЬЮ (роута нет). Эндпоинт: isDeleted + вычистка PII + анонимизация сообщений; для Apple Sign In проверить требование revoke токена. Apple 5.1.1(v).
- **A3 Privacy Policy + Terms/EULA (правила UGC, нулевая терпимость) + Support URL** на chitatel.app — сейчас заглушки.
- **A4 Info.plist:** УДАЛИТЬ `NSUserTrackingUsageDescription` (стоит ошибочно, ключ про ATT/IDFA); переписать честно PhotoLibrary/Camera (чат, не «фото профиля»); `ITSAppUsesNonExemptEncryption=false`.
- **A5 Минимальная админка жалоб** (web-страница поверх готовых `/api/admin/reports`) — без неё «реакция ≤24ч» нечем исполнять. Полная React-админка 6.6 — потом.
- **A6** Убрать заглушки `_Placeholder`. **A7** Privacy labels в ASC.

### 🟡 ТЁМНАЯ ТЕМА — Post-MVP, НЕ блокер (MASTER 6.2, Apple не требует).

---

## ✅ СЕССИЯ 28.06.2026 — РЕДИЗАЙН ЧАТА ДОВЕДЁН ДО КОНЦА

Все оставшиеся пункты редизайна применены и запушены. Косметика поверх рабочей логики, только чат. Палитра строго из `app_colors.dart`. Claude не компилирует Flutter (урок #44) → ждёт проверки на билде. **[07.07: юзер подтвердил — билд собран, Анна оттестировала.]**

### Что добавлено в этой сессии:
3. **Бейдж «АВТОР КЛУБА» + полоска слева** у сообщений Анны (автор-админ) — коммиты `34f1824` (`chat_message_bubble.dart`: параметр `authorIsAdmin`, флаг `showAuthorBadge=authorIsAdmin && !isMine`, виджет `_AuthorBadge` terracotta на `terracotta.withOpacity(0.10)` fontSize 9 w700, `adminBorder` левая полоска terracotta 2.5px в обеих ветках inner) + `b0eca94` (`chat_tab.dart`: `Set<String> _adminIds` из `_mentionable.where(isAdmin)` в `_bootstrap`, `_authorIsAdmin(m)`, проброс `authorIsAdmin`).
4. **Текстура бумаги на фоне** — `649d32a`. ⚠️ РЕАЛИЗОВАНО НЕ PNG (план с PNG-тайлом ОТМЕНён): прототип-HTML показал, что «бумага» = чистый CSS-паттерн из точек (radial-gradient 1px точки, шаг 3px, rgba(150,130,100,0.045)). В Dart сделано `_PaperTexturePainter` (CustomPainter, `canvas.drawCircle` r=0.6, шаг 3.0) внутри `Positioned.fill > RepaintBoundary > CustomPaint` ПОД списком. База фона `#FAFAF7` НЕ менялась. Прозрачность вынесена в ЕДИНУЮ top-level const `_paperDotOpacity = 0.08` вверху `chat_tab.dart` (поднята с прототипных 0.045 — юзер одобрил превышение, чтобы читалось на телефоне). ⚠️ Крутить эту одну цифру если на устройстве слабо/сильно.
5. **Разделители дат** — пилюля по центру «Сегодня/Вчера/5 июня», фон `surfaceMedium #F0EDE8`, текст `textTertiary` w500, радиус 12. Коммит `1215f7e9` (`chat_tab.dart`). Хелперы top-level `_formatDateLabel(dt)` (Сегодня/Вчера/«D месяц» родит. падеж, +год для прошлых лет, сравнение toLocal) и `_sameDay(a,b)`. В `itemBuilder` (reverse:true → сосед сверху/старше = index+1): `showDateHeader` над самым старым сообщением дня; виджет `_DateSeparator`.
6. **Аватар без дублей в серии** — коммит `1215f7e9` (тот же, `chat_tab.dart` + `chat_message_bubble.dart`). У чужих сообщений аватар только у первого в серии того же автора (после смены автора/дня/у самого старого); у остальных пустой `SizedBox(width:32)` для выравнивания. Флаг `showAvatar=!prevSameAuthor` считается в `chat_tab`, новый параметр `showAvatar` в `ChatMessageBubble` (default true; имя НЕ дедуплицируется — только аватар, по плану).

⚠️ Мелочь: в коммите `1215f7e9` в ОДНОМ `///`-комментарии `chat_message_bubble.dart` (~стр. 504, доккоммент `_ActionMenuContent`) опечатка при ручном кодировании кириллицы — «применялall к всей» вместо «применялась ко всей». На компиляцию/работу НЕ влияет (комментарий). Поправить при следующей правке этого файла.

### Итог редизайна (все 6 пунктов в коде, подтверждены билдом):
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
- **Сервер** (`ea18610`, `dfd19f9`): `git checkout -- server/package-lock.json` → `git pull` → `pm2 restart chitatel-api`. **[07.07: применено — шаг 0 закрыт со слов юзера.]**
- **Приложение:** новый билд Codemagic. **[07.07: собран, Анна оттестировала.]**

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
- **ASC API key:** Team Keys, Key ID `UN4ZB8T93H`, в Codemagic `chitatel-key`. ⚠️ Для верификации покупок нужен ОТДЕЛЬНЫЙ ключ (In-App Purchase key, Users and Access → Integrations → In-App Purchase; возможно только Анна-Account Holder).
- **Codemagic:** Individual, GitHub App в `anna-busel`. `codemagic.yaml` в КОРНЕ (`working_directory: app`, `79fa03d`). workflow `ios-testflight`: mac_mini_m2, Flutter 3.22.3, fetch-signing-files --create → build ipa. submit=false. groups `appstore_credentials`.
- ⚠️ **CERTIFICATE_PRIVATE_KEY** RSA в env. НЕ в репо.
- Грабли (решены): No matching profiles → --create; Cannot save certs → CERTIFICATE_PRIVATE_KEY; 90474 iPad-ориентации → `TARGETED_DEVICE_FAMILY "1,2"→"1"` (`a1e4c6e`).
- TestFlight: билд 1.0.0(1), Export Compliance exempt. Группа Internal Testing. **[07.07: шаг 0 закрыт — билд с редизайном собран, Анна оттестировала.]**
- Пересобрать: Codemagic → Start new build → `ios-testflight`, main.

---

## ✅ ПОДКЛЮЧЕНИЕ К БОЕВОМУ СЕРВЕРУ (26.06)
- `api_endpoints.dart` (`b79eb68`): baseUrl через `String.fromEnvironment('API_BASE', defaultValue:'https://api.chitatel.app')`. Локально `--dart-define=API_BASE=http://localhost:3000`.
- Ручные шаги 3.2: `flutter pub add in_app_purchase url_launcher`+pod install; роутер `367fe48`; Xcode capabilities IAP+Sign in, `Runner.entitlements` (`03086a6`); DEVELOPMENT_TEAM Personal `669ZY8S56N`; bundle `app.chitatel.ios`. Push с мака — PAT (`g1orgi89`).
- ⚠️ **TODO .gitignore:** `audio-storage/`, `.env*`; удалить мусор `app/-H app/-d`. На сервере перед pull `git checkout -- server/package-lock.json`.

---

## ✅ ДЕПЛОЙ СЕРВЕРА (26.06)
VPS Contabo (общий с reader-bot), **строго изолированно**. SSH `deploy@161.97.102.73` (с мака по паролю). ⚠️ Чужие сайты/Node18/глобальный PM2 не трогать.
- Домен `chitatel.app` (Namecheap), A-записи api+@+www → 161.97.102.73. Node 20.20.2 nvm. Mongo Docker `chitatel-mongodb` mongo:8.0 `127.0.0.1:27018` root `chitatel_admin`. Бэкенд `/home/deploy/chitatel/Chitatel_app` (`npm audit fix --force` НЕ запускать). `.env` 600: есть PORT/MONGO_URI/секреты/APPLE_TEAM_ID=3GS6F87RKZ/BUNDLE=app.chitatel.ios; пусто APPLE_*_IAP/GOOGLE/OPENAI/APNS. AUDIO_BASE_PATH `/var/audio/chitatel`. PM2 `ecosystem.config.js` interpreter nvm node20, процесс `chitatel-api`. **⚠️ Ограничение из аудита (блок D): PM2 строго FORK MODE, 1 инстанс — cluster mode сломает доставку Socket.io-эмитов (io в памяти процесса). Redis-адаптер — только при онлайне >2-3k.** nginx `api.chitatel.app` proxy→3000, WebSocket, client_max_body_size 12M. certbot до 24.09.2026. seed+seed:club прошли.
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

---

## КАТАЛОГ (14.06) — 54 разбора + 10 пакетов. seed.js `2c893cd`, json `c8a2ccb`. Дослать (Анна): обложки #44-54+facultativ_tolstoy, описания 3, 7 факультативов, аудио. appleProductId=book.{slug}/package.{slug}.

## ✅ ЗАДАЧА 3.1 ASC (16.06) — Hanna Busel ИП Тбилиси, Paid Apps/W-8BEN/банк активны. SBP (15%) подана. Приложение «Читатель: книжный клуб» Apple ID 6779357856, bundle app.chitatel.ios. Продукты (group 22166930): club.basic.monthly (6781739637, $27.99), club.basic.season (3мес ~$54.99). 64 разбора non-consumable — позже скриптом.

## 🔑 МОДЕЛЬ ПОДПИСОК (15.06): беспл+IAP, в iOS только Apple. Месяц club.basic.monthly ~$28, Сезон 3мес club.basic.season ~$54 (ОДИН продукт автопродление). Сезонный тариф на paywall только в начале сезона. Доступ активного = скользящее окно «текущий+предыдущий месяц». Деньги по дате Apple/контент по календарю.

## 🧩 КОДЫ АКТИВАЦИИ (РФ/РБ) — ПРИОРИТЕТ ВЫСОКИЙ, КАНАЛ №1. Оплата на сайте→код→нейтральное поле в приложении→сервер открывает доступ. ⚠️ Apple: только нейтральное поле, БЕЗ рекламы внешней покупки (красные линии — AUDIT B5: ни слова «купите на сайте», без ссылок на лендинг с ценами, paywall сайт не упоминает). Модель `ActivationCode`.

## ЗАДАЧИ 3.3/3.4/3.2 ✅ ГОТОВО: верификация Purchase.js/purchases.js/purchase.service.js (+@apple/app-store-server-library 3.1.0), webhook `/api/webhooks/apple`, paywall purchase_service/provider/success/paywall screens. **07.07: + фиксы B2 (appAccountToken), B3 (grace), B4 ('season' enum) — см. СЕССИЮ 07.07.** APPLE_*_IAP в .env всё ещё пусто. Terms/Privacy заглушки.

---

## ДАЛЬШЕ ПО ПЛАНУ
```
✅ Сервер, приложение против прода, Codemagic+TestFlight+Apple Sign In
✅ Полировка чата + баг белого экрана [27.06]; вторая отладка чата [27-28.06]; редизайн чата 6/6 [28.06]
✅ Шаг 0 закрыт [07.07 со слов юзера]: серверные фиксы применены, билд с редизайном собран, Анна оттестировала
✅ АУДИТ проекта [07.07] → docs/AUDIT-2026-07.md (юзер добавляет в репо) + фиксы B2/B3/B4 в main
СЛЕДУЮЩЕЕ — ТЕСТ ПОКУПОК:
  0. Применить фиксы 07.07: сервер pull+pm2 restart (ca68318/8c1e133/4adfe72); клиент — новый билд Codemagic (f1b3408/abd5e75 — appAccountToken уйдёт в Apple только из нового билда).
  1. ASC руками: In-App Purchase key (ОТДЕЛЬНЫЙ от Codemagic; возможно только Анна); webhook App Information → App Store Server Notifications → поле SANDBOX URL = https://api.chitatel.app/api/webhooks/apple; sandbox-тестировщик (Users and Access → Sandbox Testers); продукты club.basic.monthly/season в статусе Ready to Submit.
  2. .env на VPS: корневые сертификаты Apple PKI (apple.com/certificateauthority) → папка → APPLE_ROOT_CERTS_PATH; APPLE_ISSUER_ID/APPLE_KEY_ID(+ключ IAP); APPLE_ENVIRONMENT=sandbox; APPLE_APP_APPLE_ID=6779357856. pm2 restart. Без сертификатов verify даёт 503 PURCHASE_VERIFICATION_UNAVAILABLE.
  3. Тест на физ.iPhone (TestFlight-билд): sandbox-аккаунт в Settings→App Store; покупка monthly → verify 200, Purchase в Mongo, subscriptionStatus=basic, клуб открыт; sandbox ускорен (месяц≈5 мин, до 6 продлений) → ждать DID_RENEW в pm2 logs + сдвиг expiresAt (это проверка B2); истечение → EXPIRED → expired; restore; season. Нюанс: TestFlight-покупки — sandbox-окружение (проверить по актуальной документации Apple в момент теста).
  4. Privacy+Terms+Support на chitatel.app (ревью Apple) — можно раньше Фазы 6, контент от Анны.
  5. Логика доступа к клубу (скользящее окно+31 день+сезоны+окна продаж).
  6. Коды активации (РФ/РБ — КАНАЛ №1). ⚠️ При написании — красные линии AUDIT B5.
  7. Продукты-разборы в Apple (64 non-consumable).
  8. Фаза 5 (ИИ-дневник).
  9. Фаза 6 (полировка) = ЕДИНЫЙ ПРОХОД ПО AUDIT БЛОКУ A (решение юзера 07.07): БЛОКИРОВКА пользователя, account deletion, Privacy/Terms/EULA, Info.plist (убрать NSUserTracking + честные descriptions + ITSAppUsesNonExemptEncryption), мини-админка жалоб, _Placeholder, privacy labels. + профиль, пуши, онбординг, accessibility, error states. Блок A ≈ 3-4 дня, НЕ «вечер перед сабмитом».
  10. Фаза 7 (публикация, Codemagic).
ПОСЛЕ РЕЛИЗА (AUDIT блок C): rate limiting контент-эндпоинтов; resolveClubAccess на reaction; хэш refresh-токенов; magic-bytes upload; readBy вне выдачи; индексы; json-лимит; nginx X-Accel для аудио.
ХВОСТЫ: .gitignore (audio-storage/, .env*, удалить app/-H app/-d); seed.js пароль; опечатка в комментарии chat_message_bubble.dart стр.~504; индикатор печатает (по желанию). Тёмная тема — Post-MVP.
```
**БЛОКЕРЫ РЕВЬЮ APPLE (= AUDIT блок A, Фаза 6):** блокировка пользователя; account deletion (5.1.1(v)); Privacy+Terms/EULA+Support URL; Info.plist (A4); реакция ≤24ч (мини-админка); убрать `_Placeholder`; privacy labels.
**От Анны:** In-App Purchase key (тип/доступ); $28 цена клиента или доход; наполнение Базовый/Премиум; реальные описания/обложки; контент Privacy/Terms.
⚠️ Сделаны Фазы 0-4 (код)+инфра+TestFlight+редизайн чата+фиксы платежей B2/B3/B4. НЕ начато: Фаза 5 (ИИ), бóльшая часть Фазы 6 (см. п.9), вся Фаза 7. + вне плана (коды активации, лендинг, логика клуба, продукты-разборы). «✅ по коду» ≠ протестировано вживую.

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

**#49 ⚠️ АУДИТ ПЛАНА ПРОТИВ КОДА — ВСПЛЫВАЮТ НЕДОДЕЛКИ (28.06).** Вопрос Анны «куда идёт жалоба» вскрыл: «Пожаловаться» есть, а **блокировка пользователя (MVP + Apple 1.2) НЕ реализована** — хотя в STEP-BY-STEP 4.2/4.3/4.5 и MASTER 4.36/7.4/6.1 заложена (галочка в MASTER 6.1 п.8 стояла ОШИБОЧНО). Вывод: статус-галочки в доках ≠ факт в коде; периодически сверять «обязательные требования Apple» со СБОРКОЙ, особенно UGC (report+block+24ч+EULA), account deletion, Privacy/Support URL. При вопросе юзера про требования — проверять по коду (get_file_contents), а не по памяти.

**#50 ⚠️ ТЕСТ ПЛАТЕЖЕЙ ПРОВЕРЯЕТ ТОЛЬКО ВИДИМЫЕ ПУТИ (07.07).** Базовая покупка (verify по JWT) прошла бы и с дырами B2/B3 — они проявляются только на ПРОДЛЕНИЯХ через webhook (переустановка, billing retry), недели спустя. Правило: перед тестом платёжного контура сверять покрытие сценариев жизненного цикла подписки (покупка/продление/grace/истечение/refund/restore), а не только happy-path покупки. Дыры в маппинге webhook→юзер чинить ДО теста, sandbox умеет ускоренно гонять продления — тест тогда проверяет и их.

---

*Обновлён 07.07.2026. **✅ АУДИТ ПРОЕКТА (архитектура/App Store/безопасность) → docs/AUDIT-2026-07.md (юзер добавляет в репо + строку в Project Instructions). ✅ ФИКСЫ ПЛАТЕЖЕЙ B2/B3/B4 В `main`:** B4 'season' enum (`ca68318`+`8c1e133`), B3 DID_FAIL_TO_RENEW→gracePeriodExpiresAt через verifyAndDecodeRenewalInfo + снятие grace при DID_RENEW/EXPIRED/REFUND (`4adfe72`+`8c1e133`), B2 appAccountToken — детерминированный UUID из userId (ObjectId 24hex + паддинг 00000000 → 8-4-4-4-12), клиент шлёт в PurchaseParam.applicationUserName (`f1b3408`+`abd5e75`), сервер fallback-маппинг в webhook (`4adfe72`). Применить: сервер pull+pm2 restart; клиент — НОВЫЙ билд Codemagic (токен уходит только из него). **Решение юзера: AUDIT блок A (блокировка+deletion+Privacy/Terms+Info.plist+админка) — единым проходом на Фазе 6; B5 — при кодах активации; блок D (PM2 fork, 1 инстанс) — постоянное ограничение.** Шаг 0 закрыт (билд с редизайном + серверные фиксы + тест Анны). ⏭️ СЛЕДУЮЩЕЕ — ТЕСТ ПОКУПОК: ASC (IAP key, SANDBOX webhook URL, sandbox-тестер, статус продуктов) → .env (root certs Apple PKI + APPLE_*) → физ.iPhone (покупка/продления DID_RENEW≈5мин/истечение/restore/season). Урок #50. Прогресс фиксировать далее ТОЛЬКО здесь.*
