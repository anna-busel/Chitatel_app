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

**Фаза:** 4 В РАБОТЕ. Бэкенд клуба (4.1-4.4) + Flutter UI (4.5) + переключатель клубов + 4.6 картинки + 4.7 reactions + 4.8 edit/delete + reply-доделка + запрет ссылок — ✅ ЗАВЕРШЕНЫ И ЗАПУШЕНЫ.
**Стратегия (согласовано 13.05.2026 v5):** сначала фулл-стек клуба (бэкенд + фронт + все 9 фич Telegram-уровня), потом Apple Dev Account ($99).
**Следующая задача:** **4.9 — Mentions @Анна** (после теста чата юзером). Затем 4.10 закрепы, 4.11 read receipts, 4.12 голосовые.
**Блокеры:** 1.3 (Apple Sign In) ждёт Apple Dev. **1.8 (гостевой режим) — критично перед Фазой 7**. 2.5.5 (пакеты) ждёт Анну. Фаза 3 (платежи) ждёт Apple Dev.
**Ожидает:** юзер тестирует весь чат клуба (4.6-4.8 + reply + ссылки) на симуляторе. После подтверждения → 4.9.

---

## ПРОГРЕСС

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3.5-a/b/c/d, 2.4, 2.5, 2.5-поиск, 2.6, 2.3 (сервер), 2.7 (аудиоплеер), **4.1-4.5 (бэкенд клуба + Socket.io + Q&A + Flutter UI)**, **переключатель клубов**, **4.6 картинки**, **4.7 reactions**, **4.8 edit/delete + reply-доделка**, **запрет ссылок участницам** — ЗАВЕРШЕНЫ 16.05.2026

---

## ✅ ЧАТ КЛУБА — ВЫПОЛНЕНО 16.05.2026 (Фаза 4: 4.1-4.8 + reply + ссылки)

Все коммиты в `main`. Бэкенд + фронт, протестировано компиляцией (юзер тестирует на симуляторе).

### Сводка задач

| Задача | Статус | Суть |
|--------|--------|------|
| 4.1-4.5 | ✅ | Бэкенд модели/API/Socket.io/Q&A + Flutter базовый UI клуба (3 таба) |
| Переключатель клубов | ✅ | GET /api/club/list (archive/current/future + relation), dropdown |
| 4.6 Картинки | ✅ | multer + signed URL (тот же AUDIO_SECRET), image_picker, fullscreen zoom |
| 4.7 Reactions | ✅ | 6 эмодзи белый список, toggle (1 юзер=1 реакция), optimistic + WS |
| 4.8 Edit/Delete | ✅ | PATCH/DELETE, окно 15 мин, soft-delete, WS-события |
| Reply (доделка) | ✅ | Плашка «Ответ на…» над инпутом, тап→прыжок к оригиналу, превью 1 строка |
| Баг «reply без пользователя» | ✅ исправлен | Бэк populate replyToId + фронт ReplySnapshot |
| Запрет ссылок | ✅ | Участницы не могут (вариант А — блокировать), Анна-admin может |

### Ключевые архитектурные решения чата

| Решение | Обоснование |
|---------|-------------|
| Картинки/voice/reactions переиспользуют signed-URL инфраструктуру 2.3 (тот же AUDIO_SECRET, verifySignedUrl) | Не плодим механизмы. Картинки в `AUDIO_BASE_PATH/club-images/<clubId>/<uuid>.<ext>`, отдача `/images/...?exp&sig` |
| Reactions: белый список 6 эмодзи `['❤️','👍','🔥','👏','🥲','🙏']` | Бэк `ChatMessage.ALLOWED_REACTIONS`, фронт `kAllowedReactions`. Один юзер = одна реакция (как Telegram) |
| Edit окно — 15 минут (`EDIT_WINDOW_MS`) | Редактируются text и подпись картинки (как TG). Файл картинки и голосовые НЕ редактируются. |
| Delete — soft delete (`deletedAt`) | Автор или админ. Сообщение остаётся в ленте как «удалено» — reply-контекст сохраняется (как TG) |
| Reply-UX по образцу Telegram | Превью НЕ скрывать, всегда видно компактно (1 строка), тап → скролл к оригиналу. НЕ «раскрытие по тапу» (анти-паттерн) |
| Бэк сам populate'ит replyToId со снапшотом автора | Превью самодостаточно, не зависит от загруженного на клиенте окна. Устранил баг «ответы без пользователя» |
| **Запрет ссылок — вариант А (блокировать отправку)** | Участницы (не admin) не могут слать ссылки. Антиспам/антифишинг. Проверка в POST /chat, /chat/image (caption), PATCH (антиобход — иначе можно отправить «ок» и отредактировать в ссылку) |

### Баг «ответы/сообщения без пользователя» — ИСПРАВЛЕНО

**Причина (найдена чтением кода, не угадана):** `ChatAuthor.unknown` возвращает name='Участница'. Старый код в chat_tab искал родителя reply только среди загруженных `_messages` (первые 20) → если родитель вне окна → превью «Участница». Seed не виноват (все userId валидны).
**Фикс:** бэк REPLY_POPULATE + `findMessagePopulated` helper во всех 4 endpoint'ах возврата сообщения (GET/POST chat, POST chat/image, PATCH); фронт класс `ReplySnapshot` в модели (парсит populated replyToId-объект).

### Файлы (актуальные на 16.05.2026)

**Бэкенд:**
- `server/src/routes/club.js` — все endpoints чата: GET/POST chat, POST chat/image, PATCH/DELETE chat/:id, POST reaction, POST report, Q&A. REPLY_POPULATE + findMessagePopulated. `containsLink`/`assertNoLinkForNonAdmin` (запрет ссылок). `EDIT_WINDOW_MS`.
- `server/src/models/ChatMessage.js` — схема v5 + `imageStoragePath`. `ALLOWED_REACTIONS` экспорт.
- `server/src/services/image.service.js` — ALLOWED_MIME (jpeg/png/webp/heic/heif), MAX 8MB, signed URL (префикс /images/ вместо /audio/), реэкспорт verifySignedUrl.
- `server/src/routes/images.js` — GET /images/<file>?exp&sig, path-traversal защита.
- `server/src/app.js` — +imageRoutes на `/images`.

**Фронт (`app/lib/features/club/`):**
- `models/chat_message.dart` — ChatMessage + ReplySnapshot + MessageReaction + copyWith.
- `services/club_socket_service.dart` — sealed события: NewMessage/Hidden/Edited/Deleted/PinChanged/ReactionUpdated/UserTyping.
- `services/club_api_service.dart` — fetchClubList/CurrentClub, fetchChatHistory, sendText/Image, toggleReaction, editMessage, deleteMessage, reportMessage, Q&A.
- `widgets/chat_tab.dart` — главный экран чата: WS-обработка всех событий, _toggleReaction (optimistic+откат), _editMessage/_deleteMessage/_startReply/_cancelReply/_scrollToMessage, обработка LINK_NOT_ALLOWED.
- `widgets/chat_message_bubble.dart` — bubble, long-press меню (6 эмодзи + Ответить + Изменить/Удалить свои + Пожаловаться чужие), reply-превью из snapshot (1 строка, кликабельное), картинка fullscreen zoom.
- `widgets/chat_input.dart` — поле ввода + плашка «Ответ на…» + кнопка-скрепка.
- `core/network/api_endpoints.dart` — clubChat/clubChatImage/clubChatMessage/clubChatReaction/clubChatReport.
- `app/pubspec.yaml` — +image_picker ^1.1.2 (нужен pod install), +multer ^1.4.5-lts.1 в server/package.json (нужен npm install).

### Продуктовые правила чата — ЗАФИКСИРОВАНЫ

| # | Правило | Статус |
|---|---------|--------|
| 1 | **Ссылки** — участницы не могут, Анна-admin может | ✅ реализовано (вариант А — блок) |
| 2 | **Голосовые сообщения** — только Анна-admin | 📌 учесть в 4.12: проверка `role==='admin'` на бэке + кнопка записи видна только Анне |
| 3 | Reactions — белый список 6 эмодзи, 1 юзер=1 | ✅ |
| 4 | Edit — 15 мин окно, text+caption, не voice | ✅ |
| 5 | Reply-превью всегда видно (1 строка), тап→прыжок | ✅ (UX Telegram, не скрывать) |
| 6 | Монетизация клуба — строго по подписке, без поштучной покупки клубов | будущий клуб = анонс, тап НЕ открывает чат |

### Инструкция юзеру для запуска (новые пакеты)

```bash
cd ~/Chitatel_app && git pull origin main
cd server && npm install              # multer (4.6)
# перезапуск бэка: Ctrl+C, npm run dev (дождаться "Server running on port 3000")
cd ../app && flutter pub get          # image_picker (4.6)
cd ios && pod install && cd ..        # ОБЯЗАТЕЛЬНО — image_picker нативный
flutter run                           # полный рестарт, НЕ hot reload
```
Тест: `test-premium@chitatel.app`/`test123456` (участница — запрет ссылок, edit/delete своих, reply). `anna@chitatel.app`/`anna123456` (admin — может слать ссылки).

### PENDING — осталось по плану Фазы 4

- **4.9** Mentions @Анна (mentions[] уже в схеме/модели, парсится — нужен UI автокомплита @ + подсветка + push-триггер)
- **4.10** Закреплённые сообщения (UI закрепления Анной; бэк pinnedMessageId есть, socket chat:pin_changed обрабатывается, _scrollToPinned работает, баннер есть — нет действия «закрепить» в меню для Анны)
- **4.11** Read receipts (readBy[] в схеме/модели, опционально, для Анны)
- **4.12** Голосовые (самая большая ~24ч; пакет `record: ^5.x`, AAC 64kbps mono .m4a макс 3 мин, signed URL через AUDIO_SECRET подпапка voice-messages/, waveform 40 семплов на клиенте, NSMicrophoneUsageDescription в Info.plist, индикатор записи Apple 5.1.2(iii). **ТОЛЬКО АННА-ADMIN отправляет** — правило юзера)

### Известное (не баг кода)

- **Клавиатура не всплывает в симуляторе** (чат + поиск каталога) — нормальное поведение iOS Simulator (включён Hardware Keyboard). Проверять экранную клавиатуру: симулятор → I/O → Keyboard → снять «Connect Hardware Keyboard» (Cmd+Shift+K). Реальный телефон не обязателен. Стоит проверить что поле ввода + плашка reply поднимаются над клавиатурой (есть SafeArea(top:false)).

---

## 💬 ЧАТ КЛУБА — РАСШИРЕННЫЙ ПЛАН (13.05.2026 v5)

### Контекст

Юзер сказал: «нужен чат как в Telegram, Анна сейчас ведёт там чат с подписчицами». Базовый план STEP-BY-STEP (4.1-4.5, 38ч) — только текстовый чат без картинок, reactions, voice. Юзер согласовал 9 must-have фич — **Фаза 4 расширена с 5 до 12 задач, 38ч → 112ч (~4 недели)**.

### Must-have фичи в MVP

| # | Фича | Часов | Приоритет | Статус |
|---|------|-------|-----------|--------|
| 1 | Текст + reply | 38 (база 4.1-4.5) | Critical | ✅ |
| 2 | Картинки в чате | +12 | High | ✅ |
| 3 | Reactions ❤️👍🔥👏🥲🙏 (белый список 6 эмодзи) | +10 | High | ✅ |
| 4 | Edit/Delete своих сообщений | +6 | Medium | ✅ |
| 5 | Mentions @Анна | +8 | Medium | ⏳ 4.9 |
| 6 | Закреплённые сообщения (1 шт, только Анна) | +4 | Medium | ⏳ 4.10 |
| 7 | Read receipts (опционально) | +4 | Low | ⏳ 4.11 |
| 8 | Push на новое сообщение | +6 (в 6.1) | High | ⏳ Фаза 6 |
| 9 | **Голосовые сообщения** (только Анна) | +24 | High (Анна психолог) | ⏳ 4.12 |
| | **ИТОГО Фаза 4** | **~112ч** | **4 недели** | **~60% готово** |

### Исключены из MVP (v1.1+)

Стикеры/GIF, видео, polls, forwarding, threads, поиск по чату, online status, bot commands, транскрипция голосовых (Whisper в v1.2 если попросят).

### Технические решения по голосовым (4.12) — зафиксированы

| Что | Решение | Почему |
|-----|---------|--------|
| **Кто может отправлять** | **ТОЛЬКО Анна (role=admin)** | Правило юзера 16.05.2026. Голосовые — формат ведущей (разборы, ответы), не общий чат участниц. Проверка `role==='admin'` на бэке + UI-кнопка записи видна только Анне |
| Формат | **AAC 64kbps mono .m4a** | iOS-нативный, ~480KB/мин, отличное качество для голоса |
| Макс длина | **3 минуты** | Telegram — 60 мин. Для книжного чата 3 мин достаточно, экономия VPS |
| Storage | `/var/audio/chitatel/voice-messages/<userId>/<messageId>.m4a` + signed URLs | Переиспользуем архитектуру из 2.3 (тот же AUDIO_SECRET, тот же verifySignedUrl) |
| Waveform | На клиенте при записи (40 семплов в ChatMessage.voiceWaveform) | Не нужна server-side обработка |
| Пакет Flutter | `record: ^5.x` | iOS + Android, AAC поддержка |
| Воспроизведение | `just_audio` (уже в pubspec из 2.7) | Не добавляем новый |
| Info.plist | `NSMicrophoneUsageDescription = "Для записи голосовых сообщений в чате клуба"` | Обязательно, иначе iOS убьёт |
| Apple 5.1.2(iii) | Индикатор записи на экране (красная точка + время) | Обязательно |
| Транскрипция | НЕТ в MVP | OpenAI Whisper $0.006/мин + задержка. В v1.2 если попросят |

### Схема ChatMessage (реализована в 4.1, расширена 4.6)

```js
{
  _id, userId, clubMonthId,
  type: 'text' | 'image' | 'voice',
  text: String,                 // для text и caption у image/voice
  imageUrl: String?,            // для type='image' (signed URL TTL 1ч)
  imageStoragePath: String?,    // отн.путь для перевыпуска signed URL (4.6)
  voiceUrl: String?,            // signed URL для type='voice'
  voiceDurationSec: Number?,    // длительность voice в секундах
  voiceWaveform: [Number],      // 40 семплов 0-100 для отрисовки
  replyToId: ObjectId?,         // ссылка на родительское (populated в ответе)
  reactions: [{ emoji, userIds: [ObjectId] }],  // 4.7
  mentions: [ObjectId],         // 4.9 — ID юзеров упомянутых
  editedAt: Date?,              // 4.8 — показываем «изменено»
  deletedAt: Date?,             // 4.8 — soft delete (для жалоб/аудита)
  readBy: [ObjectId],           // 4.11 — ID юзеров прочитавших
  isPinned: Boolean,            // 4.10 — закреплён ли
  isHidden: Boolean,            // модерация
  reportCount: Number,          // счётчик жалоб
  createdAt, updatedAt
}
```

Дополнительно: `ClubMonth.pinnedMessageId: ObjectId?` (1 закреп на клуб).

### Белый список reactions

`['❤️', '👍', '🔥', '👏', '🥲', '🙏']` — 6 эмодзи. Бережный набор для женского психологического сообщества, предотвращает токсичность (нет 💩 🤮 и т.п.). Apple Guideline 1.2 одобрит. Реализовано в 4.7.

### Apple Compliance для расширенного чата

- **Guideline 1.2 (UGC):** картинки и войсы — такие же UGC как текст. Модерация фото в админке (reportCount, isHidden) — есть.
- **NSPhotoLibraryUsageDescription** (для 4.6) — уже в Info.plist (задача 0.6).
- **NSMicrophoneUsageDescription** (для 4.12) — ДОБАВИТЬ в Info.plist перед 4.12.
- **Guideline 5.1.1(i):** microphone permission ТОЛЬКО при первой попытке записи (лениво).

---

## 🎧 АУДИО-СТРИМИНГ (ПАМЯТКА — задача 2.3 + 2.7 + переиспользование в 4.6/4.12)

### Архитектура

Стандартный подход (как у Audible, Spotify, Apple Music):

```
Flutter (плеер)                       Express (бэкенд)
     │  GET /api/books/:id/audio/:partNumber │
     │ ────────────────────────────────────► │
     │  ◄────  { audioUrl, duration, ... }    │
     │         signed URL, TTL 1 час          │
     │  GET /audio/...?exp=...&sig=...        │
     │  + Range: bytes=0-1000                │
     │ ────────────────────────────────────► │
     │  ◄────  206 Partial Content + MP3     │
```

Протокол: **HMAC-SHA256**. Ключ `AUDIO_SECRET` в `.env` (мин 32 символа).
URL: `http://host:port/audio/<filename>?exp=<unix>&sig=<hex>`.

**Тот же механизм переиспользован для картинок чата (4.6)** — `/images/...?exp&sig`, и **будет для voice (4.12)** — подпапка `voice-messages/`.

### Где лежат файлы

| Среда | Путь |
|---|---|
| Mac (разработка) | `~/Chitatel_app/audio-storage/<book_slug>/part-<N>.mp3` |
| Mac (картинки чата, 4.6) | `~/Chitatel_app/audio-storage/club-images/<clubId>/<uuid>.<ext>` |
| Mac (voice, после 4.12) | `~/Chitatel_app/audio-storage/voice-messages/<userId>/<messageId>.m4a` |
| VPS (продакшен) | `/var/audio/chitatel/<book_slug>/part-<N>.mp3` |

`audio-storage` на одном уровне с `server/` и `app/`. **НЕ в git**.

### `.env` для Mac

```bash
AUDIO_SECRET=dev-audio-secret-CHANGE-IN-PROD-min-32-chars
AUDIO_BASE_PATH=/Users/g/Chitatel_app/audio-storage
AUDIO_URL_TTL_SECONDS=3600
PUBLIC_BASE_URL=http://localhost:3000
```

### Миграция на VPS

```bash
AUDIO_SECRET=<openssl rand -hex 32>
AUDIO_BASE_PATH=/var/audio/chitatel
PUBLIC_BASE_URL=https://api.chitatel.app
```
Перенос: `rsync -avz --progress ~/Chitatel_app/audio-storage/ user@vps:/var/audio/chitatel/`

**ВАЖНО:** MP3 строго для аудиоразборов. Voice — m4a (AAC). Картинки чата — jpeg/png/webp/heic. ffmpeg через evermeet.cx (не brew).

---

## ДОП.ШАГИ ВНЕ STEP-BY-STEP (выполнено 24.04.2026)

| Шаг | Что | Коммит |
|-----|-----|--------|
| 2.3.5-a ✅ | Модель Book.js | `163ae99`, `7ea5112` |
| 2.3.5-b ✅ | reader-bot-catalog.json (42 книги + 6 пакетов) | `28f93fb` |
| 2.3.5-c ✅ | seed.js | — |
| 2.3.5-d ✅ | 55 обложек | `9f4f8a2` |

**В БД:** 42 платных + 3 бесплатных (Маленький принц 6 частей аудио) + 6 пакетов = 45 документов.

### Seed клуба (4.x)

`cd ~/Chitatel_app/server && npm run seed:club`. Создаёт 4 тестовых юзеров + 3 клуба (прошлый/текущий/будущий относительно сегодня) + 10 сообщений в текущем (2 reply, 1 закреп Анна, 1 mention, 1 edited, 1 спам с жалобой) + архивный 3 сообщения + 2 Q&A. Все userId валидны.

| Email | Пароль | Роль |
|---|---|---|
| anna@chitatel.app | anna123456 | admin (может ссылки, в 4.12 — голосовые) |
| test-premium@chitatel.app | test123456 | premium, активный клуб (основной для теста) |
| test-basic@chitatel.app | test123456 | basic |
| test-expired@chitatel.app | test123456 | архив read-only (expired 2 дня назад) |

---

## ЗАДАЧА 2.3 (аудио-стриминг + прогресс — сервер) — ВЫПОЛНЕНА 12.05.2026

| Файл | Назначение |
|------|-----------|
| `server/src/models/Progress.js` | Модель прогресса (userId+bookId уникальная пара) |
| `server/src/services/audio.service.js` | HMAC-SHA256 signed URLs, timing-safe |
| `server/src/routes/audio.js` | GET `/audio/*` с Range, защита от path traversal |
| `server/src/routes/progress.js` | GET/POST `/api/progress` с Zod, **requireAuth** |

Маленький принц: 6 частей MP3 в `~/Chitatel_app/audio-storage/malenkii_princ/`.

---

## ЗАДАЧА 2.7 (Flutter — аудиоплеер) — ВЫПОЛНЕНА 13.05.2026

### Что в репо (15 файлов, 9 новых + 6 правок)

**Новые в `app/lib/features/player/`:**

| Файл | Назначение |
|------|-----------|
| `services/audio_service.dart` | `ChitatelAudioHandler`. just_audio + audio_service. MediaSession. AudioSession.music(). Обработка 410/403. Автопереход. Sleep timer. POST прогресса каждые 30 сек. Singleton. |
| `services/progress_service.dart` | GET/POST `/api/progress`. **Тихо проглатывает ошибки (включая 401)**. |
| `services/player_api_service.dart` | GET signed URL |
| `services/cover_cache.dart` | Кеш обложек в Application Cache Directory |
| `providers/player_provider.dart` | Riverpod провайдеры плеера |
| `screens/player_screen.dart` | Плеер 4.15. Градиент lightCoffee→darkCoffee. Обложка 180×270 (2:3). |
| `widgets/mini_player.dart` | Mini-player 4.16. Solid lightCoffee #3A2018. |
| `widgets/speed_sheet.dart` | Sheet 4.18. Тёмная darkCoffee. |
| `widgets/sleep_timer_sheet.dart` | Sheet 4.19. Тёмная darkCoffee. |

**Правки:** pubspec (+5 пакетов аудио), main.dart, api_endpoints.dart, app_router.dart, book_screen.dart, book_parts_list.dart.

### iOS Info.plist

- `UIBackgroundModes` = `audio` ✅
- ⚠️ TODO перед Фазой 7: `ITSAppUsesNonExemptEncryption=false`
- ⚠️ TODO перед 4.12 (voice): `NSMicrophoneUsageDescription`

### Цвета плеера — v3 (шоколадные, согласовано)

| Элемент | Цвет v3 |
|---------|---------|
| Развёрнутый плеер | Градиент **#3A2018 → #1A0E08** |
| Mini-player | **Solid #3A2018** |
| Mini-player текст метаданных | rgba(255,255,255,**0.75**) |
| Sheets | **Solid #1A0E08** |
| Обложка плеера | **180×270 (2:3)** |

Контраст WCAG: белый на #3A2018 = 12.4:1 ✅, на #1A0E08 = 18.7:1 ✅.

### Что НЕ сделано в 2.7 (намеренно)

- ❌ Кнопка «Цитата» в плеере — решение юзера (будет FAB в 5.3)
- ❌ CarPlay / Apple Watch — post-MVP
- ⏳ Прогресс работает только для залогиненных — для guest нужна 1.8

---

## ❗ ЗАДАЧА 1.8 — ГОСТЕВОЙ РЕЖИМ + ЛОКАЛЬНЫЙ ПРОГРЕСС (КРИТИЧНО)

**ЗАВЕДЕНА:** 13.05.2026 после обнаружения бага сохранения прогресса.

### Почему критично

**Apple Guideline 5.1.1(v):** если основная функциональность не зависит от персонального аккаунта — Apple **ТРЕБУЕТ** дать доступ без логина. Реджектнет если на ревью увидит обязательную регистрацию для **бесплатного** разбора.

### Что доступно где

| Функция | Без регистрации | С регистрацией |
|---------|-----------------|----------------|
| Бесплатные разборы (Маленький принц) | ✅ | ✅ |
| Каталог, поиск, превью платных | ✅ | ✅ |
| Покупка платных | ❌ → login | ✅ |
| Дневник, ИИ-анализ, Чат клуба, Q&A | ❌ → login | ✅ |
| Прогресс прослушивания | **локально** SharedPreferences | **сервер** + sync |

### Объём: 3-5 часов. Когда: идеально с Фазой 1.3 (Apple Sign In). КРИТИЧНО до Фазы 7.

Прототип v4.2 — первый экран после онбординга = login без «Без регистрации». Нарушение 5.1.1(v). В 1.8 добавить четвёртую опцию.

---

## 🐛 БАГ СОХРАНЕНИЯ ПРОГРЕССА — ДИАГНОЗ 13.05.2026

**Симптом:** «части переключаются, но позиция не запоминается».
**Корень:** клиент шлёт POST `/api/progress` → сервер 401 (нет JWT, юзер не залогинен) → progress_service молча проглатывает в try/catch → не сохраняется. **НЕ баг 2.7.** Решение: задача 1.8. Временно для теста — зарегистрироваться (email/пароль).

---

## 🔠 КАТЕГОРИИ — РАЗДЕЛЕНИЕ БД И UI (13.05.2026)

Капс категорий в БД, sentence case на UI через `BookCategories.labelFor()`. `book_categories.dart`: Map (key=БД капс для фильтрации, value=label для UI). Не выводить `book.categories` напрямую в UI. Причина: Анна добавляет книги капсом 5 лет — миграция БД сломает её процесс. Стандартный i18n-паттерн.

---

## ЗАДАЧИ 2.4-2.6 (главная, каталог, экран книги, поиск)

- **2.4** главная — 11 файлов `app/lib/features/home/`
- **2.5** каталог — 6 файлов `app/lib/features/catalog/`. category_chips через labelFor()
- **2.5-поиск** — 3 файла, debounce 300ms
- **2.6** экран книги — 4 файла, 3 варианта UI, кнопка «Купить на сайте» удалена (Apple). `_onPartTap`→player, disabled для книг без аудио

---

## ❗ ВАЖНОЕ ДЛЯ БУДУЩИХ ЗАДАЧ

**1. Локализация цен (Фаза 3)** — `book.priceUsd` → `Product.displayPrice` от StoreKit.
**2. Non-consumable IAP (3.5)** — в Фазе 3.
**3. Кнопка «Купить на сайте» — УДАЛЕНА.** Альтернатива — 3.6 промокоды.
**4. Заглушки на экране книги** — обновятся в Фазе 3.
**5. Конвертация BYN→USD** — финал в App Store Connect.
**6. ❗ ВОПРОС К АННЕ — пакеты (блокирует 2.5.5):** в пакете «Достоевский» 5 книг, 2 («Бедные люди», «Бесы») в каталоге отдельно не существуют. Эксклюзив или забыли?
**7. ЗАДАЧА 3.6 — Активация промокода (Фаза 3).**
**8. ❗ ЗАДАЧА 1.8 — ГОСТЕВОЙ РЕЖИМ.** Apple compliance — критично перед Фазой 7.
**9. ❗ ВОПРОСЫ К АННЕ:**

| # | Вопрос | Блокирует |
|---|--------|-----------|
| 6.1 | Пакеты — эксклюзив или забыли? | 2.5.5 |
| 8.1 | Отзывы пользователей в первой версии? | 6.9 |
| 8.2 | Когда Apple Developer Account ($99/год)? | 1.3, Фаза 3, push, TestFlight |
| 8.3 | Когда MP3 остальных разборов? | Плеер работает, остальные disabled |
| 8.5 | Когда Анна готова активно отвечать в чате клуба? | Релиз клуба |
| NEW | Обложка/название клуба: как у книги или отдельный арт? | визуальный переключатель + схема ClubMonth |

**10. Шторка цитаты** — в 5.3. Кнопка в плеере не возвращается.
**11. `ITSAppUsesNonExemptEncryption=false`** — Info.plist перед Фазой 7.
**12. Категории на UI — через `BookCategories.labelFor()`** (sentence case).
**13. ЧАТ КЛУБА — см. секции «ЧАТ КЛУБА ВЫПОЛНЕНО» и «РАСШИРЕННЫЙ ПЛАН».** 4.1-4.8 + reply + ссылки ✅. Осталось 4.9-4.12.
**14. ГОЛОСОВЫЕ (4.12):** AAC 64kbps mono .m4a, макс 3 мин, signed URLs через AUDIO_SECRET, waveform на клиенте. Пакет `record: ^5.x`. NSMicrophoneUsageDescription. **ТОЛЬКО Анна-admin отправляет.**
**15. STEP-BY-STEP.md не обновлён под 4.6-4.12** (большой файл для MCP). Не критично — план зафиксирован в AI-CONTEXT.
**16. ВИЗУАЛЬНЫЙ ПЕРЕКЛЮЧАТЕЛЬ КЛУБОВ:** не дорабатывать сейчас — обложки/название клуба завязаны на данные которых нет в модели ClubMonth. PENDING-вопрос к Анне (см. таблицу #9 NEW): обложка/название клуба = как у книги месяца или отдельный арт? Влияет на схему ClubMonth.

---

## ❗ УРОКИ

**1. Дебаг:** полный лог, **первая** ошибка, **не править наугад**.
**2. UX:** **спросить юзера** прежде чем править.
**3. Apple compliance:** перепроверять через web_search (2025+).
**4. Аудио на iOS:** строго MP3/M4A. ffmpeg через evermeet.cx.
**5. AudioSession:** для iOS background обязательно `AudioSession.instance.configure(music())`.
**6. Самопроверка docstring'а** после написания файла.
**7. ⚠️ ЧИТАТЬ ПРОТОТИП ПЕРЕД UI КОДОМ:** `docs/prototype-v4_2.jsx`. Не отклоняться без явной просьбы.
**8. ⚠️ Apple-стандарты — проверять, не полагаться на память.**
**9. ⚠️ `_initialized` костыли скрывают баги.**
**10. ⚠️ ПРОВЕРЯТЬ AUTH ПРИ ПЕРВОМ ТЕСТЕ:** если бэкенд requireAuth, а Flutter без регистрации — все запросы 401, service с try/catch проглатывает. Логи сервера `UNAUTHORIZED` — первое что искать.
**11. ⚠️ ПРОПОРЦИИ КОНТЕЙНЕРА ОБЛОЖЕК:** всегда 2:3 для вертикальных PNG (как BookGridCard). Квадрат обрезает.
**12. ⚠️ КАПС В ДАННЫХ ИЗ БД:** не мигрируй БД, разделяй слои (БД хранит, UI через labelFor()).
**13. ⚠️ НЕ УГАДЫВАТЬ СКОУП «ПОНЯТНЫХ» ФИЧ:** «чат» в плане ≠ «чат как Telegram» (разница 3× времени). Спрашивать заказчика.
**14. ⚠️ НЕ ИСПОЛЬЗОВАТЬ UNICODE ESCAPE ДЛЯ КИРИЛЛИЦЫ В push_files:** обычная кириллица. Большой файл — create_or_update_file (один файл) не push_files.
**15. ⚠️ ПРОВЕРЯТЬ ИМПОРТ ТИПА ИЗ СОСЕДНЕГО ФАЙЛА (16.05.2026):** при использовании типа из другого файла (напр. ChatMessageEditedEvent из club_socket_service в chat_tab) проверять что импорт есть. Повторялось.
**16. ⚠️ dispose ConsumerState (16.05.2026):** ref.read после dispose бросает. Сохранять ссылку на сервис в state (_socketService) для использования в dispose().
**17. ⚠️ НЕ УГАДЫВАТЬ ПРИЧИНУ БАГА (16.05.2026):** баг «reply без пользователя» — сначала прочитали код (нашли: поиск родителя только в загруженных _messages) и проверили seed (userId валидны) ПРЕЖДЕ чем чинить. Не угадали. Фикс точечный (бэк populate + ReplySnapshot).
**18. ⚠️ ПРОДУКТОВЫЕ РЕШЕНИЯ — СПРАШИВАТЬ ВАРИАНТ (16.05.2026):** запрет ссылок — предложил юзеру 3 варианта (блок/вырезать/не кликабельно), не угадывал. Юзер выбрал А (блок). Reply-UX — объяснил почему «скрывать ответы» анти-паттерн, предложил Telegram-подход, юзер согласился.
**19. ⚠️ КЛАВИАТУРА В СИМУЛЯТОРЕ (16.05.2026):** если экранная клавиатура не всплывает в iOS Simulator — это не баг кода, а Hardware Keyboard в симуляторе. Cmd+Shift+K или I/O→Keyboard→снять «Connect Hardware Keyboard». Реальный телефон не нужен для проверки.

---

## ПРОПУЩЕННЫЕ ЗАДАЧИ

| Задача | Что | Почему | Когда |
|--------|-----|--------|-------|
| 0.1 | Apple Developer Account | Юзер: сначала клуб, потом Apple | Перед Фазой 7 / 1.3 |
| 0.2 | App ID + Certificates | Зависит от 0.1 | После 0.1 |
| 0.3 | VPS настройка | Не куплен | Перед деплоем |
| 0.4 | Домен + SSL | Зависит от 0.3 | После 0.3 |
| 1.3 | Apple Sign In | Нет Apple Dev | После 0.1-0.2 |
| **1.8** | **Гостевой режим + локальный прогресс** | **Apple 5.1.1(v). Прототип v4.2 нарушает.** | **Перед Фазой 7. С 1.3.** |
| 2.5.5 | Пакеты в каталоге | ⏸ ждёт Анну | После ответа |
| Фаза 3 | Платежи | Нет Apple Dev | После 0.1-0.2 |
| 3.5 | Non-consumable IAP | — | В Фазе 3 |
| 3.6 | Активация промокода | Заменяет удалённую кнопку | В Фазе 3 |
| **4.9-4.12** | **Mentions, закрепы, read receipts, голосовые** | Юзер запросил Telegram-уровень | **Фаза 4 — следующие** |

---

## РАСХОЖДЕНИЯ С MASTER.md

**Схема Book/ChatMessage расширены vs MASTER.** Источник истины — `server/src/models/`.
**Apple compliance — внешние ссылки на покупки запрещены.** Только IAP + промокоды (3.6).
**Плеер 4.15 — кнопка «Цитата» убрана.** Нижняя панель: Скорость + Сон.
**Mini-player — только на 4 главных таб-экранах** (Apple-стандарт).
**Прототип v4.2 предполагает обязательную регистрацию** — нарушение Apple 5.1.1(v). 1.8 добавит «Без регистрации».
**Цвета плеера — шоколадные (v3):** градиент #3A2018 → #1A0E08. Согласовано.
**Обложка плеера 180×270 (2:3)** вместо 220×220. Согласовано.
**Категории на UI — sentence case** через labelFor(). БД капс (наследие Telegram-бота).
**Фаза 4 расширена с 5 до 12 подзадач (v5).** 4.1-4.8 + reply + ссылки ✅, 4.9-4.12 осталось.
**Чат: запрет ссылок участницам (16.05.2026)** — вариант А (блокировать). Анна-admin может. Не было в MASTER — продуктовое правило юзера.
**Чат: голосовые только Анна-admin (16.05.2026)** — правило юзера, учесть в 4.12. Не было в MASTER.
**Reply-UX по образцу Telegram (16.05.2026)** — превью всегда видно (1 строка), тап→прыжок к оригиналу. НЕ скрывать (анти-паттерн).

---

## КОНТЕНТ ОТ АННЫ

**Репозиторий `g1orgi89/reader-bot`** — старый Telegram mini-app:
- 42 платных разбора + 6 пакетов (в `reader-bot-catalog.json`)
- 55 обложек PNG (в `app/assets/book-covers/`)

**Бесплатные:** Alice Wonderland (без аудио), Eat Pray Love (без аудио), **Маленький принц — 6 частей с аудио**.

---

## РАБОЧАЯ СРЕДА

- **Mac:** MacBook Pro 2018, macOS Ventura
- **Xcode:** 15.2 + iOS 17.2 симулятор (iPhone 15)
- **Flutter:** 3.22.3 (withOpacity, не withValues)
- **Node.js:** 20.20.1 (nvm)
- **MongoDB:** 7.0.20 — `mongod --dbpath ~/mongodb/data`
- **ffmpeg:** через evermeet.cx (НЕ brew)
- **Бэкенд:** `cd ~/Chitatel_app/server && npm run dev`
- **Flutter:** `cd ~/Chitatel_app/app && flutter pub get && flutter run`
- **Seed:** `cd ~/Chitatel_app/server && npm run seed` (каталог) / `npm run seed:club` (клуб)
- **Путь к аудио:** `/Users/g/Chitatel_app/audio-storage/`
- Нет штатного logout — сброс через удаление приложения с симулятора или Device→Erase All Content

---

## ПОРЯДОК РАБОТЫ

```
СТРАТЕГИЯ (13.05.2026 v5): сначала фулл-стек клуба, потом Apple Dev ($99).

СЕЙЧАС:
  1.1–2.7 ✅ (Фаза 2 завершена)
  → Фаза 4 (расширенный клуб — 12 задач, ~112ч):
     → 4.1-4.5 ✅ (бэкенд + Socket.io + Q&A + Flutter UI)
     → переключатель клубов ✅
     → 4.6 картинки ✅
     → 4.7 reactions ✅
     → 4.8 edit/delete + reply-доделка ✅
     → запрет ссылок участницам ✅
     → [ЮЗЕР ТЕСТИРУЕТ ЧАТ на симуляторе]
     → 4.9 Mentions @Анна  ← СЛЕДУЮЩАЯ
     → 4.10 Закреплённые сообщения (UI закрепления Анной)
     → 4.11 Read receipts (опционально)
     → 4.12 Голосовые сообщения (AAC m4a, 3 мин, ТОЛЬКО Анна-admin)
  → Фаза 5 (ИИ-дневник: 5.1, 5.2, 5.3) — опционально до Apple Dev
  → ПОКУПКА Apple Dev Account ($99) — когда клуб работает e2e
  → Фаза 1.3 (Apple Sign In) + 1.8 (guest mode) вместе
  → Фаза 3 (платежи)
  → Фаза 6 (полировка) — включая push (фича #8 чата)
  → Фаза 7 (TestFlight + App Store)

⏸ ЖДЁТ АННУ:
  2.5.5 — пакеты
  Аудио для других книг
  Когда Анна готова активно отвечать в чате клуба
  Обложка/название клуба: как у книги или отдельный арт? (визуальный переключатель)

⏸ ЖДЁТ APPLE DEV:
  1.3 → 1.8 (вместе) → Фаза 3 → Фаза 7

⏸ ЖДЁТ VPS:
  Деплой бэкенда

🚨 КРИТИЧНО ПЕРЕД TESTFLIGHT:
  1.8 — гостевой режим (Apple compliance)
  NSMicrophoneUsageDescription в Info.plist (нужно для 4.12)
  ITSAppUsesNonExemptEncryption=false в Info.plist
```

---

## ПРОШЛАЯ СЕССИЯ

_16.05.2026 (Фаза 4: чат клуба — большой блок) — Завершены и запушены в main: переключатель клубов (GET /api/club/list, dropdown archive/current/future), 4.6 картинки в чате (multer + signed URL через тот же AUDIO_SECRET что в 2.3, image_picker, fullscreen zoom, /images endpoint), 4.7 reactions (6 эмодзи белый список, toggle 1 юзер=1, optimistic + WS chat:reaction_updated), 4.8 edit/delete (PATCH/DELETE, окно 15 мин, soft-delete, WS chat:message_edited/deleted), доделка reply (плашка «Ответ на…» над инпутом, тап по reply-превью → прыжок к оригиналу через Scrollable.ensureVisible, превью 1 строка как в Telegram), запрет ссылок участницам (вариант А — блокировать; Анна-admin может; проверка в POST chat/image + PATCH антиобход). Исправлен баг «ответы без пользователя»: причина найдена чтением кода (не угадана) — старый chat_tab искал родителя reply только среди загруженных _messages (первые 20), seed невиновен (userId валидны); фикс — бэк populate replyToId со снапшотом автора (REPLY_POPULATE + findMessagePopulated) + фронт класс ReplySnapshot. Продуктовые решения юзера: (1) ссылки — вариант А блокировать, Анна может; (2) голосовые в 4.12 — ТОЛЬКО Анна-admin (формат ведущей); (3) reply-UX — Telegram-подход, превью всегда видно не скрывать. Объяснено: клавиатура не всплывает в симуляторе — не баг, Hardware Keyboard (Cmd+Shift+K). Новые уроки #15-19. Все файлы проверены в репо (sha совпадают с коммитами) — ничего не потеряно. Юзер тестирует чат на симуляторе. Следующее — 4.9 Mentions @Анна._

_13.05.2026 (v5 — стратегия + расширение Фазы 4) — Согласован порядок «сначала клуб, потом Apple Dev». «Чат как Telegram» = +74ч к базовому плану. Подтверждены 9 must-have фич. Фаза 4 с 5 до 12 задач (38→112ч). Технические решения по голосовым зафиксированы. Уроки #13-14._

_13.05.2026 (v4) — Обложка плеера 180×270 (2:3), капс категорий → labelFor(). Уроки #11-12._

_13.05.2026 (v3) — Цвета плеера шоколадные #3A2018→#1A0E08. Диагноз бага прогресса (нет JWT). Завели 1.8. Урок #10._

_13.05.2026 (v2) — Финальная итерация 2.7: mini-player на 4 табах, фикс переключения частей, подсветка активной части._

_13.05.2026 (v1) — Задача 2.7 первая версия. 14 файлов, 5 пакетов аудио._

_12.05.2026 — Задача 2.3 (сервер). HMAC signed URL TTL 1 час. + 2.5-поиск (debounce 300ms)._

_11.05.2026 — Задача 2.6. 3 варианта UI. Кнопка «Купить на сайте» удалена._

_27.04.2026 — Задачи 2.4 (главная) и 2.5 (каталог)._

_24.04.2026 — 2.3.5-a/b/c/d._

_06.04.2026 — Задачи 1.5–2.2._

---

## РЕШЕНИЯ

| Дата | Решение | Причина |
|------|---------|---------|
| 16.05.2026 | **Запрет ссылок участницам — вариант А (блокировать отправку)** | Антиспам/антифишинг. Юзер выбрал из 3 вариантов. Анна-admin может. Проверка POST chat/image + PATCH (антиобход) |
| 16.05.2026 | **Голосовые (4.12) — ТОЛЬКО Анна-admin** | Формат ведущей (разборы, ответы), не общий чат участниц. Правило юзера |
| 16.05.2026 | **Reply-UX по образцу Telegram** — превью всегда видно (1 строка), тап→прыжок | Скрывать ответы — анти-паттерн для живого чата. Контекст должен быть виден сразу |
| 16.05.2026 | **Бэк populate replyToId со снапшотом** (фикс бага «без пользователя») | Превью самодостаточно, не зависит от загруженного окна. Причина найдена чтением кода, не угадана |
| 16.05.2026 | **Edit окно 15 мин, soft-delete остаётся в ленте** | Как Telegram. Reply-контекст сохраняется |
| 16.05.2026 | **Reactions: 1 юзер = 1 реакция (toggle)** | Как Telegram. Белый список 6 эмодзи (4.7) |
| 16.05.2026 | **Картинки/voice переиспользуют signed-URL 2.3** | Не плодим механизмы. Тот же AUDIO_SECRET |
| 13.05.2026 v5 | Стратегия: сначала клуб, потом Apple Dev | Клуб — core-продукт. Apple Dev = годовая подписка |
| 13.05.2026 v5 | Фаза 4 расширена 5→12 задач (38→112ч) | Юзер запросил Telegram-функционал |
| 13.05.2026 v5 | Голосовые: AAC 64kbps mono .m4a, 3 мин, signed URLs | Переиспользуем 2.3, минимум пакетов |
| 13.05.2026 v5 | Reactions: белый список 6 эмодзи | Бережный набор, без токсичности |
| 13.05.2026 v4 | Обложка плеера 180×270 (2:3) | PNG ~7:10 обрезались в квадрате |
| 13.05.2026 v4 | Капс категорий → labelFor() на UI | Apple HIG, читабельность. БД не трогаем |
| 13.05.2026 v3 | Цвета плеера шоколадные #3A2018→#1A0E08 | На симуляторе #1A0E08 выглядел чёрным |
| 13.05.2026 v3 | Завели задачу 1.8 (гостевой режим) | Apple 5.1.1(v) |
| 13.05.2026 v3 | Баг прогресса — НЕ баг 2.7 | Корень — отсутствие JWT, 401 проглатывается |
| 13.05.2026 v1 | Кнопка «Цитата» в плеере убрана | Решение юзера. Не возвращать |
| 13.05.2026 v1 | AudioSession.music() обязательно | iOS background |
| 13.05.2026 v1 | Обработка 410/403 signed URL | Apple Guideline 2.1 |
| 12.05.2026 | HMAC-SHA256 signed URL TTL 1 час | Стандарт |
| 12.05.2026 | Аудио в ~/Chitatel_app/audio-storage/ | Симулирует VPS |
| 12.05.2026 | ffmpeg через evermeet.cx | brew медленный |
| 11.05.2026 | Кнопка «Купить на сайте» удалена | Apple 3.1.1(a) только US |
| 11.05.2026 | Завели 3.6 (промокоды) | Apple разрешает |
| 24.04.2026 | Схема Book в модели, не в MASTER | Источник истины — models/ |
| 06.04.2026 | Архивный доступ к клубу — 21 день | Заказчик |
| 15.03.2026 | Playfair Display через google_fonts | Не Onest |

---

## ПРАВИЛА КОДА

- НЕ создавать заглушки-классы.
- AI-CONTEXT обновлять В ТОЙ ЖЕ СЕССИИ что и код (либо когда юзер просит зафиксировать).
- Схема Book — источник истины `server/src/models/Book.js`. Схема ChatMessage — `server/src/models/ChatMessage.js`.
- Цены — `book.priceUsd` (USD). В Фазе 3 — `Product.displayPrice`.
- **При багах: полный лог, ПЕРВАЯ ошибка.** Не гадать.
- **Для UX: спросить юзера прежде чем править.**
- **Apple compliance: web_search (2025+).** Не полагаться на память.
- **⚠️ ЧИТАТЬ ПРОТОТИП docs/prototype-v4_2.jsx ПЕРЕД UI-кодом.**
- **Аудио на iOS — строго MP3/M4A. Картинки чата — jpeg/png/webp/heic.**
- **Flutter 3.22.3 — `withOpacity()`.**
- **Согласовывать ДО кода:** новые пакеты, варианты архитектуры, продуктовые решения (предлагать варианты, не угадывать).
- **Зависит от заказчика → пауза.**
- **Самопроверка docstring'а.**
- **Пакет в pubspec → должен использоваться.**
- **Проверять имена в AppColors/AppTypography через github:get_file_contents.**
- **⚠️ ПРОВЕРЯТЬ AUTH ПРИ ПЕРВОМ ТЕСТЕ:** requireAuth + тест без регистрации = тихие 401.
- **⚠️ КОНТЕЙНЕР ОБЛОЖКИ — 2:3** (не квадрат).
- **⚠️ КАТЕГОРИИ НА UI — через labelFor()**.
- **⚠️ НЕ УГАДЫВАТЬ СКОУП «ПОНЯТНЫХ» ФИЧ.**
- **⚠️ НЕ unicode escape для кириллицы в push_files; большой файл — create_or_update_file.**
- **⚠️ ПРОВЕРЯТЬ ИМПОРТ ТИПА из соседнего файла** (sealed events из socket_service).
- **⚠️ dispose ConsumerState — сохранять ссылку на сервис в state**, не ref.read после dispose.
- **⚠️ НЕ УГАДЫВАТЬ ПРИЧИНУ БАГА** — сначала чтение кода/проверка, потом фикс.
- **⚠️ ПРОДУКТОВЫЕ РЕШЕНИЯ — предлагать варианты юзеру**, не угадывать.
- **⚠️ Клавиатура в симуляторе** — Hardware Keyboard, не баг (Cmd+Shift+K).

---

*Последнее обновление: 16.05.2026 (Фаза 4 чат: переключатель + 4.6 картинки + 4.7 reactions + 4.8 edit/delete + reply-доделка + запрет ссылок ✅ ЗАПУШЕНЫ. Фикс бага reply. Продуктовые правила: ссылки/голосовые только Анна. Юзер тестирует чат. Следующее — 4.9 Mentions. Уроки #15-19.)*
