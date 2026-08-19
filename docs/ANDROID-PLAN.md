# ANDROID-PLAN — рабочий документ по выпуску ЧИТАТЕЛЯ в Google Play

Создан 19.08.2026. Это документ, по которому идёт работа — аналог
STEP-BY-STEP для Android. Обновлять по мере выполнения, отмечать галочками.

Основание: аудит кода ветки `main` (структура, 22 зависимости, 136 файлов
`app/lib`, сервисы сервера, схемы, `codemagic.yaml`) + сверка с политиками
Google Play по первоисточникам (ссылки в разделе 9).

---

## 0. Что уже известно о состоянии кода

**Переносится само:**
- Все 33 экрана — Material, ни одного Cupertino-виджета, ни одного `Platform.is`
- Все 22 зависимости поддерживают Android, iOS-only пакетов нет
- `SafeArea` везде корректно, хардкода под вырез iPhone нет
- В конфиге плеера уже есть Android-поля (канал уведомления и т.п.)

**Отсутствует полностью:**
- папка `app/android` (проект создан только под iOS)
- push под Android: на клиенте нативный канал `chitatel/push` реализован
  только в `AppDelegate.swift`; сервер — только `node-apn`; в `User` одно поле
  `pushToken` без платформы
- платежи Google: клиент шлёт JWS StoreKit, сервер проверяет только через
  `@apple/app-store-server-library`; вебхук только `POST /api/webhooks/apple`;
  в `Purchase` есть поле `platform: apple|google|web`, но оно не заполняется
- `PopScope` нигде (аппаратная кнопка «Назад» не обработана)
- вход Google скрыт (`_googleEnabled = false`), clientId захардкожен iOS-овский

---

## 1. Требования Google, которых нет у Apple (найдено по первоисточникам)

Каждое — отдельная задача ниже. Здесь — чтобы не потерять.

| # | Требование | Источник | Что делать |
|---|---|---|---|
| R1 | **targetSdk 36** обязателен для новых приложений с 31.08.2026 | answer/11926878 | ставить 36 сразу, релиз будет после даты |
| R2 | **Billing Library ≥ 8** с 31.08.2026 | developer.android.com/google/play/billing/deprecation-faq | `in_app_purchase_android` ≥ 0.5.0; проверить в `pubspec.lock` после `pub get` |
| R3 | **16 KB page size** для новых приложений под API 35+ | developer.android.com/guide/practices/page-sizes | актуальный Flutter, AGP ≥ 8.5.1; проверить .so плагинов в App bundle explorer |
| R4 | Foreground service `mediaPlayback`: манифест + **декларация в консоли с видео** | answer/13392821 | записать короткое видео: запуск плеера → свернуть → играет |
| R5 | **Не использовать** `READ_MEDIA_IMAGES` — только Photo Picker | answer/14115180 | `image_picker` на Android 13+ и так Photo Picker; проверить merged manifest на отсутствие READ_MEDIA_* |
| R6 | UGC: принятие условий **до** первого сообщения; жалоба + блокировка; модерация | answer/9876937 | чекбокс согласия есть при регистрации (`login_screen.dart:222`) — проверить, что он обязателен для email-регистрации тоже; остальное есть |
| R7 | **Кнопка жалобы на ИИ-контент** внутри приложения | answer/17190352 | добавить «Пожаловаться на разбор» на экране анализа + приём на сервере |
| R8 | Удаление аккаунта: in-app **и веб-страница** для запроса | answer/13327111 | сделать `api.chitatel.app/legal/delete-account`, URL → Data safety |
| R9 | Data safety form — включая передачу текста цитат в OpenAI | answer/10787469 | заполнить по той же таблице, что Privacy labels Apple, + Messages, Audio, Photos |
| R10 | Health apps declaration — обязательна для всех | answer/14738291 | «My app doesn't provide any health features» — допустимо, пока в листинге нет слов «терапия / лечит / поддержка ментального здоровья» |
| R11 | **Merchant account → полный адрес ИП публикуется** в карточке | answer/13634888 | сказать Анне заранее — адрес из выписки станет публичным |
| R12 | Персональный аккаунт: 12 тестировщиков × 14 дней непрерывно | answer/14151465 | группа 15 человек, закрытый трек — как можно раньше |
| R13 | App access — демо-аккаунт с вечным паролем, без OTP | answer/9859455 | те же `appreview@` / `appreview2@` |
| R14 | Остальные декларации App content: Ads=No, Target audience=18+, Financial=No, Government=No, News=No, Advertising ID=No | answer/9859455 | формальные, 10 минут |

---

## 2. Задачи — по порядку выполнения

Формат как в STEP-BY-STEP: что делаем, файлы, проверка. Оценки — рабочие дни.

### A. Каркас (1–2 дня) — можно делать ДО аккаунта Google

- [ ] A1. `flutter create --platforms=android .` в `app/`. Проверить, что `.metadata` получил платформу android.
- [ ] A2. `android/app/build.gradle(.kts)`: `applicationId app.chitatel.android` (или тот же `app.chitatel.ios`? — **решить**; рекомендую `app.chitatel`), `minSdk 26`, `targetSdk 36`, `compileSdk 36`. AGP ≥ 8.5.1 (R3).
- [ ] A3. `AndroidManifest.xml`: `INTERNET`, `RECORD_AUDIO`, `CAMERA`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `com.android.vending.BILLING`; сервис `com.ryanheise.audioservice.AudioService` с `foregroundServiceType="mediaPlayback"` + receiver (по README audio_service); `UCropActivity` для image_cropper; `<queries>` для `url_launcher`; `MainActivity extends AudioServiceActivity`. **Убедиться, что READ_MEDIA_* и READ_EXTERNAL_STORAGE в merged manifest нет** (R5).
- [ ] A4. Адаптивная иконка из монограммы (foreground + background слои), `mipmap-*`.
- [ ] A5. Подпись: keystore, `key.properties`, в `.gitignore`. Keystore — в Codemagic secrets, не в репо.
- [ ] A6. Переименовать канал уведомления плеера `app.chitatel.ios.audio` → `app.chitatel.audio` (`audio_service.dart:~745`).
- [ ] A7. `image_cropper`: добавить `AndroidUiSettings` рядом с `IOSUiSettings` (`edit_profile_screen.dart:103-119`).
- [ ] A8. Собрать debug на эмуляторе (образ с Google APIs). **Пройти все 33 экрана, записать, что сломалось.** После этого — уточнить сроки ниже.

**Проверка:** приложение запускается, главная/каталог/плеер/дневник работают, звук в фоне играет, уведомление плеера показывается.

### B. Вход (0,5–1 день)

- [ ] B1. `login_screen.dart`: `_googleEnabled = true` **только для Android** (через `Platform.isAndroid` или `defaultTargetPlatform`) — на iOS оставить как есть, чтобы не трогать одобренную сборку.
- [ ] B2. `auth_provider.dart:233`: вместо захардкоженного iOS clientId — `serverClientId` для Android (Web client ID из Google Cloud); SHA-1 debug и release в Google Cloud Console.
- [ ] B3. Кнопку «Войти через Apple» на Android скрыть (решение: не поддерживаем).
- [ ] B4. Проверить email-регистрацию: чекбокс согласия с условиями обязателен (R6).

### C. Push (3–4 дня)

- [ ] C1. Сервер, схема: `User.pushToken: String` → `User.devices: [{token, platform: 'ios'|'android', updatedAt}]`. Скрипт миграции существующих токенов в `{platform:'ios'}`. Роут `notifications.js` — сохранять `platform`.
- [ ] C2. Сервер: `push.service.js` — вторая ветка отправки через FCM (пакет `firebase-admin`), чанки по 100 как у APNs, мёртвые токены FCM → удалять из `devices`. Service account JSON — в `.env`-путь, не в репо.
- [ ] C3. Клиент: Firebase в проекте (`firebase_core`, `firebase_messaging`), `google-services.json` (в `.gitignore`? — нет, он не секрет, но решить).
- [ ] C4. Клиент: Kotlin-сторона канала `chitatel/push` — те же методы `requestPermissionAndRegister` / `getToken` / `getNotificationStatus`, обратные `onToken` / `onTap`. `push_service.dart:~95` — `platform: 'android'` вместо захардкоженного `'ios'`.
- [ ] C5. Тап по пушу из закрытого приложения → нужный экран → есть выход назад (то же, что проверяли для iOS).

**Проверка:** пуш из админки приходит на эмулятор и на реальный Android; iOS-пуши не сломались.

### D. Навигация и вёрстка (2–3 дня)

- [ ] D1. `PopScope` на экранах с несохранёнными данными: чат (ввод), форма цитаты, редактирование профиля, регистрация, пейвол во время покупки.
- [ ] D2. Системная кнопка «Назад» на корневых табах — выход из приложения или переход на «Главную» (решить; стандарт Android — на главную, потом выход).
- [ ] D3. `SystemUiOverlayStyle` — цвет статус-бара под тему.
- [ ] D4. Пройти все 33 экрана по списку из A8, починить найденное.
- [ ] D5. Клавиатура в чате и в шторках (`viewInsets`) — проверить на Android, там поведение отличается.

### E. Платежи Google (5–7 дней)

- [ ] E1. Клиент: `purchase_provider.dart:230`, `product_purchase_provider.dart:168` — на Android `serverVerificationData` это purchase token, а не JWS. Ветка: Android → POST `/api/purchases/verify-google` с `{purchaseToken, productId, packageName}`.
- [ ] E2. Клиент: `applicationUserName` на Android уходит в `obfuscatedAccountId` — сервер должен уметь его читать (E4).
- [ ] E3. Клиент: `manage_sub_screen.dart:30` — на Android ссылка на `https://play.google.com/store/account/subscriptions`; тексты «App Store» → нейтральные или по платформе.
- [ ] E4. Сервер: `purchase.service.js` — `verifyGooglePurchase()` через Google Play Developer API (`googleapis`, `purchases.subscriptionsv2.get` / `purchases.products.get`), service account с доступом в Play Console. Результат → тот же `applyTransaction()`, `Purchase.platform = 'google'`.
- [ ] E5. Сервер: Real-time Developer Notifications через Pub/Sub → роут `POST /api/webhooks/google`; маппинг типов (RENEWED, CANCELED, REVOKED, EXPIRED, GRACE_PERIOD) на те же действия, что в `webhook.service.js` для Apple.
- [ ] E6. Сервер: `User.subscriptionOriginalTransactionId` — Apple-термин; для Google хранить `purchaseToken`. Решить: переименовать в `subscriptionExternalId` + `subscriptionPlatform`, или добавить поле.
- [ ] E7. Play Console: продукты (те же ID `club.basic.monthly`, `book.*`, `package.*`), цены, License testers для sandbox.
- [ ] E8. Песочница: покупка, продление (ускоренное в тесте), отмена, возврат → доступ снимается. DID_RENEW-аналог проверить обязательно.

**Проверка:** покупка на Android даёт доступ к клубу; возврат снимает; iOS-путь не задет.

### F. Обязательное по политикам (1–2 дня)

- [ ] F1. Кнопка «Пожаловаться на разбор» на экране ИИ-анализа + `POST /api/ai/report` (R7). Можно показать и на iOS — вреда нет, но это новый UI в одобренной сборке; решить.
- [ ] F2. Веб-страница `server/public/legal/delete-account.html`: как удалить в приложении + форма/почта для запроса без приложения + что удаляется, что хранится и сколько (R8).
- [ ] F3. Записать видео для декларации foreground service (R4).
- [ ] F4. Проверить тексты листинга и приложения на «терапия / лечение / ментальное здоровье» (R10).

### G. Сборка (0,5 дня)

- [ ] G1. `codemagic.yaml`: второй workflow `android-play`: linux/mac instance с Java 17, `android_signing`, `flutter build appbundle --release`, артефакт `*.aab`, publishing `google_play` (service account JSON в secrets), трек `internal` → потом `closed`.
- [ ] G2. Проверить в App bundle explorer предупреждения про 16 KB (R3).

### H. Консоль и релиз (1 день работы + 14 дней календаря)

- [ ] H1. Карточка: тексты из ASC (адаптировать короткое описание до 80 символов), скриншоты с эмулятора (телефон 16:9 или 9:16, мин. 320px, макс. 3840px), иконка 512×512, feature graphic 1024×500 (**обязателен**, у Apple его нет — нарисовать).
- [ ] H2. App content: все декларации по таблице R1–R14.
- [ ] H3. Data safety (R9), URL удаления аккаунта (R8), privacy policy URL.
- [ ] H4. App access: демо-аккаунты (R13).
- [ ] H5. Закрытый трек, 15 тестировщиц, 14 дней непрерывно (R12). **Стартовать, как только есть сборка из C/D — платежи можно доехать в следующей сборке на том же треке.**
- [ ] H6. Apply for production → production.

---

## 3. Сроки

| Этап | Дней | Уточнить после |
|---|---|---|
| A. Каркас + первая сборка | 1–2 | — |
| B. Вход | 0,5–1 | A8 |
| C. Push | 3–4 | A8 |
| D. Навигация/вёрстка | 2–3 | **A8 — здесь главная неопределённость** |
| E. Платежи | 5–7 | — |
| F. Политики | 1–2 | — |
| G. Сборка | 0,5 | — |
| H. Консоль | 1 | — |
| Отладка/тестирование | 3–5 (держать в уме 5–7) | |
| **Итого работы** | **17–25 рабочих дней** | |

**Календарь: ~6 недель** при одном разработчике без параллельной крупной
работы по iOS. Плюс 14 дней закрытого теста, которые перекрываются с E–F,
если закрытый трек стартует после C/D.

⚠️ Сроки Анне не называть до A8. После A8 — переоценить D и отладку.

---

## 4. Когда что нужно от Анны

| Когда | Что | Зачем |
|---|---|---|
| **Сейчас** | Аккаунт разработчика Google, персональный, на неё. Документ личности. Платёжный профиль на ИП | верификация занимает дни; аккаунт нужен к первой загрузке на закрытый трек (конец недели 1 / начало недели 2) — и чем раньше стартует 14-дневный отсчёт, тем лучше |
| Сейчас | Знать: **адрес ИП станет публичным** в карточке (merchant account, R11) | чтобы не было сюрприза |
| Сейчас | Начать собирать 15 тестировщиц с Android | нужны к концу недели 2–3 |
| Неделя 1 | Решение по applicationId | см. A2 |
| Неделя 1 | Решение: вход через Apple на Android не показываем | B3 |
| Неделя 2 | Решение по обложкам — Google снимает по жалобам быстрее | |
| Неделя 3 | Цены в Google Play (не наследуются из ASC) | E7 |
| Неделя 4 | Feature graphic 1024×500 — дизайн или делаю из монограммы | H1 |
| Перед релизом | Когда выпускать: сразу или через 2 недели после iOS | |

---

## 5. Правило работы с ветками

Apple проверяет сборку **36**, а не репозиторий. Но `main` должен оставаться
ровно тем, что ушло на ревью, — чтобы при отказе собрать исправление за час.

- Вся работа по Android — в ветке **`android`** от текущего `main`.
- Правки по ответу Apple — в `main`, сборка, отправка. Потом `main` → `android` (merge).
- Папка `app/android` в iOS-сборку не попадает, Codemagic её не трогает.
- Общие правки клиента (B1, C4, D1, E1–E3, F1) — писать так, чтобы на iOS поведение не менялось, и проверять это.

---

## 6. Что НЕ предусмотрено и всплывёт только на эмуляторе

Честный список неизвестного:
- поведение фонового аудио при звонке / переключении наушников на разных прошивках
- клавиатура в чате и шторках
- жестовая навигация vs три кнопки
- 16 KB совместимость .so у `record` / `image_cropper`
- что именно Google посчитает health-функцией при ревью (R10)
- детали Real-time Developer Notifications (E5) — в песочнице ведут себя не всегда как в проде

---

## 7. Чего специально НЕ делаем в первой версии

- вход через Apple на Android
- оффлайн, тёмная тема, iPad/планшеты
- организационный аккаунт Google (D-U-N-S ~30 дней, для ИП не гарантирован — дольше, чем 14 дней теста)

---

## 8. Журнал

- 19.08.2026 — документ создан. Аудит кода и политик выполнен. Код не тронут.

---

## 9. Первоисточники

- Target API: support.google.com/googleplay/android-developer/answer/11926878
- Foreground services декларация: answer/13392821; типы: developer.android.com/develop/background-work/services/fgs/service-types
- Photo/Video permissions: answer/13986130, answer/14115180
- UGC: answer/9876937
- Generative AI: answer/17190352, answer/14094294
- Account deletion: answer/13327111
- Data safety: answer/10787469; User Data: answer/10144311
- Subscriptions: answer/9900533; Billing Library: developer.android.com/google/play/billing/deprecation-faq
- Health apps: answer/14738291, answer/16679511
- Account types / verification: answer/13634885, answer/10841920, answer/13628312; closed testing: answer/14151465; публичные данные: answer/13634888
- App access: answer/9859455
- 16 KB: developer.android.com/guide/practices/page-sizes
- Families / target audience: answer/9867159
