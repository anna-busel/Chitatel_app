# AI-CONTEXT — ЧИТАТЕЛЬ

> Обновляется после каждой завершённой задачи. Только статус и прогресс.
> Правила и роль — в Project Instructions (CHAT-INSTRUCTION.md).

---

## ПРОЕКТ

**Что:** iOS-приложение книжного клуба «ЧИТАТЕЛЬ» (аудиоразборы книг + дневник цитат + ИИ-анализ + чат)
**Стек:** Flutter (iOS) + Express.js (ES2020+) + MongoDB 7 + nginx + Contabo VPS
**Репозиторий:** github.com/anna-busel/Chitatel_app (монорепо: `server/` + `app/` + `docs/`)

---

## ТЕКУЩИЙ СТАТУС

**Фаза:** 2 — контент и аудиоплеер
**Следующая задача:** **2.7 (Аудиоплеер Flutter)** — `just_audio` + `audio_service`, экраны 4.15/4.16/4.17/4.18/4.19, lock screen, background play, прогресс. ~40 часов работы, в отдельной сессии.
**Блокеры:** 1.3 (Apple Sign In) ждёт Apple Dev Account. 2.5.5 (пакеты) ждёт уточнение от Анны.

---

## ПРОГРЕСС

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3.5-a/b/c/d, 2.4, **2.5**, **2.5-поиск**, **2.6**, **2.3** (серверная часть)

---

## 🎧 АУДИО-СТРИМИНГ (ПАМЯТКА — задача 2.3)

### Архитектура

Стандартный подход (как у Audible, Spotify, Apple Music):

```
Flutter (плеер)                       Express (бэкенд)
     │                                       │
     │  GET /api/books/:id/audio/:partNumber │
     │ ────────────────────────────────────► │
     │                                       │
     │  ◄────  { audioUrl: "http://..." }    │
     │         signed URL, TTL 1 час         │
     │                                       │
     │  GET /audio/...?exp=...&sig=...       │
     │  + Range: bytes=0-1000                │
     │ ────────────────────────────────────► │
     │                                       │ verifySignedUrl()
     │                                       │ → проверка HMAC + TTL
     │  ◄────  206 Partial Content + MP3     │
     │         (fs.createReadStream)         │
```

Протокол подписи: **HMAC-SHA256** (стандарт).
Ключ: `AUDIO_SECRET` в `.env` (минимум 32 символа).
Format URL: `http://host:port/audio/<filename>?exp=<unix_timestamp>&sig=<hex>`.
Коды: 200 (full), 206 (range), 403 (invalid sig), 410 (expired), 404 (not found), 416 (range out of bounds).

### Где лежат файлы

| Среда | Путь |
|---|---|
| **Mac (разработка)** | `~/Chitatel_app/audio-storage/<book_slug>/part-<N>.mp3` |
| **VPS (продакшен, в будущем)** | `/var/audio/chitatel/<book_slug>/part-<N>.mp3` |

Папка `audio-storage` находится **на одном уровне** с `server/` и `app/`. **НЕ в git** (большие MP3-файлы), на VPS просто отдельная папка с правами для пользователя `chitatel`.

### Что в `.env` для разработки на Mac

Должно быть в `~/Chitatel_app/server/.env` (создать из `.env.example`):

```bash
AUDIO_SECRET=dev-audio-secret-CHANGE-IN-PROD-min-32-chars
AUDIO_BASE_PATH=/Users/g/Chitatel_app/audio-storage
AUDIO_URL_TTL_SECONDS=3600
PUBLIC_BASE_URL=http://localhost:3000
```

⚠️ **`AUDIO_BASE_PATH` — абсолютный путь**, не `~`. Замени `g` на свой username Mac.

### Что менять в `.env` при миграции на VPS

Три строки:

```bash
AUDIO_SECRET=<generate via: openssl rand -hex 32>
AUDIO_BASE_PATH=/var/audio/chitatel
PUBLIC_BASE_URL=https://api.chitatel.app
```

**Перенос файлов** на VPS (одной командой):
```bash
rsync -avz --progress ~/Chitatel_app/audio-storage/ user@vps:/var/audio/chitatel/
```

Код **не меняется** ни на байт — только `.env`.

### Как добавить новые MP3 (для следующих книг)

**Сценарий:** Анна прислала MP3-файлы новой книги (например «Тревожные люди»).

1. **Положить файлы** в `~/Chitatel_app/audio-storage/<slug>/part-1.mp3` ... `part-N.mp3`.
   Slug должен совпадать с `bookSlug` в seed (например `trevozhnye_lyudi`).

2. **Узнать длительности** через ffprobe:
   ```bash
   cd ~/Chitatel_app/audio-storage/<slug> && for f in part-*.mp3; do d=$(ffprobe -i "$f" -show_entries format=duration -v quiet -of csv="p=0"); echo "$f: ${d%.*} сек"; done
   ```

3. **Добавить в `seed.js`** массив `<BOOK>_PARTS` и привязать к книге.

4. **Прогнать seed:** `cd ~/Chitatel_app/server && npm run seed`.

**ВАЖНО:** MP3 формат строго (не OGG, не M4A). iOS поддерживает MP3 нативно. Если Анна прислала OGG — конвертировать через ffmpeg одной командой (см. сессию 12.05.2026).

### Конвертация OGG → MP3 (если потребуется)

Для одной папки с файлами `01.ogg` ... `06.ogg`:
```bash
mkdir -p ~/Chitatel_app/audio-storage/<slug> && cd <папка_с_ogg> && for i in 01 02 03 04 05 06; do n=$((10#$i)); ffmpeg -i "${i}.ogg" -codec:a libmp3lame -b:a 192k -y ~/Chitatel_app/audio-storage/<slug>/part-${n}.mp3; done
```

Качество 192 kbps — стандарт для аудиокниг (голос). На речи разница с 320 kbps не слышна.

Если ffmpeg не установлен, **не использовать brew install ffmpeg** — компилируется 30+ минут. Готовый бинарник:
```bash
cd ~/Downloads && curl -L https://evermeet.cx/ffmpeg/getrelease/zip -o ffmpeg.zip && unzip -o ffmpeg.zip && sudo mv ffmpeg /usr/local/bin/ && sudo chmod +x /usr/local/bin/ffmpeg
```
ffprobe отдельно:
```bash
cd ~/Downloads && curl -L https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip -o ffprobe.zip && unzip -o ffprobe.zip && sudo mv ffprobe /usr/local/bin/ && sudo chmod +x /usr/local/bin/ffprobe
```

### Тестирование через curl

```bash
# 1. Найти id Маленького принца
curl -s 'http://localhost:3000/api/books?isFree=true' | python3 -m json.tool | grep -A1 'malenkii_princ'

# 2. Получить signed URL для первой части
curl -s 'http://localhost:3000/api/books/<ID>/audio/1' | python3 -m json.tool
# Должен вернуть: { audioUrl: "http://localhost:3000/audio/malenkii_princ/part-1.mp3?exp=...&sig=...", duration: 855, ... }

# 3. Скачать первый килобайт MP3 через signed URL
curl -H "Range: bytes=0-1000" -i '<audioUrl>'
# Должен вернуть: HTTP/1.1 206 Partial Content + ~1KB бинарных данных

# 4. Открыть signed URL в Safari → должен начать проигрываться MP3
```

### Что НЕ сделано в задаче 2.3 (намеренно, для будущей оптимизации)

- ❌ **nginx X-Accel-Redirect** — Express отдаёт файлы напрямую через `fs.createReadStream`. На VPS под нагрузкой стоит переключить на nginx (он отдаёт статику в 10× быстрее). Это **опциональная оптимизация Фазы 7** (запуск).
- ❌ **HEAD request** для file size — `just_audio` использует Range вместо HEAD для определения размера.
- ❌ **Apple Sign In для guest** — `/audio/...` принимает только авторизованных юзеров через signed URL. Guest-юзеры получают signed URL для бесплатных книг без auth (см. checkPartAccess в `routes/books.js`).
- ❌ **Адаптивный битрейт (HLS)** — Анна публикует одну версию 192kbps. HLS добавим если будут жалобы на качество связи.

---

## ДОП.ШАГИ ВНЕ STEP-BY-STEP (выполнено 24.04.2026)

Шаги возникли после изучения реального контента Анны (`g1orgi89/reader-bot`). Все выполнены.

| Шаг | Что сделано | Коммит |
|-----|-----------|--------|
| **2.3.5-a** ✅ | Модель `server/src/models/Book.js` обновлена под новую схему (см. «РАСХОЖДЕНИЯ С MASTER.md»). `routes/books.js` пофикшен под новое поле `categories`. | `163ae99`, `7ea5112` |
| **2.3.5-b** ✅ | `server/src/scripts/reader-bot-catalog.json` создан. 42 книги + 6 пакетов из reader-bot, синтаксис JSON починен, разделено на books/packages. | `28f93fb` |
| **2.3.5-c** ✅ | `server/src/scripts/seed.js` написан. `npm run seed` вставляет 42 платных + 3 бесплатных + 6 пакетов. Скрипт идемпотентный (чистит коллекции перед вставкой). | — |
| **2.3.5-d** ✅ | 55 обложек скопированы из `g1orgi89/reader-bot/mini-app/assets/book-covers/` в `app/assets/book-covers/`. Путь зарегистрирован в `app/pubspec.yaml`. Копирование через одноразовый bash-скрипт `scripts/download-covers.sh`. | `9f4f8a2` + commit обложек |

**Запуск seed:** `cd ~/Chitatel_app/server && npm run seed` (MongoDB должна быть запущена).

**Фактический результат в БД после seed (на 12.05.2026):**
- 42 платных книги
- 3 бесплатных: Alice Wonderland, Eat Pray Love, **Маленький принц (с 6 частями реального аудио — задача 2.3)**
- 6 пакетов
- ВСЕГО в коллекции `books`: 45 документов

---

## ЗАДАЧА 2.3 (аудио-стриминг + прогресс) — ВЫПОЛНЕНА 12.05.2026 (серверная часть)

**Что в репо:**

| Файл | Назначение |
|------|-----------|
| `server/src/models/Progress.js` | Модель прогресса (`userId+bookId` уникальная пара) — `currentPartNumber`, `positionSeconds`, `listenedPartNumbers`, `totalListenedSeconds`, `lastListenedAt` |
| `server/src/services/audio.service.js` | HMAC-SHA256 signed URLs: `generateSignedUrl(filename, ttlSeconds)`, `verifySignedUrl(filename, exp, sig)` с timing-safe сравнением |
| `server/src/routes/audio.js` | GET `/audio/*` — отдача MP3 с Range support. Защита от path traversal через `path.resolve` + проверка что в basePath. `fs.createReadStream` для стрима |
| `server/src/routes/progress.js` | GET `/api/progress/:bookId` + POST `/api/progress`. Auth required, Zod валидация, upsert через `findOneAndUpdate`. `$inc totalListenedSeconds` только если `currentPart==previousPart && position > previousPosition` |

**Изменения:**
- `server/.env.example` — добавлены `AUDIO_SECRET`, `AUDIO_BASE_PATH`, `AUDIO_URL_TTL_SECONDS=3600`, `PUBLIC_BASE_URL=http://localhost:3000` с комментариями про dev vs prod
- `server/src/config/index.js` — добавлены `publicBaseUrl`, `audio.urlTtlSeconds`
- `server/src/app.js` — подключены `/api/progress` и `/audio` роуты
- `server/src/routes/books.js` — endpoint `/audio/:partNumber` теперь возвращает **signed URL** (раньше — filename). Функция `checkPartAccess(book, part, userPayload)`: free → preview → purchased → subscription → archive
- `server/src/scripts/seed.js` — Маленькому принцу прописаны 6 частей с `audioFilename: 'malenkii_princ/part-N.mp3'` и точными длительностями (855, 398, 700, 1377, 1987, 1896 сек). FREE_BOOKS теперь поддерживают parts. `mapFreeBook` рассчитывает `durationTotal` суммой parts.

**Без новых npm-пакетов** — `crypto`, `fs`, `path` встроены в Node.js.

**Файлы Маленького принца:**
Локально (юзер сконвертировал OGG → MP3 12.05.2026, ffmpeg через evermeet.cx):
```
~/Chitatel_app/audio-storage/malenkii_princ/
├── part-1.mp3  (855 сек, ~14 мин)
├── part-2.mp3  (398 сек, ~6.6 мин)
├── part-3.mp3  (700 сек, ~11.6 мин)
├── part-4.mp3  (1377 сек, ~23 мин)
├── part-5.mp3  (1987 сек, ~33 мин)
└── part-6.mp3  (1896 сек, ~31.6 мин)
```
Итого: ~2 часа разбора (7213 сек).

**Что НЕ сделано в задаче 2.3 (отложено намеренно):**
- ❌ Flutter-часть (задача 2.7 — плеер) — отдельная сессия, 40 часов
- ❌ nginx X-Accel-Redirect — оптимизация Фазы 7
- ❌ Аудио для остальных 2 бесплатных (Алиса, EPL) — ждём от Анны
- ❌ Аудио для 42 платных книг — ждём от Анны

---

## ЗАДАЧА 2.4 (главная страница) — ВЫПОЛНЕНА 27.04.2026

**Что в репо:**

| Файл | Назначение |
|------|-----------|
| `app/lib/shared/models/book_model.dart` | Модель книги — соответствует серверной Book |
| `app/lib/shared/widgets/book_cover_image.dart` | Универсальный виджет обложки: `asset://` → Image.asset, `http(s)://` → Image.network, fallback → градиент + `coverLabel` |
| `app/lib/features/home/services/home_service.dart` | Вызов `GET /api/home`, парсинг ответа |
| `app/lib/features/home/providers/home_provider.dart` | FutureProvider для данных главной |
| `app/lib/features/home/widgets/home_header.dart` | Шапка: аватар → /profile, лого ЧИТАТЕЛЬ, колокольчик → /notifications |
| `app/lib/features/home/widgets/club_month_card.dart` | Карточка клуба месяца (плейсхолдер если нет clubBook) |
| `app/lib/features/home/widgets/daily_quote_card.dart` | Цитата дня |
| `app/lib/features/home/widgets/free_books_section.dart` | Горизонтальный скролл бесплатных. Высота 260px |
| `app/lib/features/home/widgets/popular_books_section.dart` | Горизонтальный скролл платных с ценами в USD. Высота 280px |
| `app/lib/features/home/widgets/progress_card.dart` | Плейсхолдер прогресса для нового юзера |
| `app/lib/features/home/widgets/referral_banner.dart` | Реферал-баннер |
| `app/lib/features/home/screens/home_screen.dart` | HomeScreen: ListView со всеми секциями + pull-to-refresh + ErrorView + HomeShimmer |

**Изменено:**
- `app/lib/core/network/api_endpoints.dart` — добавлены `home`, `books`, `booksFeatured`, `booksSearch`, `packages`
- `app/lib/core/router/app_router.dart` — `_Placeholder('Главная')` → `HomeScreen()`
- `server/src/routes/home.js` — `.select()` обновлён под расширенную схему Book

---

## ЗАДАЧА 2.5 (каталог книг) — ВЫПОЛНЕНА 27.04.2026

См. предыдущую версию AI-CONTEXT для деталей. Краткая выжимка:
- 6 файлов в `app/lib/features/catalog/`
- `_Placeholder('Каталог')` → `CatalogScreen()`
- Сетка 2×N, 16 чипов фильтров, pull-to-refresh
- Серверной работы не потребовалось

---

## ЗАДАЧА 2.5-поиск (отдельный экран /search) — ВЫПОЛНЕНА 12.05.2026

См. предыдущую версию AI-CONTEXT для деталей. Краткая выжимка:
- 3 файла в `app/lib/features/search/`
- `_Placeholder('Поиск')` → `SearchScreen()`
- Debounce 300ms, состояния idle/typing/loading/success/error
- Серверной работы не потребовалось

---

## ЗАДАЧА 2.6 (экран книги) — ВЫПОЛНЕНА 11.05.2026

См. предыдущую версию AI-CONTEXT для деталей. Краткая выжимка:
- 4 файла в `app/lib/features/book/`
- 3 варианта UI (бесплатная/платная/купленная) заложены сразу (вариант A)
- _isPurchased=false, _progressPercent=0.0, _listenedPartNumbers={} — заглушки до Фазы 3 и 2.7
- Кнопка «Купить на сайте автора» УДАЛЕНА (Apple compliance — послабления 3.1.1(a) только US storefront)
- Финал обложки: 180×258 по центру на белом фоне без баннера

---

## ❗ ВАЖНОЕ ДЛЯ БУДУЩИХ ЗАДАЧ

**1. Локализация цен (Фаза 3)** — `book.priceUsd` сейчас жёстко доллары. В Фазе 3 заменим на `Product.displayPrice` от StoreKit (Apple даёт локализованные цены в валюте Apple ID юзера).

**2. Non-consumable IAP для книг и пакетов (задача 3.5)** — в Фазе 3 создаём IAP продукты `book.{slug}` × 42, `package.{slug}` × 6. Поле `appleProductId` в схеме Book уже есть.

**3. Кнопка «Купить на сайте» — УДАЛЕНА (Apple compliance).** Послабления Guideline 3.1.1(a) только US. Альтернатива — задача 3.6 (промокоды).

**4. Заглушки на экране книги (2.6)** — 3 const поля в `_BookContent`. Не плодить классы моков.

**5. Конвертация BYN→USD при seed — приближённая.** Финал назначит Анна в App Store Connect (Фаза 3).

**6. ❗ ВОПРОС К АННЕ — эксклюзивные книги внутри пакетов (блокирует 2.5.5).** Часть книг отсутствует в каталоге отдельно — только в пакетах. 3 варианта реализации зависят от ответа Анны.

**Готовый текст для Анны:**
> Анна, вопрос по пакетам. В пакете «Достоевский» 5 книг, но 2 из них («Бедные люди», «Бесы») у тебя в каталоге как отдельных разборов нет — они только в пакете. То же в других пакетах. Вопрос: это специально (эксклюзив пакета — стимул купить пакет целиком), или просто ещё не добавила их отдельно? От твоего ответа зависит как мы покажем экран пакета.

**7. ❗ НОВАЯ ЗАДАЧА 3.6 — Активация промокода (Фаза 3).** Заменяет удалённую кнопку «Купить на сайте». Модель `PromoCode`, эндпоинты, Flutter-экран, админка для Анны.

**8. ❗ ВОПРОСЫ К АННЕ:**

| # | Вопрос | Когда блокирует |
|---|--------|-----------------|
| 6.1 | Пакеты — эксклюзив или забыли добавить отдельно? | Задача 2.5.5 |
| 8.1 | Отзывы пользователей нужны в первой версии? Или пост-MVP? | Возможная новая задача 6.9 |
| 8.2 | Когда оформит Apple Developer Account ($99/год)? Нужны её документы. | Apple Sign In (1.3), вся Фаза 3, push, TestFlight, App Store |
| 8.3 | Когда пришлёт MP3 остальных разборов? Маленький принц уже есть. | Аудиоплеер 2.7 (можно делать на Маленьком принце, для остальных книг — пустой плеер) |

---

## ❗ УРОК ПО ДЕБАГУ

При багах — сначала **запросить полный лог терминала** (не последние строки), прочитать **первую** ошибку (не последнюю), **не править наугад**.

Для UX-проблем — **спросить юзера** прежде чем править. См. историю обложки 2.6 (две неправильные итерации).

**Apple compliance — ВСЕГДА перепроверять через web_search (минимум 2025+ источники).** Послабления меняются каждые несколько месяцев и часто действуют только в US storefront.

**Для аудио на iOS — формат строго MP3 или M4A.** OGG iOS не поддерживает нативно. Если Анна пришлёт OGG — конвертировать через ffmpeg (через evermeet.cx, не brew — brew компилирует 30+ минут).

---

## ПРОПУЩЕННЫЕ ЗАДАЧИ

| Задача | Что | Почему | Когда |
|--------|-----|--------|-------|
| 0.1 | Apple Developer Account | Не куплен | Перед 1.3 |
| 0.2 | App ID и Certificates | Зависит от 0.1 | После 0.1 |
| 0.3 | VPS настройка | Не куплен | Перед деплоем |
| 0.4 | Домен и SSL | Зависит от 0.3 | После 0.3 |
| 1.3 | Apple Sign In | Нет Apple Dev | После 0.1-0.2 |
| **2.5.5** | Пакеты в каталоге | ⏸ **НА ПАУЗЕ** — ждёт ответ Анны (см. ВАЖНОЕ → 6) | После ответа Анны |
| **2.7** | Аудиоплеер Flutter | Готов бэкенд 2.3 + есть тестовое аудио | **СЛЕДУЮЩАЯ задача** |
| Фаза 3 | Платежи | Нет Apple Dev | После 0.1-0.2 |
| 3.5 (новая) | Non-consumable IAP | Не было в исходном STEP-BY-STEP | В Фазе 3 |
| 3.6 (новая) | Активация промокода | Заменяет удалённую кнопку «Купить на сайте» | В Фазе 3 (после 3.1–3.4) |

---

## РАСХОЖДЕНИЯ С MASTER.md

**Схема Book расширена vs MASTER 7.3.** Источник истины — `server/src/models/Book.js`, не MASTER.

Изменения: `categories: [String]` (14 категорий Анны), `tags`, `coverImageUrl`, `priceUsd/Rub/Byn`, `bookSlug`, `purchaseUrl` (теперь не используется в Flutter, но в БД остаётся для админки и промокодов 3.6).

**Apple compliance — внешние ссылки на покупки:** в нашем приложении (для Россия/СНГ) **запрещены**. Можно только Apple IAP и промокоды (3.6).

Детали см. в предыдущей версии AI-CONTEXT — здесь сокращено.

---

## КОНТЕНТ ОТ АННЫ

**Репозиторий `g1orgi89/reader-bot`** — старый Telegram mini-app Анны. Содержит:
- 42 платных разбора + 6 пакетов (скопированы в `server/src/scripts/reader-bot-catalog.json`)
- 55 обложек PNG (скопированы в `app/assets/book-covers/`)
- 3 плеер-обложки в `audio-covers/` (для 2.7)

**Бесплатные разборы (isFree: true):**
- Alice Wonderland — без аудио
- Eat Pray Love — без аудио
- **Маленький принц — 6 частей с аудио (готово, задача 2.3)**

---

## РАБОЧАЯ СРЕДА

- **Mac:** MacBook Pro 2018, macOS Ventura
- **Xcode:** 15.2 + iOS 17.2 симулятор
- **Flutter:** 3.22.3 (используется withOpacity, не withValues)
- **Node.js:** 20.20.1 (nvm)
- **MongoDB:** 7.0.20
- **ffmpeg:** установлен через evermeet.cx (НЕ brew — компилируется 30+ минут)
- **Запуск MongoDB:** `mongod --dbpath ~/mongodb/data`
- **Запуск бэкенда:** `cd ~/Chitatel_app/server && npm run dev`
- **Запуск Flutter:** `cd ~/Chitatel_app/app && flutter run`
- **Seed БД:** `cd ~/Chitatel_app/server && npm run seed`

**Путь к аудио на Mac:** `/Users/g/Chitatel_app/audio-storage/`

---

## ПОРЯДОК РАБОТЫ

```
СЕЙЧАС:
  1.1–2.6 + 2.5-поиск + 2.3 (сервер) ✅
  → 2.7 Аудиоплеер Flutter (СЛЕДУЮЩАЯ задача)
  → Фаза 5 (ИИ-дневник)
  → Бэкенд клуба (Фаза 4 без Flutter)
  → Фаза 6 → Фаза 7

⏸ ЖДЁТ АННУ:
  2.5.5 — ответ по эксклюзивным книгам в пакетах
  Аудио для других книг (Маленький принц уже есть для разработки 2.7)

⏸ ЖДЁТ APPLE DEV:
  1.3 (Apple Sign In) → Фаза 3 (платежи) → Фаза 7 (TestFlight)

⏸ ЖДЁТ VPS:
  Деплой бэкенда (код пишем уже сейчас)
```

---

## ПРОШЛАЯ СЕССИЯ

_12.05.2026 (вторая половина) — Задача 2.3 (серверная часть). Конвертировали 6 OGG-файлов Маленького принца в MP3 (192 kbps) через ffmpeg от evermeet.cx (brew компилируется 30+ минут — отказались). 6 файлов в `~/Chitatel_app/audio-storage/malenkii_princ/part-{1..6}.mp3`, длительности 855/398/700/1377/1987/1896 сек (всего ~2 часа). **8 файлов сервера запушены в один коммит** — Progress model, audio.service (HMAC-SHA256 signed URLs), audio.js (Range support 200/206/403/410/404/416), progress.js (GET/POST с Zod), .env.example (AUDIO_*), config/index.js (publicBaseUrl, urlTtlSeconds), app.js (подключение роутов), seed.js (6 частей Маленького принца). Без новых npm-пакетов. Memo в AI-CONTEXT: где лежат файлы, что менять при миграции на VPS (3 строки в .env + rsync), как добавлять новые MP3, тесты через curl. Решение по архитектуре: HMAC signed URL с TTL 1 час (стандарт), Express отдаёт через fs.createReadStream (nginx X-Accel-Redirect — оптимизация Фазы 7). Прогресс прослушивания делаем в 2.3 одновременно (как в STEP-BY-STEP). Прогресс НЕ показываем на главной — главная и так перегружена, прогресс на экране книги (4.14) и в Профиле (4.45). Следующая: 2.7 (плеер Flutter, 40ч) в отдельной сессии._

_12.05.2026 (первая половина) — Задача 2.5-поиск (отдельный экран /search). 3 новых файла + правка router. Debounce 300ms, состояния по SearchPhase, переиспользую BookGridCard из каталога. Серверной работы не потребовалось — endpoint и text index уже были. Также обсудили пакеты на паузе (ждём Анну), отзывы оставили post-MVP._

_11.05.2026 — Задача 2.6 (экран книги). 4 новых файла + 4 правки. 3 варианта UI заложены сразу (вариант A). По обложке 2 итерации UX — финал 180×258 на белом фоне без баннера. Кнопка «Купить на сайте автора» добавлена и удалена в одной сессии (Apple compliance). Альтернатива — новая задача 3.6 (промокоды) в Фазе 3._

_27.04.2026 — Задачи 2.4 (главная) и 2.5 (каталог). См. подробности в предыдущих версиях AI-CONTEXT._

_24.04.2026 — Реализация 2.3.5-a/b/c/d (схема Book, seed.js, обложки)._

_06.04.2026 — Задачи 1.5–2.2: дизайн-система, навигация, экраны входа, модели Book/Package, API каталога. Уточнение: 21 день архивный доступ к клубу._

---

## РЕШЕНИЯ

| Дата | Решение | Причина |
|------|---------|---------| 
| 12.05.2026 | HMAC-SHA256 signed URL для аудио, TTL 1 час | Стандарт (Audible, Spotify, Apple Music). Без токена 403, с истёкшим 410. Защищает от кражи прямых ссылок. |
| 12.05.2026 | Express отдаёт MP3 через fs.createReadStream + Range | Достаточно для разработки и небольшой нагрузки. На VPS под нагрузкой переключим на nginx X-Accel-Redirect (опциональная оптимизация Фазы 7). |
| 12.05.2026 | Прогресс прослушивания делаем в 2.3 одновременно | Так в STEP-BY-STEP. Чтобы в 2.7 (плеер) уже было куда отправлять. |
| 12.05.2026 | Прогресс НЕ показываем на главной | Главная перегружена (клуб, цитата, бесплатные, популярные, реферал). Прогресс виден на экране книги (4.14) и в плеере. В Профиле в будущем (4.45). |
| 12.05.2026 | Аудио на Mac в `~/Chitatel_app/audio-storage/` | Симулирует `/var/audio/chitatel/` на VPS. При миграции — `rsync` + 3 строки в `.env`, код не меняется. |
| 12.05.2026 | ffmpeg ставим через evermeet.cx, НЕ brew | brew компилирует ffmpeg 30+ минут (openssl + 17 зависимостей). Готовый бинарник через curl — 30 секунд. |
| 12.05.2026 | Поиск как отдельный экран `/search` | Соответствует MASTER 4.11 и STEP-BY-STEP. Лупа в шапке каталога ведёт на /search. |
| 12.05.2026 | Debounce 300ms | Из STEP-BY-STEP задача 2.5. Стандартный для search в мобильных. |
| 11.05.2026 | **Кнопка «Купить на сайте автора» удалена** | Послабления Apple 3.1.1(a) только в US. Для Россия/СНГ — старые правила, риск reject. |
| 11.05.2026 | Заведена задача 3.6 (Активация промокода) в Фазе 3 | Заменяет удалённую кнопку. Apple такое разрешает (как у Audible, Kindle). |
| 11.05.2026 | Отзывы — оставляем placeholder | Решение юзера. В STEP-BY-STEP помечено как post-MVP. |
| 11.05.2026 | 2.5.5 на паузе — ждём Анну по пакетам | Эксклюзивные книги в пакетах — влияет на бизнес-модель. |
| 11.05.2026 | UX обложки на экране книги: 180×258 по центру | После 2 итераций. Вертикальные PNG обрезались при cover, тёмный баннер давал letterbox. |
| 27.04.2026 | Категории — хардкод | Не менялись 5 лет в reader-bot. Точка изменения одна. |
| 27.04.2026 | Пакеты вынесены в 2.5.5 | Чтобы 2.5 не разрастался. |
| 24.04.2026 | Схема Book расширяется в модели, MASTER не правится | Риск потерять контекст. Источник истины — `models/Book.js`. |
| 24.04.2026 | 55 обложек как Flutter-ассеты | ~30-40 МБ, в пределах лимита 4 ГБ. Мгновенный показ. |
| 06.04.2026 | Архивный доступ к клубу — 21 день | Уточнение от заказчика. |
| 15.03.2026 | Playfair Display через google_fonts | Не Onest. |

---

## ПРАВИЛА КОДА

- НЕ создавать заглушки-классы. Допустимы 1-2 строки хардкода в build-методе.
- AI-CONTEXT обновлять В ТОЙ ЖЕ СЕССИИ что и код.
- Схема Book — источник истины `server/src/models/Book.js`, НЕ MASTER 7.3.
- `coverImageUrl` с префиксом `asset://` обрабатывается `BookCoverImage`.
- Цены в UI — `book.priceUsd` (USD). В Фазе 3 — `Product.displayPrice` от StoreKit.
- **При багах: запросить полный лог терминала, прочитать ПЕРВУЮ ошибку.** НЕ гадать.
- **Для UX-проблем: спросить юзера прежде чем править.**
- **Apple compliance: перепроверять через web_search (2025+).** Не полагаться на память.
- **Аудио на iOS — строго MP3 или M4A.** OGG не поддерживается нативно. Конвертация через ffmpeg от evermeet.cx (не brew).
- **Flutter 3.22.3 — `withOpacity()`**, не `withValues()`.
- **Согласовывать ДО кода:** новые пакеты, варианты архитектуры (A/B). НЕ угадывать.
- **Если задача зависит от ответа заказчика — пауза.** Зафиксировать вопрос в AI-CONTEXT.

---

*Последнее обновление: 12.05.2026 (задача 2.3 серверная часть закрыта; следующая — 2.7 аудиоплеер Flutter)*
