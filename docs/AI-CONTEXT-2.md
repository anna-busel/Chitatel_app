# AI-CONTEXT-2 — ЧИТАТЕЛЬ (продолжение)

> **ЭТО ВТОРОЙ ФАЙЛ КОНТЕКСТА. Первый — `docs/AI-CONTEXT.md` — разросся (52KB).**
>
> **Порядок чтения для AI в начале сессии:**
> 1. Сначала `docs/AI-CONTEXT.md` — вся база: проект, стек, Фазы 1-2, чат 4.1-4.8, аудио, уроки #1-19, правила кода, среда, решения до 16.05.2026. **Это фундамент, читать обязательно.**
> 2. Потом **этот файл** (`AI-CONTEXT-2.md`) — свежий прогресс с 16.05.2026: задачи 4.9-4.12, новые баги/фиксы, уроки #20+, актуальный статус.
>
> **Прогресс фиксировать ДАЛЕЕ ТОЛЬКО В ЭТОМ ФАЙЛЕ.** Первый не редактировать (он стабильный архив-фундамент). Когда и этот разрастётся — заведём AI-CONTEXT-3 по той же схеме.
>
> Правила и роль — в Project Instructions проекта Claude (не в репо).

---

## ТЕКУЩИЙ СТАТУС (на 17.05.2026)

**Фаза:** 4 — почти завершена. **Бэкенд 4.1-4.12 — ✅ ВСЁ в `main`.** Фронт 4.1-4.11 — ✅. Фронт 4.12 (голосовые) — ✅ написан, последний layout-баг исправлен, **ОЖИДАЕТ ТЕСТА ЮЗЕРОМ**.

**Что прямо сейчас:** юзер тестирует голосовые (4.12) под Анной после фикса RenderFlex. Голосовые ещё НЕ подтверждены рабочими — собралось, разрешение микрофона запросилось (record 4.x работает), layout-краш починен, но полный цикл запись→отправка→воспроизведение юзер ещё не прогнал.

**Следующее после подтверждения теста:** опционально Фаза 5 (ИИ-дневник 5.1-5.3) → покупка Apple Dev Account ($99) → Фаза 1.3 (Apple Sign In) + 1.8 (guest mode) вместе → Фаза 3 (платежи) → Фаза 6 (полировка, вкл push — фича #8 чата) → Фаза 7 (TestFlight).

**Блокеры:** без изменений (см. AI-CONTEXT.md). Apple Dev ждёт решения юзера о покупке. 1.8 критично перед Фазой 7.

---

## ✅ ЧАТ КЛУБА — ЗАВЕРШЕНО 16-17.05.2026 (Фаза 4: 4.9-4.12 + навигация + фиксы)

Всё в `main`. Бэкенд полностью готов и стабилен. Фронт 4.9-4.11 готов, 4.12 ждёт теста.

### Сводка задач 4.9-4.12

| Задача | Бэк | Фронт | Суть |
|--------|-----|-------|------|
| 4.9 Mentions @Анна | ✅ | ✅ | Вариант А: упоминать можно ТОЛЬКО Анну (role=admin). `GET /:clubMonthId/mentionable`, `sanitizeMentions()` фильтрует подделку. Автокомплит `@` в инпуте, подсветка `@Имя` в bubble |
| 4.10 Закрепы | ✅ | ✅ | Только Анна-admin, 1 закреп на клуб (`ClubMonth.pinnedMessageId`), WS `chat:pin_changed`. Long-press → «Закрепить»/«Открепить» (пункт только админу). Баннер сверху |
| 4.11 Read receipts | ✅ | ✅ | `POST /chat/read {messageIds[1-100]}`, `$addToSet readBy`, без WS (фоновая метрика для Анны). Фронт markRead дебаунс 2с, Set `_readSent` |
| 4.12 Голосовые | ✅ | ✅* | ТОЛЬКО Анна-admin. AAC m4a, 3 мин, signed URL через AUDIO_SECRET. *Фронт ждёт теста после layout-фикса |

### Telegram-навигация к закрепу/reply — РЕАЛИЗОВАНО

Полноценный переход как в Telegram: тап по баннеру закрепа / reply-превью → если сообщение в окне — скролл+подсветка; если нет — `GET /chat/context/:messageId` (radius 1-30, def 15) → перестройка ленты вокруг цели + подсветка (Timer 1800мс terracotta-обводка) + плавающая кнопка «вниз» (`_JumpDownButton`, индикатор если есть новее за окном).

### Картинка в bubble — БЕЗ оранжевой рамки (фикс UX)

Без подписи = bubble это сама картинка (без фона/padding), время/имя поверх на чёрной полупрозрачной подложке. С подписью = картинка fullWidth сверху + подпись снизу на цветном фоне. Fullscreen zoom по тапу (Hero + InteractiveViewer).

### Real-time баг — ИСПРАВЛЕН (коммит `49b5b41`)

**Симптом:** добавление/удаление/фото не в реальном времени, чат «залипал» после диалогов/смены вкладок.
**Причина (найдена чтением кода):** `chat_tab.dispose()` рвал singleton-сокет `_socketService?.disconnect()` при любом пересоздании виджета (а оно частое — диалоги, табы).
**Фикс:** убран `disconnect()` из `dispose()`. Виджет только `_socketSub?.cancel()`; соединением рулит провайдер; `connect()` идемпотентен. **Юзер должен подтвердить при тесте** — отправка/удаление/фото мгновенно, не ломается после диалогов/смены вкладок.

### Конфликт пакета `record` (4.12) — РЕШЁН

**Проблема:** `record: ^5.1.2` тянул `record_linux 0.7.2` несовместимый с `record_platform_interface` → iOS-сборка падала `RecordLinux is missing implementations` (Flutter компилирует весь граф зависимостей, даже Linux-код, ненужный на iOS).
**Ошибка Claude по пути:** выдумал несуществующую версию `record_platform_interface 1.0.4` в `dependency_overrides` (нарушил правило «не угадывать») — `pub get` упал «doesn't match any versions». Признал, откатил (`611bd26`).
**Решение:** перешли на `record: ^4.4.4` (коммит `c8bb44d`) — цельный пакет без проблемного распада на под-пакеты, ставится на Flutter 3.22.3. `voice_recorder.dart` переписан под record 4.x API (`b1ecc01`): класс `Record()` вместо `AudioRecorder()`, параметры прямо в `start(path:, encoder: AudioEncoder.aacLc, bitRate:64000, samplingRate:44100)` без `RecordConfig`, нет `numChannels`, `samplingRate` не `sampleRate`. **record 4.x СОБРАЛСЯ успешно** — разрешение микрофона запросилось.

### Layout-баг VoiceRecorder (RenderFlex unbounded width) — ИСПРАВЛЕН

**Симптом:** нажал микрофон под Анной → разрешение появилось → виджет упал `RenderFlex children have non-zero flex but incoming width constraints are unbounded` (стектрейс → `voice_recorder.dart` Row со `Spacer()` в режиме записи, родитель не дал ограниченную ширину).
**Причина (из стектрейса, не угадана):** в режиме записи VoiceRecorder = Container→Row со `Spacer()` (flex), но в `chat_input` стоял как обычная кнопка БЕЗ `Expanded` → unbounded width + flex = краш.
**Фикс (2 файла):**
- `voice_recorder.dart` (`d3be72a`) — добавлен колбэк `onRecordingStateChanged(bool)`, вызывается в `_setRecording()` (в `_start`/`_stopAndSend`/`_cancel`).
- `chat_input.dart` (`c5f5d17`) — добавлен `bool _isRecordingVoice`; единый инстанс `VoiceRecorder` (через переменную — чтобы State не пересоздавался при перестройке); в режиме записи строка ввода = `[Expanded(child: voiceRecorder)]` (скрепка/TextField/SendButton скрыты); иначе обычная раскладка. Reply-плашка и счётчик скрыты при записи.
**Статус:** запушено, **юзер ещё НЕ подтвердил что краша больше нет и цикл запись→отправка→воспроизведение работает.**

---

## ПРОДУКТОВЫЕ РЕШЕНИЯ 16-17.05.2026 (зафиксированы)

| Дата | Решение | Обоснование |
|------|---------|-------------|
| 16.05 | **Mentions (4.9) — вариант А: упоминать ТОЛЬКО Анну (role=admin)** | Не групповой флуд-чат, а сообщество вокруг разбора. Бэк `sanitizeMentions()` фильтрует mentions[] оставляя только админов (защита от подделки клиентом). Эндпоинт `GET /:clubMonthId/mentionable` |
| 16.05 | **Голосовые (4.12) — ТОЛЬКО Анна-admin** | Формат ведущей. Бэк: `role==='admin'` в `POST /chat/voice` (код `VOICE_ADMIN_ONLY`) + блок `type=voice` в обычном `POST /chat` (антиобход 403). Фронт: VoiceRecorder рендерится только при `isAdmin && onSendVoice != null` |
| 16.05 | **Закреп (4.10) — только Анна-admin, 1 на клуб** | `ClubMonth.pinnedMessageId`, WS `chat:pin_changed`. Long-press пункт «Закрепить/Открепить» только админу |
| 16.05 | **Read receipts (4.11) — без WS** | Фоновая метрика для Анны. `$addToSet readBy`. Фронт дебаунс 2с |
| 16.05 | **Переход к закрепу/reply — полноценно как Telegram** | Догрузка контекста (`GET /chat/context/:messageId`) + подсветка цели + кнопка «вниз». Не «скролл только если в окне» |
| 16.05 | **Картинка в bubble БЕЗ оранжевой рамки** | Без подписи = чистая картинка, мета поверх на тёмной подложке. С подписью = картинка + подпись на фоне |
| 17.05 | **`record` 4.x, не 5.x** | 5.x раскладывается на под-пакеты с несовместимым графом на Flutter 3.22.3. 4.4.4 цельный |
| ранее | Edit 15 мин; soft-delete остаётся в ленте; reactions 1 юзер=1 (6 эмодзи); запрет ссылок вариант А (Анна может); reply-UX Telegram (превью всегда видно) | См. AI-CONTEXT.md, секция РЕШЕНИЯ — без изменений |

**PENDING-вопрос к Анне (новый):** обложка/название клуба = как у книги месяца или отдельный арт? Влияет на схему ClubMonth и визуальный переключатель клубов (не дорабатывать пока не ответит).

---

## АКТУАЛЬНЫЕ sha ФАЙЛОВ (всё в `main` на 17.05.2026)

**Бэкенд (4.12 + всё предыдущее):**
- `server/src/routes/club.js` — `16137589b3078ec9f7d028190b4b495b92d4746c` (context + mentionable + sanitizeMentions + pin + read + `POST /chat/voice` + антиобход type=voice)
- `server/src/models/ChatMessage.js` — `4811ac13ae233903f050bc92ede44093d0381d74` (v5 + imageStoragePath + voiceStoragePath)
- `server/src/services/voice.service.js` — `c937715cda3c48c1993f22978a81f759b64b2e5e` (ALLOWED_MIME audio/mp4|m4a|aac→m4a, MAX_DURATION_SEC=180, MAX 4МБ, generateVoiceSignedUrl /audio/→/voice/)
- `server/src/routes/voice.js` — `32fd15b8f5503b42bd68049173b1269420825df5` (GET /voice/<file>?exp&sig с Range 206, path-traversal, VOICE_URL_EXPIRED/VOICE_NOT_FOUND)
- `server/src/app.js` — `48b24d6ea6db43ec01bb17e76ffc95b063c5d669` (+voiceRoutes на /voice)
- `server/src/services/image.service.js` — `49a193adbf32070a1577f890544736dadf3b5ddb` (не менялся)
- `server/src/routes/images.js` — `6de2df262baf1d35d41b6c556382d40ab3a81d0d` (не менялся)

**Фронт (`app/lib/features/club/`):**
- `widgets/chat_tab.dart` — `67496f4b1b27b947ef4e31bd4c896b0155bd04d8` (коммит `f7d2e7f`: 4.9-4.12 интегрированы — _sendVoice, isAdmin/onSendVoice/_isUploadingVoice, _togglePin, _scheduleMarkRead, _mentionable; контракт `onSend(text,mentions)`; real-time фикс `49b5b41`)
- `widgets/chat_message_bubble.dart` — `143405a1356650bc9df9e9fb3ff0e522b082e738` (коммит `5054bd2`: VoicePlayer для type=voice + buildMentionText @подсветка + isAdmin/onPinToggle меню Закрепить)
- `widgets/chat_input.dart` — `d4ea37b8e979a5d866fa52e89da669a423300840` (коммит `c5f5d17`: _isRecordingVoice + Expanded VoiceRecorder при записи + единый инстанс; автокомплит @, onSend(text,mentions), isAdmin/onSendVoice)
- `widgets/voice_recorder.dart` — `da2a7e17ee1969ab8d29c2c843d144b8492f7738` (коммит `d3be72a`: record 4.x API + колбэк onRecordingStateChanged)
- `widgets/voice_player.dart` — `4875b87b3966498acc7c92af2afa9a44a4e7ae67` (коммит `db8a1c4`: just_audio play/pause + CustomPaint _WaveformPainter 40 баров + seek по тапу + _failed при 403/410)
- `services/club_api_service.dart` — `a95f5b2b1161a92b757ebb4edf8984d0a86a1b49` (+sendVoiceMessage multipart voice+durationSec+waveform JSON, +MentionableUser/fetchMentionable/pinMessage/markRead/fetchChatContext, sendImageMessage +mentions)
- `core/network/api_endpoints.dart` — `4f5cb8e9a999034f3019d5e95581321cee94b9f0` (+clubChatVoice +clubMentionable +clubChatRead +clubChatPin +clubChatContext)
- `models/chat_message.dart` — `cb9e5318bb3cb6809a43f570d8133471117a19fb` (парсит voiceUrl/voiceDurationSec/voiceWaveform List<int>; ReplySnapshot; контракт проверен — урок #15; НЕ менялась в 4.12)
- `services/club_socket_service.dart` — `db25b770ffdac3c6daf2167033c65ca7888d98a3` (sealed: NewMessage/Edited/Deleted/PinChanged/ReactionUpdated/Hidden — не менялся)
- `app/pubspec.yaml` — `e63fb0fec622a3082c7191da70a9b8fcd46990c5` (коммит `c8bb44d`: record ^4.4.4 БЕЗ dependency_overrides)
- `app/ios/Runner/Info.plist` — `38773b3207cf1fc2378121b2fc89153fa63ad432` (+NSMicrophoneUsageDescription «Для записи голосовых сообщений в чате клуба»)

---

## ХРОНОЛОГИЯ КОММИТОВ (Фаза 4 чат, все в `main`)

Бэк 4.9/4.10/4.11: `aaa7a8d`. Фронт 4.9/4.10/4.11: `252aefb`(endpoints) `933bca0`(api+MentionableUser) `3b50dc8`(chat_input автокомплит @, СИГНАТУРА onSend→(text,mentions)) `cd4bbc4`(bubble @подсветка+Закрепить) `37e6fd9`(chat_tab интеграция). Real-time фикс: `49b5b41`. Бэк 4.12: `3057645`(voice.service) `e2694a4`(routes/voice) `ee7367b`(app.js) `0b64f78`(club.js POST /chat/voice) `6017ab5`(ChatMessage +voiceStoragePath). Фронт 4.12: `a95f5b2`(api sendVoiceMessage) `6ef83c4`→`6640d63`(endpoints) `4875b87`/`db8a1c4`(voice_player) `5054bd2`(bubble VoicePlayer) `53324f5`(chat_input кнопка) `f7d2e7f`(chat_tab _sendVoice) `4f8a92c`(Info.plist). Фикс record: `814a7e9`(битый override — откачен) `611bd26`(откат override) `c8bb44d`(record ^4.4.4) `b1ecc01`(voice_recorder под 4.x). Layout-фикс: `d3be72a`(voice_recorder +колбэк) `c5f5d17`(chat_input Expanded при записи).

---

## ИНСТРУКЦИЯ ЮЗЕРУ — ЗАПУСК И ТЕСТ

### Запуск после правок
```bash
cd ~/Chitatel_app && git pull origin main
cd server && npm run dev          # рестарт если новые роуты (4.12 voice — да)
cd ../app && flutter run          # только Dart-правки → можно 'R' (hot restart) если уже запущен
```
`pod install` нужен ТОЛЬКО при смене нативных пакетов (был нужен при добавлении record; чисто Dart-правки layout-фикса — НЕ нужен). НЕ делать `flutter clean`.

### Тестовые аккаунты (нет штатного логаута — между ними Device→Erase All Content)
| Email | Пароль | Роль |
|---|---|---|
| anna@chitatel.app | anna123456 | admin (голосовые, закрепы, mentions-цель, ссылки) |
| test-premium@chitatel.app | test123456 | premium активный клуб (основной тест участницы) |
| test-basic@chitatel.app | test123456 | basic |
| test-expired@chitatel.app | test123456 | архив read-only |

Seed: `cd ~/Chitatel_app/server && npm run seed:club`.

### Что протестировать (Фаза 4 целиком)
**Под `anna@chitatel.app`:**
- 4.12 голосовые: пустое поле → кнопка-микрофон → тап → панель записи (корзина, красная точка, таймер, «Идёт запись…», кнопка отправки) БЕЗ краша → отправка → bubble с waveform → play играет. Корзина отменяет
- 4.10 закрепы: long-press → «Закрепить» → баннер сверху
- 4.9 mentions: ввод `@` → всплыла Анна → тап вставил `@Анна`
- real-time: своё сообщение появляется сразу, удаление сразу, не залипает после диалогов/табов

**Под `test-premium@chitatel.app` (Erase сначала):**
- Микрофона НЕТ (поле пустое → сразу стрелка отправки)
- В меню сообщения НЕТ пункта «Закрепить»
- Голосовые Анны видны и играют
- `@Анна` работает (упомянуть ведущую может любая)

Клавиатура в симуляторе не всплывает = Hardware Keyboard (Cmd+Shift+K), НЕ баг (урок #19).

---

## УРОКИ (продолжение, #20+; #1-19 в AI-CONTEXT.md)

**#20 ⚠️ КОНТЕКСТ-ФАЙЛ РАЗРОС — ДЕЛИТЬ, НЕ ПЕРЕПИСЫВАТЬ (17.05.2026):** при превышении ~50KB AI-CONTEXT.md заводится AI-CONTEXT-2.md (продолжение). Первый файл НЕ редактируется (стабильный фундамент-архив), прогресс фиксируется во втором. AI читает оба по порядку. Юзер должен добавить упоминание второго файла в Project Instructions проекта Claude (инструкция о роли — там, не в репо; файла CHAT-INSTRUCTION.md в репо нет).

**#21 ⚠️ НЕ УГАДЫВАТЬ ВЕРСИИ ПАКЕТОВ (17.05.2026):** Claude выдумал `record_platform_interface 1.0.4` (не существует) в dependency_overrides — `pub get` упал. Нарушение правила «не угадывать». Правильно: либо цельный пакет без под-зависимостей (перешли на `record 4.x`), либо подбор по фактическому выводу `flutter pub get`/`flutter pub deps`. Признал ошибку, откатил, исправил по фактам.

**#22 ⚠️ API ПАКЕТА МЕНЯЕТСЯ МЕЖДУ МАЖОРАМИ:** record 5.x (`AudioRecorder()`, `RecordConfig`, `sampleRate`) ≠ record 4.x (`Record()`, параметры в `start()`, `samplingRate`). При смене мажорной версии пакета — переписать вызовы под фактический API целевой версии, не копировать вслепую.

**#23 ⚠️ RenderFlex unbounded width (17.05.2026):** виджет с `Spacer()`/`Expanded` внутри `Row`, помещённый в родительский `Row` без `Expanded`, падает (unbounded width + flex взаимоисключающи). Решение — растягивающийся виджет сообщает родителю состояние через колбэк, родитель оборачивает в `Expanded`. Единый инстанс виджета через переменную — чтобы State не пересоздавался при перестройке layout.

**#24 ⚠️ ПРИЧИНА БАГА ИЗ СТЕКТРЕЙСА, НЕ ИЗ ДОГАДКИ (17.05.2026):** layout-баг и конфликт record — оба раза причина установлена из фактического вывода (стектрейс до файла:строки / текст ошибки pub), потом фикс. Подтверждает урок #17.

---

## РАБОЧАЯ СРЕДА (без изменений — детали в AI-CONTEXT.md)

Mac MacBook Pro 2018 macOS Ventura, Xcode 15.2 + iOS 17.2 sim (iPhone 15), Flutter 3.22.3 (withOpacity), Node 20.20.1, MongoDB 7.0.20 (`mongod --dbpath ~/mongodb/data`). Аудио: `/Users/g/Chitatel_app/audio-storage/` (club-images/, voice-messages/). Бэк `cd ~/Chitatel_app/server && npm run dev`. Фронт `cd ~/Chitatel_app/app && flutter run`. pod install: 2 предупреждения [!] безвредны. Нет штатного logout — Device→Erase All Content.

---

## ОТЛОЖЕНО (PENDING)

- **Плеер Маленького Принца:** `PlatformException(-11800)` AVFoundation iOS на сетевой MP3, вероятно баг симулятора. Отложено до физустройства/VPS. Test ID `6a0347c62598cd8bc4f96df8`, bookSlug `malenkii_princ`.
- **Задача 1.8 «Гостевой режим»** — критично перед Фазой 7 (Apple 5.1.1(v)), делать с 1.3 когда Apple Dev.
- **Вопросы к Анне:** 6.1 (пакеты «Достоевский» эксклюзив?/2.5.5), 8.1 (отзывы в v1?/6.9), 8.2 (когда Apple Dev $99?/1.3,Фаза3,push,TestFlight), 8.3 (когда MP3 остальных разборов?), 8.5 (когда Анна активно отвечает в чате?/релиз), NEW (обложка клуба как книга или арт?/схема ClubMonth+переключатель).
- **Визуальный переключатель клубов** — не дорабатывать пока Анна не ответит про обложку/название клуба.
- **STEP-BY-STEP.md не обновлён под 4.6-4.12** — план зафиксирован здесь, не критично.

---

## ДАЛЬШЕ ПО ПЛАНУ (после подтверждения теста 4.12)

```
Фаза 4 ✅ (после теста голосовых) — все 12 задач + навигация + фиксы
  → Фаза 5 (ИИ-дневник: 5.1, 5.2, 5.3) — опционально до Apple Dev
  → ПОКУПКА Apple Dev Account ($99) — когда клуб работает e2e
  → Фаза 1.3 (Apple Sign In) + 1.8 (guest mode) вместе
  → Фаза 3 (платежи)
  → Фаза 6 (полировка) — включая push (фича #8 чата)
  → Фаза 7 (TestFlight + App Store)

🚨 КРИТИЧНО ПЕРЕД TESTFLIGHT: 1.8 (guest mode), ITSAppUsesNonExemptEncryption=false в Info.plist
```

---

*Создан: 17.05.2026. Продолжение AI-CONTEXT.md (тот разросся до 52KB, не редактируется). Фаза 4 бэк 4.1-4.12 ✅, фронт 4.1-4.11 ✅, фронт 4.12 написан + layout-фикс ✅ ОЖИДАЕТ ТЕСТА. Уроки #20-24. Прогресс фиксировать далее ТОЛЬКО здесь.*
