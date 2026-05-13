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

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3.5-a/b/c/d, 2.4, 2.5, 2.5-поиск, 2.6, 2.3 (сервер), **2.7** (Flutter аудиоплеер — ЗАВЕРШЕНА 13.05.2026)

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

# 3. Скачать первый килобайт через signed URL
curl -H "Range: bytes=0-1000" -i '<audioUrl>'
```

### Что НЕ сделано (намеренно, для оптимизации Фазы 7)

- ❌ **nginx X-Accel-Redirect** — Express отдаёт через `fs.createReadStream`. На VPS под нагрузкой переключим на nginx (опциональная оптимизация Фазы 7).
- ❌ **Адаптивный битрейт (HLS)** — Анна публикует 192kbps. HLS добавим если будут жалобы.

---

## ДОП.ШАГИ ВНЕ STEP-BY-STEP (выполнено 24.04.2026)

Шаги возникли после изучения реального контента Анны (`g1orgi89/reader-bot`). Все выполнены.

| Шаг | Что сделано | Коммит |
|-----|-----------|--------|
| **2.3.5-a** ✅ | Модель `server/src/models/Book.js` обновлена. `routes/books.js` пофикшен под `categories`. | `163ae99`, `7ea5112` |
| **2.3.5-b** ✅ | `server/src/scripts/reader-bot-catalog.json` — 42 книги + 6 пакетов. | `28f93fb` |
| **2.3.5-c** ✅ | `server/src/scripts/seed.js` — `npm run seed` вставляет 42 платных + 3 бесплатных + 6 пакетов. | — |
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

**Файлы Маленького принца** (~`/Chitatel_app/audio-storage/malenkii_princ/`):
- part-1.mp3 (855 сек) ... part-6.mp3 (1896 сек). Итого ~2 часа.

---

## ЗАДАЧА 2.7 (Flutter — аудиоплеер) — ВЫПОЛНЕНА 13.05.2026

### Что в репо (14 файлов, 9 новых + 5 правок)

**Новые (Flutter):**

| Файл | Назначение |
|------|-----------|
| `app/lib/features/player/services/audio_service.dart` | `ChitatelAudioHandler` (BaseAudioHandler + SeekHandler). just_audio + audio_service. MediaSession (lock screen / Control Center). AudioSession.music() для iOS background. Обработка истечения signed URL (410/403) → перезапрос с сохранением позиции. Автопереход к следующей части. Sleep timer (15/30/45/60 мин или до конца части). Прогресс POST каждые 30 сек + pause + автопереход. Singleton `ChitatelAudioHandler.instance`. |
| `app/lib/features/player/services/progress_service.dart` | HTTP `GET/POST /api/progress`. Тихо проглатывает ошибки (Apple HIG: не прерывать UX из-за фоновых операций). `kDebugMode` логи. |
| `app/lib/features/player/services/player_api_service.dart` | HTTP `GET /api/books/:id/audio/:partNumber` → `AudioUrlResponse`. |
| `app/lib/features/player/services/cover_cache.dart` | Кеш обложек для `MediaItem.artUri` (lock screen). http→как есть, asset→копия в Application Cache Directory (Apple File System Programming Guide), пусто→null. Проверка `File.exists()` перед переиспользованием. |
| `app/lib/features/player/providers/player_provider.dart` | Riverpod-обёртки: `audioHandlerProvider`, `playerUiStateProvider` (Rx.combineLatest5 — playerState/position/duration/speed/mediaItem), `sleepTimerRemainingProvider`, `playerSpeedProvider` (с SharedPreferences между сессиями). |
| `app/lib/features/player/screens/player_screen.dart` | Развёрнутый плеер (4.15). Тёмный фон #1A0E08. Обложка 240×240 с тенью. Swipe-down dismissal. Slider с локальным `_dragSeconds` (без скачков при перетягивании). Play/pause big с haptic feedback. ±15 сек. Bottom controls: Скорость + Сон (**кнопка Цитата убрана — см. ниже**). Loading/Error state. |
| `app/lib/features/player/widgets/mini_player.dart` | Мини-плеер (4.16). Высота 64px. Виден только когда `hasContent==true`. Tap → переход в плеер. |
| `app/lib/features/player/widgets/speed_sheet.dart` | Шторка скорости (4.18). 5 кнопок в строку. Выбранная — терракота. |
| `app/lib/features/player/widgets/sleep_timer_sheet.dart` | Шторка таймера сна (4.19). Если активен — счётчик + «Отменить». Иначе — 4 кнопки минут (2×2) + «Конец части» (полная ширина). |

**Правки:**

| Файл | Что |
|------|-----|
| `app/pubspec.yaml` | +5 пакетов: `just_audio: ^0.9.40`, `audio_service: ^0.18.15`, `audio_session: ^0.1.21`, `rxdart: ^0.27.7`, `path_provider: ^2.1.3`. Версии зафиксированы — latest несовместим с Flutter 3.22.3 (just_audio 0.10+ ломает API, audio_service 0.19+ требует Flutter 3.27+). |
| `app/lib/main.dart` | `ProviderContainer` создаётся **до** runApp → `initChitatelAudio` через `container.read(...)` → `UncontrolledProviderScope` с тем же контейнером. Стандартный паттерн Riverpod для bootstrap singleton'ов. |
| `app/lib/core/network/api_endpoints.dart` | +3 endpoint helpers: `bookAudio(bookId, partNumber)`, `progress`, `progressByBook(bookId)`. |
| `app/lib/core/router/app_router.dart` | `_Placeholder('Плеер: $bookId')` → `PlayerScreen(bookId, startPart?, startPosition?)` с чтением `extra`. В `_ScaffoldWithBottomBar` добавлен `MiniPlayer` над `AppBottomBar` через `Column`. |
| `app/lib/features/book/screens/book_screen.dart` | 4 SnackBar-заглушки заменены: `_onPartTap` → `context.push(Routes.player, extra: {startPart, startPosition: 0})`, `_onListenPressed` → `context.push(Routes.player)` без extra (плеер сам подтянет прогресс). Добавлен флаг `hasAudio = book.parts.isNotEmpty` — кнопка disabled с текстом «Аудио загружается» (или «Аудио будет доступно скоро» для платной). Apple Guideline 2.1. |

### iOS Info.plist (без правок — было готово в 0.6)

- `UIBackgroundModes` = `audio` ✅
- Permission strings: NSCamera/NSPhotoLibrary/NSUserTracking ✅

### Архитектурные решения сессии 13.05.2026

| Решение | Обоснование |
|---------|-------------|
| **Кнопка «Цитата» в плеере УБРАНА** — в нижней панели только Скорость и Сон | Отклонение от MASTER 4.15 и сценария 3.4. Решение юзера: «не надо добавлять цитату это как-то странно». Apple Books/Audible/Apple Podcasts не имеют кнопки цитат в плеере. Альтернатива — глобальный FAB (плавающая кнопка пера) на других экранах, появится в задаче 5.3 (Фаза 5 — дневник). **Не возвращать в будущих сессиях.** |
| **3 отдельных сервиса** (audio/progress/player_api) вместо 1 | MASTER 6.2.1 «SRP — одна ответственность на файл». HTTP-логика отдельно от playback. Если progress.post падает — не должен ронять background audio task. |
| **`ChitatelAudioHandler.instance` синхронный singleton** + Riverpod-провайдер поверх | `AudioService.init()` асинхронный, Riverpod-провайдеры синхронные. Singleton-паттерн описан автором audio_service Ryan Heise в README. Альтернатива (FutureProvider везде) усложняет UI. |
| **`ProviderContainer` создаётся до runApp** | Стандартный паттерн Riverpod для bootstrap. AudioHandler читает зависимости через `container.read()`, тот же контейнер передаётся в `UncontrolledProviderScope`. |
| **Mini-player через `Column` в `bottomNavigationBar`** | Виджет сам решает быть или нет (через `ref.watch(playerUiStateProvider)` → SizedBox.shrink при пустом плеере). Не требует переделки роутера. |
| **`AudioSessionConfiguration.music()` для iOS background** | Обязательно — без этого даже с `UIBackgroundModes=audio` аудио останавливается при блокировке экрана. Apple Guideline 2.1 risk. |
| **Обработка истечения signed URL (410/403)** | `_player.playbackEventStream.listen(onError: ...)` → детект `'410'/'Gone'/'403'/'Forbidden'` в сообщении → `_loadPart` с сохранённой позицией и состоянием play/pause. Защита `_isRecovering` от бесконечного цикла. Apple Guideline 2.1: «complete app, no broken functionality». |
| **`getApplicationCacheDirectory()` для обложек, не `getTemporaryDirectory()`** | Apple File System Programming Guide рекомендует Library/Caches/ для регенерируемых данных. iOS может почистить — поэтому `File.exists()` проверяется перед каждым использованием. |
| **Slider с локальным `_dragSeconds`** | Без этого ползунок дёргается между позицией пальца юзера и реальной позицией плеера. Стандартный паттерн из официального примера just_audio. |
| **Скорость сохраняется в SharedPreferences** (`player_speed` key) | Apple Books, Audible так делают. Юзер выбрал 1.5× → следующий разбор играет с 1.5×. |
| **Speed/sleep sheet — белый фон** на тёмном плеере | Apple Music, Apple Books, Audible так делают. Контраст улучшает иерархию, совпадает с общим стилем приложения. |
| **Drag-handle 36×4 в sheet'ах** | Стандарт iOS, цвет `AppColors.dividerWarm`. |
| **Книги без частей → disabled-кнопка «Аудио загружается»** | У Анны Alice/EPL без аудио. Если юзер нажмёт «Слушать» с пустыми parts → плеер откроется и упадёт. Apple Guideline 2.1 reject risk. |
| **Sleep timer + автопереход части продолжает тикать** | Стандарт Audible. Юзер поставил 30 мин — должно тикать независимо от смены части. |
| **Sleep timer «Конец части» останавливается на естественном завершении** | Если юзер вручную нажал — таймер остаётся до естественного завершения, seek назад не сбрасывает. |
| **Skip ±15 сек** (не 30) | Стандарт Apple Podcasts для подкастов и медленного контента типа аудиокниг. |
| **Автопереход к следующей части** | Стандарт Apple Audiobooks. На последней части — pause. |
| **Прогресс НЕ POST при seek** | Сервер сам считает дельту секунд только при `currentPart===previousPart && positionSeconds > previousSeconds`. Откаты/смена части не накапливают `totalListenedSeconds`. Клиент шлёт каждые 30 сек, сервер фильтрует. |
| **Передача в плеер через `extra` GoRouter** | `context.push(Routes.player(id), extra: {'startPart': N, 'startPosition': S})`. Тап по части в списке → передаём part. Тап «Слушать» → без extra → плеер подтягивает прогресс с сервера. |

### Что НЕ сделано в 2.7 (намеренно)

- ❌ **Кнопка «Цитата» в плеере** — решение юзера, см. выше
- ❌ **`quote_sheet.dart`** — будет в 5.3 (Фаза 5, дневник + AI consent) как shared виджет для FAB
- ❌ **`bufferedPosition` визуализация** — нет в прототипе, не нужно
- ❌ **Custom анимации сверх Material/Cupertino** — вне scope
- ❌ **CarPlay / Apple Watch** — post-MVP

### Чек-лист проверки на симуляторе (для следующей сессии)

- [ ] `flutter pub get` — все 5 пакетов встают
- [ ] Холодный запуск → onboarding/login → переход в каталог (без падений)
- [ ] Открыть Маленького принца → нажать «Слушать бесплатно» → плеер открывается
- [ ] Воспроизведение стримится (Range запросы в Express логах)
- [ ] Background play: заблокировать экран → музыка играет
- [ ] Lock screen: controls видны (play/pause, ±15сек), прогресс обновляется
- [ ] Lock screen artwork: для Маленького принца обложка показывается (asset → cache)
- [ ] Seek работает (drag slider — плавно, без дёрганий)
- [ ] Скорость: 2× применяется немедленно, сохраняется между сессиями
- [ ] Sleep timer: 15 мин → музыка останавливается через 15 мин
- [ ] Sleep «Конец части» — останавливается на естественном завершении
- [ ] Мини-плеер виден на главной/каталоге/клубе/профиле когда плеер активен
- [ ] Мини-плеер не виден когда нет загруженной книги
- [ ] Прогресс POST в логах сервера каждые 30 сек
- [ ] При закрытии плеера — POST с финальной позицией
- [ ] При повторном открытии книги — продолжает с сохранённой позиции
- [ ] Автопереход часть 1 → часть 2 при естественном окончании
- [ ] Книги без частей (Alice, EPL): кнопка disabled с текстом «Аудио загружается»
- [ ] Swipe-down на плеере → закрывает к экрану книги
- [ ] VoiceOver: основной flow озвучивается осмысленно

---

## ЗАДАЧА 2.4 (главная страница) — ВЫПОЛНЕНА 27.04.2026

См. предыдущие версии AI-CONTEXT. Краткая выжимка:
- 11 файлов в `app/lib/features/home/`
- `_Placeholder('Главная')` → `HomeScreen()`
- Pull-to-refresh + ErrorView + HomeShimmer

---

## ЗАДАЧА 2.5 (каталог книг) — ВЫПОЛНЕНА 27.04.2026

См. предыдущие версии AI-CONTEXT. 6 файлов в `app/lib/features/catalog/`. Сетка 2×N, 16 чипов фильтров, pull-to-refresh.

---

## ЗАДАЧА 2.5-поиск (отдельный экран /search) — ВЫПОЛНЕНА 12.05.2026

См. предыдущие версии AI-CONTEXT. 3 файла в `app/lib/features/search/`. Debounce 300ms.

---

## ЗАДАЧА 2.6 (экран книги) — ВЫПОЛНЕНА 11.05.2026

4 файла в `app/lib/features/book/`. 3 варианта UI (бесплатная/платная/купленная). Кнопка «Купить на сайте автора» удалена (Apple compliance).

**Изменения 13.05.2026 (в рамках 2.7):**
- `_onPartTap` и `_onListenPressed` теперь делают `context.push(Routes.player(...))` вместо SnackBar
- Добавлен disabled-state для книг без аудио (Alice, EPL)

---

## ❗ ВАЖНОЕ ДЛЯ БУДУЩИХ ЗАДАЧ

**1. Локализация цен (Фаза 3)** — `book.priceUsd` сейчас жёстко доллары. В Фазе 3 заменим на `Product.displayPrice` от StoreKit.

**2. Non-consumable IAP для книг и пакетов (задача 3.5)** — в Фазе 3 создаём IAP продукты `book.{slug}` × 42, `package.{slug}` × 6.

**3. Кнопка «Купить на сайте» — УДАЛЕНА (Apple compliance).** Альтернатива — задача 3.6 (промокоды).

**4. Заглушки на экране книги (2.6)** — 3 const поля в `_BookContent`. `_isPurchased` обновится в Фазе 3, `_listenedPartNumbers` и `_progressPercent` — отдельная микро-задача в Фазе 3 (подключить ProgressService).

**5. Конвертация BYN→USD при seed — приближённая.** Финал назначит Анна в App Store Connect (Фаза 3).

**6. ❗ ВОПРОС К АННЕ — эксклюзивные книги внутри пакетов (блокирует 2.5.5).**

**Готовый текст для Анны:**
> Анна, вопрос по пакетам. В пакете «Достоевский» 5 книг, но 2 из них («Бедные люди», «Бесы») у тебя в каталоге как отдельных разборов нет — они только в пакете. То же в других пакетах. Вопрос: это специально (эксклюзив пакета), или просто ещё не добавила? От ответа зависит как покажем экран пакета.

**7. ❗ НОВАЯ ЗАДАЧА 3.6 — Активация промокода (Фаза 3).** Заменяет удалённую кнопку «Купить на сайте». Модель `PromoCode`, эндпоинты, Flutter-экран, админка.

**8. ❗ ВОПРОСЫ К АННЕ:**

| # | Вопрос | Когда блокирует |
|---|--------|-----------------|
| 6.1 | Пакеты — эксклюзив или забыли добавить отдельно? | Задача 2.5.5 |
| 8.1 | Отзывы пользователей нужны в первой версии? Или пост-MVP? | Возможная новая задача 6.9 |
| 8.2 | Когда оформит Apple Developer Account ($99/год)? | Apple Sign In (1.3), вся Фаза 3, push, TestFlight, App Store |
| 8.3 | Когда пришлёт MP3 остальных разборов? | Аудиоплеер уже работает, остальные разборы — пустой плеер с disabled-кнопкой |

**9. Шторка цитаты (`quote_sheet.dart`)** — НЕ делалась в 2.7. Будет shared виджетом в задаче 5.3 (Фаза 5: дневник + AI consent + модель Quote). Вызывается через глобальный FAB (плавающая кнопка пера). Кнопка «Цитата» в плеере **не возвращается** (решение юзера).

---

## ❗ УРОКИ

**1. Дебаг:** при багах — запросить полный лог терминала, прочитать **первую** ошибку (не последнюю), **не править наугад**.

**2. UX-проблемы:** **спросить юзера** прежде чем править.

**3. Apple compliance:** ВСЕГДА перепроверять через web_search (минимум 2025+ источники). Послабления меняются.

**4. Аудио на iOS:** строго MP3 или M4A. OGG не поддерживается. ffmpeg через evermeet.cx (не brew).

**5. AudioSession (урок 13.05.2026):** для iOS background audio недостаточно `UIBackgroundModes=audio` в Info.plist. **ОБЯЗАТЕЛЬНА** runtime-настройка `AudioSession.instance.configure(AudioSessionConfiguration.music())` иначе аудио останавливается при блокировке экрана. Если пакет добавлен в pubspec — проверять что **используется** в коде.

**6. Самопроверка docstring'а (урок 13.05.2026):** если в docstring файла написано «делает X, Y, Z», после написания кода **обязательно** пройтись по списку и проверить что Y и Z реально реализованы. Невыполнение этого правила в первой версии audio_service.dart стоило одной итерации правок (забыл AudioSession и обработку 410).

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

**Плеер 4.15 — кнопка «Цитата» убрана** (13.05.2026, решение юзера). Нижняя панель: Скорость + Сон. Запись цитат — через FAB в задаче 5.3.

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
- **ffmpeg:** установлен через evermeet.cx (НЕ brew)
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

_13.05.2026 — Задача 2.7 (Flutter аудиоплеер) ЗАВЕРШЕНА. 14 файлов (9 новых + 5 правок). 5 новых пакетов в pubspec (just_audio 0.9.40, audio_service 0.18.15, audio_session 0.1.21, rxdart 0.27.7, path_provider 2.1.3). Архитектура: 3 сервиса (audio/progress/player_api), singleton AudioHandler + Riverpod-обёртки, AudioSession.music() для iOS background, обработка истечения signed URL с автоматическим перезапросом, кеш обложек в Application Cache Directory, Sleep timer с 5 опциями, скорость в SharedPreferences между сессиями, slider с локальным drag state, MiniPlayer над таб-баром через Column. Mini-player виден только когда `hasContent==true`. **Кнопка «Цитата» в плеере убрана** (решение юзера — стандарт Apple Books/Audible/Podcasts не имеет такой кнопки), отклонение от MASTER 4.15 зафиксировано. Шторка цитаты будет в 5.3. Книги без частей (Alice, EPL) — disabled-кнопка «Аудио загружается». Уроки сессии: 1) если пакет добавлен в pubspec — проверять что используется в коде (забыл AudioSession в первой версии); 2) после написания кода проходить по docstring'у файла и проверять что все обещанные пункты реализованы (забыл обработку 410). Следующая: Фаза 5 (ИИ-дневник) или Фаза 4 (бэкенд клуба)._

_12.05.2026 (вторая половина) — Задача 2.3 (серверная часть). Конвертация 6 OGG → MP3 (192 kbps) Маленького принца через ffmpeg от evermeet.cx. 8 серверных файлов: Progress model, audio.service (HMAC-SHA256), audio.js (Range 200/206/403/410/404/416), progress.js (GET/POST с Zod), .env.example, config/index.js, app.js, seed.js. Без новых npm. Memo: где лежат файлы, миграция на VPS (3 строки .env + rsync), curl-тесты. Решения: HMAC signed URL TTL 1 час, Express fs.createReadStream (nginx X-Accel-Redirect — Фаза 7), прогресс показываем только на экране книги и в плеере (не на главной)._

_12.05.2026 (первая половина) — Задача 2.5-поиск (отдельный экран /search). 3 новых файла + правка router. Debounce 300ms. Серверной работы не потребовалось._

_11.05.2026 — Задача 2.6 (экран книги). 4 файла. 3 варианта UI. Кнопка «Купить на сайте автора» удалена (Apple compliance). Альтернатива — задача 3.6 (промокоды) в Фазе 3._

_27.04.2026 — Задачи 2.4 (главная) и 2.5 (каталог)._

_24.04.2026 — Реализация 2.3.5-a/b/c/d (схема Book, seed.js, обложки)._

_06.04.2026 — Задачи 1.5–2.2: дизайн-система, навигация, экраны входа, модели Book/Package, API каталога._

---

## РЕШЕНИЯ

| Дата | Решение | Причина |
|------|---------|---------|
| 13.05.2026 | **Кнопка «Цитата» в плеере убрана** | Решение юзера. Apple Books/Audible/Apple Podcasts не имеют такой кнопки. Альтернатива — глобальный FAB в задаче 5.3. Не возвращать. |
| 13.05.2026 | 3 отдельных сервиса (audio/progress/player_api) | SRP. Если progress.post падает — не должен ронять background audio. |
| 13.05.2026 | Singleton AudioHandler + Riverpod-провайдер поверх | AudioService.init() асинхронный. Описано в audio_service README. |
| 13.05.2026 | ProviderContainer до runApp | Стандартный паттерн bootstrap Riverpod. |
| 13.05.2026 | AudioSession.music() обязательно | Без этого iOS останавливает аудио при блокировке экрана даже с UIBackgroundModes=audio. |
| 13.05.2026 | Обработка истечения signed URL (410/403) | TTL 1 час, реальные части до 33 мин — впритык если юзер ставил на паузу. Apple Guideline 2.1: no broken functionality. |
| 13.05.2026 | getApplicationCacheDirectory вместо getTemporaryDirectory для обложек | Apple File System Programming Guide рекомендует Caches/ для регенерируемых данных. |
| 13.05.2026 | Slider с локальным `_dragSeconds` | Без этого ползунок дёргается между позицией пальца и реальной позицией. |
| 13.05.2026 | Скорость в SharedPreferences между сессиями | Apple Books, Audible так делают. |
| 13.05.2026 | Sheet'ы — белый фон на тёмном плеере | Apple Music, Books, Audible. Контраст улучшает иерархию. |
| 13.05.2026 | Skip ±15 сек | Стандарт Apple Podcasts для аудиокниг. |
| 13.05.2026 | Книги без частей → disabled-кнопка | Apple Guideline 2.1: не открывать плеер пустого контента (Alice, EPL). |
| 13.05.2026 | Sleep timer продолжает тикать при смене части | Стандарт Audible. |
| 13.05.2026 | Прогресс НЕ POST при seek | Сервер сам отбросит регрессию через дельту. Клиент шлёт раз в 30 сек. |
| 13.05.2026 | Передача в плеер через `extra` GoRouter | Тап по части → передаём part. Тап «Слушать» → плеер сам подтягивает прогресс. |
| 12.05.2026 | HMAC-SHA256 signed URL TTL 1 час | Стандарт (Audible, Spotify). |
| 12.05.2026 | Express отдаёт MP3 через fs.createReadStream + Range | Достаточно для разработки. nginx X-Accel-Redirect — Фаза 7. |
| 12.05.2026 | Прогресс прослушивания в 2.3 одновременно | Так в STEP-BY-STEP. |
| 12.05.2026 | Прогресс НЕ показываем на главной | Перегружена. Прогресс на экране книги (4.14) и в плеере. |
| 12.05.2026 | Аудио на Mac в ~/Chitatel_app/audio-storage/ | Симулирует /var/audio/chitatel/ на VPS. При миграции — rsync + 3 строки .env. |
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
- **Аудио на iOS — строго MP3 или M4A.** OGG не поддерживается. ffmpeg от evermeet.cx (не brew).
- **Flutter 3.22.3 — `withOpacity()`**, не `withValues()`.
- **Согласовывать ДО кода:** новые пакеты, варианты архитектуры. НЕ угадывать.
- **Если задача зависит от ответа заказчика — пауза.** Зафиксировать вопрос.
- **Самопроверка docstring'а:** после написания файла пройтись по списку обещанного — проверить что всё реализовано.
- **Если пакет в pubspec — он должен использоваться в коде.** Если не используется — либо удалить из pubspec, либо использовать.
- **Аудиоплеер — singleton (`ChitatelAudioHandler.instance`)** инициализируется в `main.dart` до `runApp` через `ProviderContainer`. Не пытаться создать заново.

---

*Последнее обновление: 13.05.2026 (задача 2.7 завершена — Flutter аудиоплеер; следующая — Фаза 5 ИИ-дневник или Фаза 4 бэкенд клуба)*
