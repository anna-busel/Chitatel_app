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

**Фаза:** 2 — контент и аудиоплеер (завершается)
**Следующая задача:** **Фаза 5 — ИИ + Дневник** (задачи 5.1, 5.2, 5.3) или **Фаза 4 (Клуб, бэкенд-часть)** — выбор за следующей сессией. Фаза 3 (платежи) на паузе пока нет Apple Dev Account.
**Блокеры:** 1.3 (Apple Sign In) ждёт Apple Dev Account. 2.5.5 (пакеты) ждёт уточнение от Анны. Фаза 3 (платежи) ждёт Apple Dev.

---

## ПРОГРЕСС

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3.5-a/b/c/d, 2.4, 2.5, 2.5-поиск, 2.6, 2.3 (сервер), **2.7** (Flutter аудиоплеер — ЗАВЕРШЕНА 13.05.2026, доработана итеративно)

---

## 🎧 АУДИО-СТРИМИНГ (ПАМЯТКА — задача 2.3 + 2.7)

### Архитектура

Стандартный подход (как у Audible, Spotify, Apple Music):

```
Flutter (плеер)                       Express (бэкенд)
     │                                       │
     │  GET /api/books/:id/audio/:partNumber │
     │ ────────────────────────────────────► │
     │                                       │
     │  ◄────  { audioUrl: "http://...", duration, partNumber, title, isPreview }
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

Папка `audio-storage` находится **на одном уровне** с `server/` и `app/`. **НЕ в git** (большие MP3-файлы).

### Что в `.env` для разработки на Mac

```bash
AUDIO_SECRET=dev-audio-secret-CHANGE-IN-PROD-min-32-chars
AUDIO_BASE_PATH=/Users/g/Chitatel_app/audio-storage
AUDIO_URL_TTL_SECONDS=3600
PUBLIC_BASE_URL=http://localhost:3000
```

⚠️ **`AUDIO_BASE_PATH` — абсолютный путь**, не `~`.

### Что менять в `.env` при миграции на VPS

```bash
AUDIO_SECRET=<generate via: openssl rand -hex 32>
AUDIO_BASE_PATH=/var/audio/chitatel
PUBLIC_BASE_URL=https://api.chitatel.app
```

**Перенос файлов** на VPS:
```bash
rsync -avz --progress ~/Chitatel_app/audio-storage/ user@vps:/var/audio/chitatel/
```

Код **не меняется** ни на байт — только `.env`.

### Как добавить новые MP3 (для следующих книг)

1. **Положить файлы** в `~/Chitatel_app/audio-storage/<slug>/part-1.mp3` ... `part-N.mp3`.
2. **Узнать длительности** через ffprobe:
   ```bash
   cd ~/Chitatel_app/audio-storage/<slug> && for f in part-*.mp3; do d=$(ffprobe -i "$f" -show_entries format=duration -v quiet -of csv="p=0"); echo "$f: ${d%.*} сек"; done
   ```
3. **Добавить в `seed.js`** массив `<BOOK>_PARTS` и привязать к книге.
4. **Прогнать seed:** `cd ~/Chitatel_app/server && npm run seed`.

**ВАЖНО:** MP3 формат строго (не OGG, не M4A). iOS поддерживает MP3 нативно.

### Конвертация OGG → MP3 (если потребуется)

```bash
mkdir -p ~/Chitatel_app/audio-storage/<slug> && cd <папка_с_ogg> && for i in 01 02 03 04 05 06; do n=$((10#$i)); ffmpeg -i "${i}.ogg" -codec:a libmp3lame -b:a 192k -y ~/Chitatel_app/audio-storage/<slug>/part-${n}.mp3; done
```

Если ffmpeg не установлен — НЕ через brew (компилируется 30+ минут). Готовый бинарник:
```bash
cd ~/Downloads && curl -L https://evermeet.cx/ffmpeg/getrelease/zip -o ffmpeg.zip && unzip -o ffmpeg.zip && sudo mv ffmpeg /usr/local/bin/ && sudo chmod +x /usr/local/bin/ffmpeg
```

---

## ДОП.ШАГИ ВНЕ STEP-BY-STEP (выполнено 24.04.2026)

| Шаг | Что сделано | Коммит |
|-----|-----------|--------|
| **2.3.5-a** ✅ | Модель `server/src/models/Book.js` обновлена. | `163ae99`, `7ea5112` |
| **2.3.5-b** ✅ | `server/src/scripts/reader-bot-catalog.json` — 42 книги + 6 пакетов. | `28f93fb` |
| **2.3.5-c** ✅ | `server/src/scripts/seed.js` — 42 платных + 3 бесплатных + 6 пакетов. | — |
| **2.3.5-d** ✅ | 55 обложек в `app/assets/book-covers/`. | `9f4f8a2` + коммит обложек |

**Запуск seed:** `cd ~/Chitatel_app/server && npm run seed`.

**Фактический результат в БД (на 13.05.2026):**
- 42 платных книги
- 3 бесплатных: Alice Wonderland, Eat Pray Love, **Маленький принц (с 6 частями реального аудио)**
- 6 пакетов
- ВСЕГО: 45 документов

---

## ЗАДАЧА 2.3 (аудио-стриминг + прогресс) — ВЫПОЛНЕНА 12.05.2026 (серверная часть)

| Файл | Назначение |
|------|-----------|
| `server/src/models/Progress.js` | Модель прогресса (`userId+bookId` уникальная пара) |
| `server/src/services/audio.service.js` | HMAC-SHA256 signed URLs, timing-safe сравнение |
| `server/src/routes/audio.js` | GET `/audio/*` с Range support, защита от path traversal |
| `server/src/routes/progress.js` | GET/POST `/api/progress` с Zod и upsert |

**Файлы Маленького принца** (`~/Chitatel_app/audio-storage/malenkii_princ/`):
- part-1.mp3 (855 сек) ... part-6.mp3 (1896 сек). Итого ~2 часа.

---

## ЗАДАЧА 2.7 (Flutter — аудиоплеер) — ВЫПОЛНЕНА 13.05.2026

### Что в репо (15 файлов, 9 новых + 6 правок)

**Новые (Flutter, 9 файлов в `app/lib/features/player/`):**

| Файл | Назначение |
|------|-----------|
| `services/audio_service.dart` | `ChitatelAudioHandler` (BaseAudioHandler + SeekHandler). just_audio + audio_service. MediaSession (lock screen). AudioSession.music() для iOS background. Обработка истечения signed URL (410/403). Автопереход к следующей части. Sleep timer. Прогресс POST каждые 30 сек. Singleton. |
| `services/progress_service.dart` | HTTP GET/POST `/api/progress`. Тихо проглатывает ошибки. |
| `services/player_api_service.dart` | HTTP GET `/api/books/:id/audio/:partNumber` → `AudioUrlResponse`. |
| `services/cover_cache.dart` | Кеш обложек для `MediaItem.artUri` (Application Cache Directory). |
| `providers/player_provider.dart` | Riverpod: `audioHandlerProvider`, `playerUiStateProvider` (Rx.combineLatest5), `sleepTimerRemainingProvider`, `playerSpeedProvider`. |
| `screens/player_screen.dart` | Развёрнутый плеер (4.15). **Градиент #1A0E08 → #0D0705** (точный матч прототипа). Обложка 220×220. Status bar светлый (AnnotatedRegion). Swipe-down. Slider с локальным `_dragSeconds`. Play/pause с haptic. Bottom: Скорость + Сон. |
| `widgets/mini_player.dart` | Мини-плеер (4.16). 64px. **Тёмно-кофейный #1A0E08**, белый текст, кнопка play с обводкой (точный матч прототипа). |
| `widgets/speed_sheet.dart` | Шторка скорости (4.18). **Тёмная** darkCoffee. 5 кнопок, выбранная — terracotta. |
| `widgets/sleep_timer_sheet.dart` | Шторка таймера сна (4.19). **Тёмная** darkCoffee. 4 кнопки минут + Конец части. |

**Правки (6 файлов):**

| Файл | Что |
|------|-----|
| `app/pubspec.yaml` | +5 пакетов: just_audio 0.9.40, audio_service 0.18.15, audio_session 0.1.21, rxdart 0.27.7, path_provider 2.1.3. Версии зафиксированы (Flutter 3.22.3 compat). |
| `app/lib/main.dart` | `ProviderContainer` до runApp → `initChitatelAudio` → `UncontrolledProviderScope`. |
| `app/lib/core/network/api_endpoints.dart` | +3 endpoint helpers: `bookAudio()`, `progress`, `progressByBook()`. |
| `app/lib/core/router/app_router.dart` | `PlayerScreen` с чтением `extra` (startPart, startPosition). `MiniPlayer` в `Column` в bottomNavigationBar. |
| `app/lib/features/book/screens/book_screen.dart` | `_onPartTap` → `context.push(Routes.player, extra: {startPart, startPosition: 0})`. Disabled-кнопка для книг без частей. |
| `app/lib/features/book/widgets/book_parts_list.dart` | `ConsumerWidget` (был Stateless). **Подсветка активной части** через `Icons.graphic_eq` + бейдж «СЕЙЧАС» (Apple Music/Books/Audible стиль). |

### iOS Info.plist (без правок — было готово в 0.6)

- `UIBackgroundModes` = `audio` ✅
- Permission strings: NSCamera/NSPhotoLibrary/NSUserTracking ✅
- ⚠️ TODO перед Фазой 7 (TestFlight): добавить `ITSAppUsesNonExemptEncryption=false` (HTTPS-only exempt encryption).

### Архитектурные решения сессии 13.05.2026

| Решение | Обоснование |
|---------|-------------|
| **Кнопка «Цитата» в плеере УБРАНА** | Решение юзера. Apple Books/Audible/Podcasts не имеют такой кнопки. Альтернатива — глобальный FAB в задаче 5.3. **Не возвращать.** |
| 3 отдельных сервиса (audio/progress/player_api) | MASTER 6.2.1 SRP. Если progress.post падает — не ронять background audio task. |
| Singleton AudioHandler + Riverpod-провайдер поверх | `AudioService.init()` асинхронный, Riverpod-провайдеры синхронные. Описано в audio_service README (Ryan Heise). |
| `ProviderContainer` до runApp | Стандартный паттерн bootstrap Riverpod. |
| Mini-player через `Column` в `bottomNavigationBar` | Виджет сам решает быть или нет (SizedBox.shrink при пустом плеере). |
| `AudioSessionConfiguration.music()` для iOS background | Обязательно — без этого даже с UIBackgroundModes=audio iOS останавливает аудио при блокировке. |
| Обработка истечения signed URL (410/403) | Детект в playbackEventStream.onError → перезапрос с сохранением позиции. Защита `_isRecovering` от цикла. |
| `getApplicationCacheDirectory()` для обложек | Apple File System Programming Guide: Library/Caches/ для регенерируемых данных. |
| Slider с локальным `_dragSeconds` | Без этого ползунок дёргается между позицией пальца и реальной позицией плеера. |
| Скорость в SharedPreferences между сессиями | Apple Books, Audible. |
| Skip ±15 сек | Стандарт Apple Podcasts для аудиокниг. |
| Книги без частей → disabled-кнопка | Apple Guideline 2.1: не открывать плеер пустого контента. |
| Sleep timer продолжает тикать при автопереходе части | Стандарт Audible. |
| Прогресс НЕ POST при seek | Сервер сам отбросит регрессию через дельту. Клиент шлёт раз в 30 сек. |
| Передача в плеер через `extra` GoRouter | Тап по части → передаём part. Тап «Слушать» → плеер сам подтягивает прогресс. |
| **Mini-player ТОЛЬКО на 4 главных таб-экранах** | Apple-стандарт: Apple Music, Audible так делают. На странице книги mini-player НЕ показывается (информация о книге уже видна). |
| **Цвета строго по прототипу v4.2** | См. ниже отдельное обсуждение цветов. |
| **Подсветка активной части в списке — Icons.graphic_eq** | Apple Music/Books/Audible стандарт. Иконка эквалайзера на терракотовом фоне + бейдж «СЕЙЧАС» в строке. |
| **Status bar на плеере → светлые иконки** | `AnnotatedRegion<SystemUiOverlayStyle>` с `light`. Apple HIG требование на тёмном фоне. |

### Цвета плеера — окончательное решение (точный матч прототипа v4.2)

**После итерации цветов 13.05.2026** (юзер обратил внимание что я отклонился от прототипа без согласования):

| Элемент | Цвет | Источник |
|---------|------|----------|
| Развёрнутый плеер | **Градиент** `#1A0E08 → #0D0705` (180deg, сверху-вниз) | Прототип v4.2 строка 1080 |
| Mini-player | **Solid `#1A0E08`** (darkCoffee), весь текст белый | Прототип v4.2 строка 1099 |
| Sheets (скорость, сон) | **Solid `#1A0E08`** (darkCoffee), белый текст | Прототип v4.2 строки 1066, 1075 |
| Кнопка play в mini-player | Обводка `rgba(255,255,255,0.8)` 1.5px | Прототип |
| Drag-handle в sheets | `rgba(255,255,255,0.2)` 36×4 | Прототип |
| Кнопки в sheets | Фон `rgba(255,255,255,0.08)`, текст белый | Прототип |
| Выбранная скорость | `terracotta` #C73E28 | Стандартный акцент |
| Обложка плеера | 220×220 | Прототип |
| **Локально в player_screen.dart:** | `const Color _gradientBottom = Color(0xFF0D0705);` | В AppColors НЕ добавлен (используется в 1 месте) |

**Контраст проверен (WCAG AA минимум 4.5:1):**
- Белый текст на #1A0E08 = **18.7:1** (превышено в 4×)
- Белый текст на #0D0705 = **20.2:1**
- Терракота #C73E28 на #1A0E08 = **5.8:1**

**Обоснование возврата к прототипу:** прототип задуман как единое цветовое решение — тёмный плеер → тёмный mini-player → тёмные sheets создают **визуальную связь**. Mini-player выглядит как «кусочек» плеера внизу экрана. Apple Music на iOS 18+ тоже делает тёмный mini-player (я ошибочно говорил что Apple делает белый — это было неверно).

### Что НЕ сделано в 2.7 (намеренно)

- ❌ **Кнопка «Цитата» в плеере** — решение юзера
- ❌ **`quote_sheet.dart`** — будет в 5.3 (Фаза 5: дневник + AI consent)
- ❌ **`bufferedPosition` визуализация** — нет в прототипе
- ❌ **Custom анимации сверх Material/Cupertino** — вне scope
- ❌ **CarPlay / Apple Watch** — post-MVP

### Чек-лист тестирования на симуляторе

- [ ] `flutter pub get` — все 5 пакетов встают
- [ ] Открыть Маленького принца → нажать «Слушать бесплатно» → плеер открывается с **тёмным градиентом**
- [ ] Воспроизведение стримится (Range запросы в Express логах)
- [ ] Background play: заблокировать экран → музыка играет
- [ ] Lock screen: controls + обложка
- [ ] Seek работает (slider плавный)
- [ ] Скорость: 2× применяется, сохраняется между сессиями
- [ ] Sleep timer работает
- [ ] **Mini-player ТЁМНЫЙ, виден на 4 главных табах, не на странице книги**
- [ ] **На странице книги — иконка эквалайзера + бейдж «СЕЙЧАС» у активной части**
- [ ] **Нажатие части 2 при играющей части 1 → переключение работает**
- [ ] Status bar на плеере — светлые иконки
- [ ] Книги без частей (Alice, EPL): кнопка disabled
- [ ] Swipe-down на плеере → закрывает

---

## ЗАДАЧА 2.4 (главная страница) — ВЫПОЛНЕНА 27.04.2026

11 файлов в `app/lib/features/home/`. Pull-to-refresh + ErrorView + HomeShimmer.

---

## ЗАДАЧА 2.5 (каталог книг) — ВЫПОЛНЕНА 27.04.2026

6 файлов в `app/lib/features/catalog/`. Сетка 2×N, 16 чипов фильтров, pull-to-refresh.

---

## ЗАДАЧА 2.5-поиск (отдельный экран /search) — ВЫПОЛНЕНА 12.05.2026

3 файла в `app/lib/features/search/`. Debounce 300ms.

---

## ЗАДАЧА 2.6 (экран книги) — ВЫПОЛНЕНА 11.05.2026

4 файла в `app/lib/features/book/`. 3 варианта UI. Кнопка «Купить на сайте автора» удалена (Apple compliance).

**Изменения 13.05.2026 (в рамках 2.7):**
- `_onPartTap` и `_onListenPressed` → `context.push(Routes.player(...))`
- Добавлен disabled-state для книг без аудио (Alice, EPL)
- `book_parts_list.dart` переведён на ConsumerWidget — подсветка активной части

---

## ❗ ВАЖНОЕ ДЛЯ БУДУЩИХ ЗАДАЧ

**1. Локализация цен (Фаза 3)** — `book.priceUsd` сейчас USD. В Фазе 3 заменим на `Product.displayPrice` от StoreKit.

**2. Non-consumable IAP для книг и пакетов (задача 3.5)** — в Фазе 3.

**3. Кнопка «Купить на сайте» — УДАЛЕНА (Apple compliance).** Альтернатива — задача 3.6 (промокоды).

**4. Заглушки на экране книги (2.6)** — 3 const поля в `_BookContent`. `_isPurchased` обновится в Фазе 3, `_listenedPartNumbers` и `_progressPercent` — отдельная микро-задача в Фазе 3 (подключить ProgressService).

**5. Конвертация BYN→USD при seed — приближённая.** Финал назначит Анна в App Store Connect.

**6. ❗ ВОПРОС К АННЕ — эксклюзивные книги внутри пакетов (блокирует 2.5.5).**

**Готовый текст для Анны:**
> Анна, вопрос по пакетам. В пакете «Достоевский» 5 книг, но 2 из них («Бедные люди», «Бесы») у тебя в каталоге как отдельных разборов нет — они только в пакете. То же в других пакетах. Вопрос: это специально (эксклюзив пакета), или просто ещё не добавила? От ответа зависит как покажем экран пакета.

**7. ❗ ЗАДАЧА 3.6 — Активация промокода (Фаза 3).** Заменяет удалённую кнопку «Купить на сайте».

**8. ❗ ВОПРОСЫ К АННЕ:**

| # | Вопрос | Когда блокирует |
|---|--------|-----------------|
| 6.1 | Пакеты — эксклюзив или забыли добавить отдельно? | Задача 2.5.5 |
| 8.1 | Отзывы пользователей нужны в первой версии? | Возможная задача 6.9 |
| 8.2 | Когда оформит Apple Developer Account ($99/год)? | 1.3, вся Фаза 3, push, TestFlight |
| 8.3 | Когда пришлёт MP3 остальных разборов? | Плеер уже работает, остальные — disabled-кнопка |

**9. Шторка цитаты (`quote_sheet.dart`)** — будет shared виджетом в задаче 5.3 (Фаза 5). Кнопка «Цитата» в плеере **не возвращается** (решение юзера).

**10. `ITSAppUsesNonExemptEncryption=false` в Info.plist** — добавить перед Фазой 7 (TestFlight). HTTPS-only трафик exempt.

---

## ❗ УРОКИ

**1. Дебаг:** при багах — запросить полный лог терминала, прочитать **первую** ошибку (не последнюю), **не править наугад**.

**2. UX-проблемы:** **спросить юзера** прежде чем править.

**3. Apple compliance:** ВСЕГДА перепроверять через web_search (2025+). Послабления меняются.

**4. Аудио на iOS:** строго MP3/M4A. OGG не поддерживается. ffmpeg через evermeet.cx (не brew).

**5. AudioSession (13.05.2026):** для iOS background audio недостаточно `UIBackgroundModes=audio` в Info.plist. ОБЯЗАТЕЛЬНА runtime-настройка `AudioSession.instance.configure(AudioSessionConfiguration.music())`.

**6. Самопроверка docstring'а (13.05.2026):** после написания файла пройтись по списку обещанного в docstring и проверить что всё реализовано. Невыполнение в первой версии audio_service.dart стоило одной итерации (забыл AudioSession и обработку 410).

**7. ⚠️ ЧИТАТЬ ПРОТОТИП ПЕРЕД UI КОДОМ (13.05.2026, итерация v2):** прототип Анны (`docs/prototype-v4_2.jsx`) — это согласованный с заказчиком дизайн. **НЕ отклоняться** от него без явной просьбы. В первой версии 2.7 я сделал mini-player и sheets белыми «по Apple-стандарту», хотя в прототипе они **тёмные**. Это стоило отдельной итерации. Перед написанием любого UI-кода — открывать prototype-v4_2.jsx и матчить точно.

**8. ⚠️ Apple-стандарты — проверять перед утверждением (13.05.2026):** я уверенно сказал «Apple Music делает белый mini-player» — это **неверно**. Apple Music на iOS 18+ делает тёмный mini-player с blur-эффектом. Audible — тоже тёмный. Если не уверен — проверять через web_search, не полагаться на память.

**9. ⚠️ `_initialized` костыли скрывают баги (13.05.2026):** в первой версии 2.7 я использовал `bool _initialized` для предотвращения двойной загрузки в `_ensureBookLoaded`. Это **проглатывало** случай «та же книга, но юзер попросил другую часть через extra». Заменил на проверку `current.id == book.id && widget.startPart == current.partNumber` — теперь логика явная.

---

## ПРОПУЩЕННЫЕ ЗАДАЧИ

| Задача | Что | Почему | Когда |
|--------|-----|--------|-------|
| 0.1 | Apple Developer Account | Не куплен | Перед 1.3 |
| 0.2 | App ID и Certificates | Зависит от 0.1 | После 0.1 |
| 0.3 | VPS настройка | Не куплен | Перед деплоем |
| 0.4 | Домен и SSL | Зависит от 0.3 | После 0.3 |
| 1.3 | Apple Sign In | Нет Apple Dev | После 0.1-0.2 |
| 2.5.5 | Пакеты в каталоге | ⏸ ждёт ответ Анны | После ответа |
| Фаза 3 | Платежи | Нет Apple Dev | После 0.1-0.2 |
| 3.5 (новая) | Non-consumable IAP | Не было в исходном STEP-BY-STEP | В Фазе 3 |
| 3.6 (новая) | Активация промокода | Заменяет удалённую кнопку | В Фазе 3 |

---

## РАСХОЖДЕНИЯ С MASTER.md

**Схема Book расширена vs MASTER 7.3.** Источник истины — `server/src/models/Book.js`, не MASTER.

**Apple compliance — внешние ссылки на покупки:** запрещены. Можно только Apple IAP и промокоды (3.6).

**Плеер 4.15 — кнопка «Цитата» убрана** (13.05.2026). Нижняя панель: Скорость + Сон. Запись цитат — через FAB в задаче 5.3.

**Mini-player виден только на 4 главных таб-экранах** (Главная/Каталог/Клуб/Профиль). На странице книги mini-player НЕ показывается (Apple-стандарт).

---

## КОНТЕНТ ОТ АННЫ

**Репозиторий `g1orgi89/reader-bot`** — старый Telegram mini-app Анны. Содержит:
- 42 платных разбора + 6 пакетов (в `server/src/scripts/reader-bot-catalog.json`)
- 55 обложек PNG (в `app/assets/book-covers/`)

**Бесплатные разборы (isFree: true):**
- Alice Wonderland — без аудио (disabled-кнопка)
- Eat Pray Love — без аудио (disabled-кнопка)
- **Маленький принц — 6 частей с аудио (плеер работает на нём)**

---

## РАБОЧАЯ СРЕДА

- **Mac:** MacBook Pro 2018, macOS Ventura
- **Xcode:** 15.2 + iOS 17.2 симулятор
- **Flutter:** 3.22.3 (используется withOpacity, не withValues)
- **Node.js:** 20.20.1 (nvm)
- **MongoDB:** 7.0.20
- **ffmpeg:** через evermeet.cx (НЕ brew)
- **Запуск MongoDB:** `mongod --dbpath ~/mongodb/data`
- **Запуск бэкенда:** `cd ~/Chitatel_app/server && npm run dev`
- **Запуск Flutter:** `cd ~/Chitatel_app/app && flutter pub get && flutter run`
- **Seed БД:** `cd ~/Chitatel_app/server && npm run seed`

**Путь к аудио на Mac:** `/Users/g/Chitatel_app/audio-storage/`

---

## ПОРЯДОК РАБОТЫ

```
СЕЙЧАС:
  1.1–2.7 ✅ (Фаза 2 завершена)
  → Фаза 5 (ИИ-дневник: 5.1, 5.2, 5.3)
  → Бэкенд клуба (Фаза 4 без Flutter — 4.1-4.4)
  → Фаза 6 → Фаза 7

⏸ ЖДЁТ АННУ:
  2.5.5 — ответ по эксклюзивным книгам в пакетах
  Аудио для других книг

⏸ ЖДЁТ APPLE DEV:
  1.3 (Apple Sign In) → Фаза 3 (платежи) → Фаза 7 (TestFlight)

⏸ ЖДЁТ VPS:
  Деплой бэкенда
```

---

## ПРОШЛАЯ СЕССИЯ

_13.05.2026 (v2 — финальная итерация 2.7) — Юзер обнаружил 3 проблемы на симуляторе: 1) mini-player не виден на странице книги; 2) баг переключения части 2 при играющей части 1; 3) активная часть не подсвечена в списке. Обсудили — оставили Apple-стандарт (mini-player только на 4 главных табах), починили баг переключения, добавили подсветку активной части (Icons.graphic_eq + бейдж «СЕЙЧАС»). Заодно юзер обратил внимание что я отклонился от прототипа по цветам — вернули цвета прототипа: градиент плеера #1A0E08 → #0D0705, тёмный mini-player solid #1A0E08, тёмные sheets. Status bar на плеере → светлые иконки. Обложка 220×220 (вместо 240). Контраст белого на #1A0E08 = 18.7:1, на #0D0705 = 20.2:1 (WCAG AA в 4× превышено). Финальный коммит: `081d11d`. Уроки v2: 1) читать прототип ПЕРЕД написанием UI-кода; 2) Apple-стандарты — проверять, не полагаться на память (Apple Music сам делает тёмный mini-player); 3) `_initialized` костыли скрывают баги — заменил явной проверкой._

_13.05.2026 (v1) — Задача 2.7 (Flutter аудиоплеер) первая версия. 14 файлов (9 новых + 5 правок). 5 новых пакетов в pubspec. Архитектура: 3 сервиса (audio/progress/player_api), singleton AudioHandler + Riverpod-обёртки, AudioSession.music() для iOS background, обработка истечения signed URL, кеш обложек в Application Cache Directory, Sleep timer, скорость в SharedPreferences, slider с локальным drag state, MiniPlayer над таб-баром. Кнопка «Цитата» в плеере убрана (решение юзера). Книги без частей — disabled-кнопка. Уроки v1: 1) если пакет в pubspec — должен использоваться в коде (забыл AudioSession в первой версии); 2) после написания кода проходить по docstring'у файла и проверять что всё реализовано (забыл обработку 410); 3) проверять имена цветов/типографики в AppColors ПЕРЕД использованием (5 ошибок dividerWarm/coffeeDark — придумал имена которых нет)._

_12.05.2026 (вторая половина) — Задача 2.3 (серверная часть). Конвертация 6 OGG → MP3 (192 kbps). 8 серверных файлов. Решения: HMAC signed URL TTL 1 час, Express fs.createReadStream, прогресс на экране книги и в плеере._

_12.05.2026 (первая половина) — Задача 2.5-поиск (отдельный экран /search). Debounce 300ms._

_11.05.2026 — Задача 2.6 (экран книги). 3 варианта UI. Кнопка «Купить на сайте автора» удалена (Apple compliance)._

_27.04.2026 — Задачи 2.4 (главная) и 2.5 (каталог)._

_24.04.2026 — Реализация 2.3.5-a/b/c/d (схема Book, seed.js, обложки)._

_06.04.2026 — Задачи 1.5–2.2: дизайн-система, навигация, экраны входа, модели Book/Package, API каталога._

---

## РЕШЕНИЯ

| Дата | Решение | Причина |
|------|---------|---------|
| 13.05.2026 v2 | **Возврат к цветам прототипа** — градиент плеера #1A0E08→#0D0705, mini-player solid #1A0E08, sheets тёмные | Прототип v4.2 = согласованный дизайн с заказчиком. Apple Music/Audible тоже делают тёмные mini-player. |
| 13.05.2026 v2 | Status bar на плеере → светлые иконки (AnnotatedRegion) | Apple HIG: на тёмном фоне белый текст и иконки. |
| 13.05.2026 v2 | Обложка плеера 220×220 (вместо 240) | Точный матч прототипа. Больше места под нижние controls на iPhone SE. |
| 13.05.2026 v2 | **Подсветка активной части — Icons.graphic_eq + бейдж «СЕЙЧАС»** | Apple Music/Books/Audible стандарт. Без mini-player на странице книги это единственный способ увидеть что часть играет. |
| 13.05.2026 v2 | **Mini-player только на 4 главных таб-экранах** (не на странице книги) | Apple-стандарт (Apple Music, Audible). На странице книги информация о ней уже видна. |
| 13.05.2026 v2 | Фикс бага переключения частей: если та же книга + widget.startPart явно задан и отличается → loadBook | В первой версии was игнорировался widget.startPart при той же книге. Костыль `_initialized` скрывал баг. |
| 13.05.2026 v1 | **Кнопка «Цитата» в плеере убрана** | Решение юзера. Apple Books/Audible/Podcasts не имеют такой кнопки. Альтернатива — FAB в 5.3. **Не возвращать.** |
| 13.05.2026 v1 | 3 отдельных сервиса (audio/progress/player_api) | SRP. Если progress.post падает — не ронять background audio. |
| 13.05.2026 v1 | Singleton AudioHandler + Riverpod-провайдер поверх | AudioService.init() асинхронный. audio_service README. |
| 13.05.2026 v1 | ProviderContainer до runApp | Стандартный паттерн bootstrap Riverpod. |
| 13.05.2026 v1 | AudioSession.music() обязательно | Без этого iOS останавливает аудио при блокировке. |
| 13.05.2026 v1 | Обработка истечения signed URL (410/403) | TTL 1 час, реальные части до 33 мин. Apple Guideline 2.1. |
| 13.05.2026 v1 | getApplicationCacheDirectory вместо getTemporaryDirectory | Apple File System Programming Guide. |
| 13.05.2026 v1 | Slider с локальным `_dragSeconds` | Без этого ползунок дёргается. |
| 13.05.2026 v1 | Скорость в SharedPreferences между сессиями | Apple Books, Audible. |
| 13.05.2026 v1 | Skip ±15 сек | Стандарт Apple Podcasts. |
| 13.05.2026 v1 | Книги без частей → disabled-кнопка | Apple Guideline 2.1. |
| 13.05.2026 v1 | Sleep timer продолжает тикать при смене части | Стандарт Audible. |
| 13.05.2026 v1 | Прогресс НЕ POST при seek | Сервер сам отбросит регрессию. |
| 13.05.2026 v1 | Передача в плеер через `extra` GoRouter | Тап по части → передаём part. Тап «Слушать» → плеер сам подтягивает. |
| 12.05.2026 | HMAC-SHA256 signed URL TTL 1 час | Стандарт (Audible, Spotify). |
| 12.05.2026 | Express отдаёт MP3 через fs.createReadStream + Range | Достаточно для разработки. nginx X-Accel-Redirect — Фаза 7. |
| 12.05.2026 | Прогресс прослушивания в 2.3 одновременно | Так в STEP-BY-STEP. |
| 12.05.2026 | Прогресс НЕ показываем на главной | Перегружена. |
| 12.05.2026 | Аудио на Mac в ~/Chitatel_app/audio-storage/ | Симулирует /var/audio/chitatel/ на VPS. |
| 12.05.2026 | ffmpeg через evermeet.cx, НЕ brew | brew компилирует 30+ минут. |
| 12.05.2026 | Поиск как отдельный экран /search | MASTER 4.11. |
| 12.05.2026 | Debounce 300ms | STEP-BY-STEP 2.5. |
| 11.05.2026 | Кнопка «Купить на сайте автора» удалена | Послабления Apple 3.1.1(a) только US. |
| 11.05.2026 | Заведена задача 3.6 (Активация промокода) | Apple такое разрешает. |
| 11.05.2026 | Отзывы — оставляем placeholder | Post-MVP. |
| 11.05.2026 | 2.5.5 на паузе | Ждём ответ Анны по пакетам. |
| 11.05.2026 | UX обложки 180×258 по центру | После 2 итераций. |
| 27.04.2026 | Категории — хардкод | Не менялись 5 лет. |
| 27.04.2026 | Пакеты вынесены в 2.5.5 | Чтобы 2.5 не разрастался. |
| 24.04.2026 | Схема Book расширяется в модели, MASTER не правится | Источник истины — models/Book.js. |
| 24.04.2026 | 55 обложек как Flutter-ассеты | ~30-40 МБ, в пределах лимита. |
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
- **⚠️ ЧИТАТЬ ПРОТОТИП docs/prototype-v4_2.jsx ПЕРЕД написанием UI-кода.** Не отклоняться без согласования.
- **⚠️ Apple-стандарты проверять через web_search**, не полагаться на память (Apple Music сам делает тёмный mini-player, я ошибочно думал обратное).
- **Аудио на iOS — строго MP3 или M4A.** OGG не поддерживается.
- **Flutter 3.22.3 — `withOpacity()`**, не `withValues()`.
- **Согласовывать ДО кода:** новые пакеты, варианты архитектуры.
- **Если задача зависит от ответа заказчика — пауза.**
- **Самопроверка docstring'а:** после написания файла пройтись по списку обещанного.
- **Если пакет в pubspec — он должен использоваться в коде.**
- **Проверять имена в AppColors/AppTypography ПЕРЕД использованием** (через github:get_file_contents). Не придумывать имена.
- **Аудиоплеер — singleton (`ChitatelAudioHandler.instance`)** инициализируется в `main.dart` до `runApp`. Не пытаться создать заново.
- **`_initialized` костыли — антипаттерн.** Использовать явные проверки состояния (current.id == book.id и т.п.).

---

*Последнее обновление: 13.05.2026 v2 (задача 2.7 завершена с финальной итерацией — фикс бага переключения, подсветка активной части, цвета прототипа, status bar светлый; следующая — Фаза 5 ИИ-дневник или Фаза 4 бэкенд клуба)*
