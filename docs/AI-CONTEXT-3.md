# AI-CONTEXT-3 — ЧИТАТЕЛЬ (продолжение)

> **ТРЕТИЙ ФАЙЛ КОНТЕКСТА.** Предыдущие: `AI-CONTEXT.md` (база, Фазы 1-2, чат 4.1-4.8, уроки #1-19) и `AI-CONTEXT-2.md` (Фаза 4, задачи 1.3/1.7/1.8, уроки #20-27).
>
> **Порядок чтения для AI:** `AI-CONTEXT.md` → `AI-CONTEXT-2.md` → **этот файл**.
>
> **Прогресс фиксировать ДАЛЕЕ ТОЛЬКО ЗДЕСЬ.** Первые два не редактировать (архив).
>
> ⚠️ **Юзеру:** добавить упоминание `AI-CONTEXT-3.md` в Project Instructions проекта Claude (чтобы будущие сессии его читали).

---

## ТЕКУЩИЙ СТАТУС (на 26.06.2026, вечер)

**✅ ПРИЛОЖЕНИЕ В TESTFLIGHT И ЗАПУЩЕНО НА ФИЗ.АЙФОНЕ (26.06.2026).** Первый билд собран через Codemagic, залит в TestFlight, установлен на реальный айфон, **вход через Apple Sign In работает в проде**. Подробности — блок «CODEMAGIC + TESTFLIGHT» ниже. Это снимает блокер удалённого теста Анны.

**✅ ДЕПЛОЙ СЕРВЕРА ВЫПОЛНЕН (26.06.2026).** Бэкенд работает в проде: `https://api.chitatel.app` отдаёт API по HTTPS, каталог + клуб залиты в свою MongoDB. Блок «ДЕПЛОЙ СЕРВЕРА» ниже.

**✅ ПРИЛОЖЕНИЕ ПОДКЛЮЧЕНО К БОЕВОМУ СЕРВЕРУ.** Работает на симуляторе И на физ.айфоне против `api.chitatel.app`: каталог, вход (email/гость/Apple), клуб с чатом, аудио Маленького принца. Блок «ПОДКЛЮЧЕНИЕ ПРИЛОЖЕНИЯ» ниже.

**Фаза 3 (Платежи) — КОД ГОТОВ + КАБИНЕТ + РУЧНЫЕ ШАГИ 3.2 СДЕЛАНЫ.** 3.3/3.4/3.2 закоммичены, 3.1 кабинет настроен, пакеты+роутер+capabilities добавлены.

**Не сделано / осталось до реального теста ПОКУПОК:**
- **`.env` на сервере неполон** — пусты `APPLE_*_IAP` (верификация покупок — нужен ASC API key в .env + Apple root certs), `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`, `APNS_*`.
- **Sandbox-тестировщики** — не созданы.
- **Webhook URL** в App Store Connect — не прописан (сервер живой → `https://api.chitatel.app/api/webhooks/apple`).
- **ASC API key уже выпущен** (для Codemagic) — но для верификации покупок код ждёт ключ из раздела «Встроенная покупка» (надо свериться с purchase.service.js, возможно нужен ОТДЕЛЬНЫЙ ключ). См. ниже.

**⚠️ КРИТИЧЕСКОЕ СТРАТЕГИЧЕСКОЕ: основная аудитория — РОССИЯ + БЕЛАРУСЬ + Грузия. Apple-оплата в РФ/РБ НЕ РАБОТАЕТ. Канал №1 по деньгам — САЙТ + КОДЫ АКТИВАЦИИ. Приоритет высокий.**

---

## ✅ CODEMAGIC + TESTFLIGHT — ВЫПОЛНЕНО (26.06.2026)

Первый iOS-билд собран в облаке (Codemagic), подписан, залит в TestFlight, установлен на физ.айфон. **Apple Sign In работает.** Это главный результат вечерней сессии.

### Почему Codemagic (а не локальная подпись)
⚠️ **Аккаунт Анны — Individual.** Подтверждено документацией Apple (Developer Forums, инженер DTS): в Individual-команде владелец НЕ может добавить разработчика так, чтобы команда появилась в Xcode для локальной подписи. Приглашённый аккаунт юзера `g.akhmeteli89@gmail.com` (Admin, статус в ASC) в Xcode видит ТОЛЬКО Personal Team `669ZY8S56N`, команда Анны `3GS6F87RKZ` НЕ появляется и не появится. developer.apple.com под ним показывает «Purchase your membership». **Вывод: локальная Xcode-подпись недостижима и НЕ нужна.** Путь к айфону — Codemagic, который подписывает через ASC API key (минует Individual-ограничение, без постоянного 2FA Анны). Машина юзера (2017, Xcode 15.2) Xcode 26 не соберёт → Codemagic тем более оправдан.

### ASC API key (App Store Connect API)
- Юзер (под аккаунтом Анны в ASC) выпустил **App Store Connect API Key** в Users and Access → Integrations → раздел **«App Store Connect»** (Team Keys; НЕ «Встроенная покупка», НЕ «Общий ключ»/Shared Secret — тот ошибочно созданный оставлен висеть, не мешает). Скачал `.p8`, есть Issuer ID + Key ID (`UN4ZB8T93H`). Роль ключа — Admin.
- ⚠️ **Для ВЕРИФИКАЦИИ ПОКУПОК на сервере, возможно, нужен ОТДЕЛЬНЫЙ ключ** из раздела «Встроенная покупка» (config ожидает `APPLE_ISSUER_ID`, `APPLE_KEY_ID_IAP`, `APPLE_IAP_PRIVATE_KEY_PATH`). Свериться с `purchase.service.js`, когда дойдём до теста покупок. Текущий ключ — для Codemagic.

### Codemagic — настройка (что сделано, как воспроизвести)
- Регистрация через GitHub (юзер заходит в GitHub через Google). План **Individual** (бесплатный, 500 мин/мес, карту НЕ привязывать).
- GitHub App установлен в аккаунт **anna-busel** (там лежит репо), доступ к `Chitatel_app`.
- Монорепо: приложение в подпапке `app/`. В Workflow Editor поле Project path заблокировано на `.` → перешли на **`codemagic.yaml`** (файл в КОРНЕ репо, путь к приложению внутри через `working_directory: app`).
- **`codemagic.yaml`** (в корне репо, итоговый коммит `79fa03d` + правки) — workflow `ios-testflight`: instance mac_mini_m2, Flutter **3.22.3**, Xcode **latest (26.4)**, CocoaPods default. Шаги: pub get → pod install (`find . -name Podfile -execdir pod install`) → keychain initialize → `app-store-connect fetch-signing-files "$BUNDLE_ID" --type IOS_APP_STORE --create` → keychain add-certificates → `xcode-project use-profiles` → `flutter build ipa --release` (build-number из get-latest-testflight-build-number +1). Publishing: app_store_connect, submit_to_testflight=false (для ВНУТРЕННЕГО тестера ревью не нужно — билд и так доступен), submit_to_app_store=false. integrations: app_store_connect = `chitatel-key`. groups: `appstore_credentials`.
- ⚠️ **CERTIFICATE_PRIVATE_KEY** — для автосоздания сертификата Codemagic нужен RSA-ключ в env-переменной (иначе ошибка `Cannot save Signing Certificates without certificate private key`). Сгенерён `ssh-keygen -t rsa -b 2048 -m PEM ...`, добавлен в Codemagic Environment variables как **`CERTIFICATE_PRIVATE_KEY`** (Secret) в группу **`appstore_credentials`**, группа подключена в yaml. (⚠️ Один ключ юзер по ошибке вставил в чат — тот скомпрометирован, использован ДРУГОЙ, свежий. Ключ хранится в Codemagic Secret, НЕ в репозитории.)

### Грабли первого билда (все решены, по порядку)
1. `No matching profiles found ... app_store` → добавлен шаг `fetch-signing-files --create`.
2. `Cannot save Signing Certificates without certificate private key` → нужен `CERTIFICATE_PRIVATE_KEY` (см. выше).
3. **Apple отклонил .ipa при заливке, код 90474** — `UISupportedInterfaceOrientations` только Portrait, но приложение поддерживало iPad (`TARGETED_DEVICE_FAMILY = "1,2"`), а для iPad нужны все 4 ориентации. **РЕШЕНИЕ юзера: только iPhone.** Поправлено `TARGETED_DEVICE_FAMILY "1,2" → "1"` во всех трёх Runner-конфигах (Debug/Release/Profile), коммит `a1e4c6e`. (iPad — отдельная задача на потом, если будет спрос; тогда нужны 4 ориентации + landscape-вёрстка.)
4. После фикса — **билд прошёл целиком, залит в TestFlight.** ✅

### TestFlight — что сделано
- Билд 1.0.0 (build 1) обработан Apple (Processing).
- **Export Compliance** (шифрование): на вопрос про алгоритмы выбрать **«Ни один из вышеперечисленных алгоритмов»** (приложение использует только системное шифрование iOS — HTTPS/Keychain, своей криптографии нет → exempt). ⚠️ Чтобы вопрос не повторялся каждый билд — можно добавить в Info.plist `ITSAppUsesNonExemptEncryption = false` (НЕ сделано пока, на будущее).
- Создана ОДНА группа **Internal Testing** (внутреннее, без ревью Apple). Добавлен ТОЛЬКО юзер (себя). **Анну добавит ПОЗЖЕ, после своего теста** (в ту же группу). Автоматическое распределение включено (в группе только юзер — безопасно).
- TestFlight требует, чтобы Apple ID в **App Store на айфоне** совпадал с тестером (`g.akhmeteli89@gmail.com`); внутри TestFlight аккаунт не выбирается. Переключать App Store (не iCloud!). Статус «Приглашён» + просьба кода = обычно несовпадение аккаунта / нет письма (resend / войти нужным Apple ID).
- **Юзер установил приложение на свой айфон и зашёл через Apple Sign In — РАБОТАЕТ.** ✅

### Найденные баги на физ.устройстве
1. **Двойной спиннер на экране входа** — при нажатии Apple крутились ОБА индикатора (Apple + Google), т.к. `loading` был общий `authState.status == loading` на обеих кнопках. **ИСПРАВЛЕНО** (коммит `c873d07`): `login_screen.dart` — добавлен `_PendingMethod` (apple/google/none), спиннер только на нажатой кнопке. Попадёт в следующий билд.
2. **Клуб не грузится под свежим Apple-аккаунтом** — ОЖИДАЕМО (у нового аккаунта нет подписки, клуб — контент по подписке; у тест-аккаунтов подписка проставлена seed'ом). ⚠️ НО надо проверить: клуб без подписки должен показывать понятное состояние (приглашение оформить), а не бесконечную крутилку. Если виснет крутилка — баг отображения (клиент не обрабатывает ответ сервера для не-подписчика). Юзер не уточнил окончательно — проверить в след. раз.

### Для следующего билда (как пересобрать)
Codemagic → Start new build → workflow `ios-testflight`, branch main. Возьмёт свежий код из репо (там уже фикс спиннера + device-family). Авто-распределение само пришлёт билд юзеру. Build number автоинкрементится.

---

## ✅ ПОДКЛЮЧЕНИЕ ПРИЛОЖЕНИЯ К БОЕВОМУ СЕРВЕРУ (26.06.2026)

- `app/lib/core/network/api_endpoints.dart` (`b79eb68`): baseUrl/socketBaseUrl через `String.fromEnvironment('API_BASE', defaultValue: 'https://api.chitatel.app')`. **Прод по умолчанию.** Локальная разработка: `flutter run --dart-define=API_BASE=http://localhost:3000`.
- Socket-сервис (`club_socket_service.dart`) чистый — без хардкодов ws/localhost, через `socketBaseUrl`, https→wss автоматом (nginx WebSocket проброшен).
- **Проверено на симуляторе И на физ.айфоне:** каталог/главная грузятся с прода, вход email (`test-premium@chitatel.app`/`test123456`) работает, гость → GuestGate, клуб «Гроздья гнева» с чатом, аудио Маленького принца играет, Apple Sign In (только на устройстве).
- **Аудио Маленького принца залито на сервер** (rsync с мака по паролю deploy): `~/Chitatel_app/audio-storage/malenkii_princ/part-1..6.mp3` (~172МБ) → `/var/audio/chitatel/malenkii_princ/`. Играет.

### Ручные шаги 3.2 — СДЕЛАНЫ (на маке, коммиты)
- `flutter pub add in_app_purchase url_launcher` + `pod install` (21 под, 2 безвредных warning [!] про platform/base config — норма).
- Роутер `app_router.dart` (`367fe48`): заглушка «Тарифы» → реальный `PaywallScreen` + импорт.
- Xcode capabilities: добавлены **In-App Purchase** + **Sign in with Apple** (при выбранной Personal Team список capabilities урезан → выбор Team=**None** разблокировал). Файл `Runner.entitlements` создан (только `com.apple.developer.applesignin` — для In-App Purchase отдельный entitlement НЕ нужен, это норма). Коммит `03086a6`.
- ⚠️ `project.pbxproj`: Xcode заменил чужой DEVELOPMENT_TEAM `UMJ2K8QN7B` → Personal `669ZY8S56N` (и `""` в Debug). Для Codemagic неважно (подписывает своим ключом). Bundle id правильный `app.chitatel.ios`. CODE_SIGN_ENTITLEMENTS добавлен.
- Push с мака: GitHub не принимает пароль → нужен **PAT** (Personal Access Token). Username `g1orgi89` + токен. `credential.helper osxkeychain` чтобы не вводить каждый раз.

### ⚠️ Git-гигиена на маке (ВАЖНО для будущих коммитов)
- `.gitignore` НЕ покрывает `audio-storage/` (172МБ аудио), `.env*`, мусорные `app/-H`/`app/-d` → `git check-ignore` вернул пусто. Коммитили ВЫБОРОЧНО по именам файлов, чтобы НЕ захватить аудио/секреты. `.env.bak` юзер удалил.
- **TODO: добавить в `.gitignore` строки `audio-storage/`, `.env*`, и удалить мусор `app/-H app/-d`** — чтобы не маячили и не улетели случайно. Не сделано (отложено).

---

## ✅ ДЕПЛОЙ СЕРВЕРА — ВЫПОЛНЕНО (26.06.2026)

Бэкенд развёрнут на том же VPS Contabo, где живёт мини-апп reader-bot, **строго изолированно**. SSH под `deploy` (с ПК ключ `beautycontent_cicd`; с мака — по паролю, ключа на маке нет).

⚠️ **VPS — ОБЩИЙ продакшен:** кроме reader-bot там чужие сайты (`unibotz.com`, `beautycontentpro`), процессы (`reader-bot-dev`, Qdrant, Redis), системный Node 18, глобальный PM2. Чужое не трогать. Мини-апп reader-bot отключат после публикации нового приложения. Снапшот юзер НЕ делал.

### Что сделано

| Шаг | Детали |
|-----|--------|
| **Домен** | `chitatel.app` (Namecheap), ICANN-верификация пройдена. A-записи `api`+`@`+`www` → `161.97.102.73`. Корень/www под будущий лендинг+Terms/Privacy. |
| **Node** | Системный Node v18 (чужой, не трогать). Наш **Node 20.20.2 через nvm под `deploy`**. |
| **MongoDB** | Своя в Docker: `chitatel-mongodb`, mongo:8.0, **`127.0.0.1:27018`** (наружу закрыт), --auth, root `chitatel_admin`. Изолирована от reader-bot (27017). Внутри контейнера Mongo на 27017 (для `docker exec` — 27017, снаружи — 27018). |
| **Бэкенд** | Клон в `/home/deploy/chitatel/Chitatel_app`. `npm install` (545 пакетов; `npm audit fix --force` НЕ запускать — сломает multer 1.x). |
| **.env** | `/home/deploy/chitatel/Chitatel_app/server/.env` (600, в gitignore). Есть: PORT=3000, MONGO_URI (27018), JWT/REFRESH/AUDIO секреты (openssl на сервере), PUBLIC_BASE_URL=https://api.chitatel.app, APPLE_TEAM_ID=3GS6F87RKZ, APPLE_CLIENT_ID/BUNDLE_ID=app.chitatel.ios, ADMIN_EMAIL. **Пусто:** APPLE_*_IAP, GOOGLE_CLIENT_ID, OPENAI_API_KEY, APNS_*. |
| **AUDIO_BASE_PATH** | `/var/audio/chitatel` (owner deploy). Аудио Маленького принца залито (см. выше). |
| **PM2** | Глобальный PM2 на Node 18 (чужой, не трогать). Наш — через `ecosystem.config.js` с `interpreter: /home/deploy/.nvm/versions/node/v20.20.2/bin/node`. Процесс **`chitatel-api`**, online, cluster (1 инстанс). interpreter-правка ТОЛЬКО на сервере, в репо НЕ коммичена. |
| **nginx** | Отдельный конфиг `/etc/nginx/sites-available/api.chitatel.app`. proxy_pass→127.0.0.1:3000, WebSocket проброс, `client_max_body_size 12M`, X-Forwarded-Proto. Перед reload — `nginx -t`. |
| **HTTPS** | certbot → серт до 24.09.2026, авто-обновление, HTTP→HTTPS 301. |
| **Каталог+клуб** | `npm run seed` (54+3+10) + `npm run seed:club` (4 юзера, 3 клуба, сообщения) — ОБА прошли. API: `/api/books` отдаёт каталог, `/api/health`→200. |

**Тест-аккаунты (seed:club, в проде):** anna@chitatel.app/anna123456 (admin), test-premium@chitatel.app/test123456 (premium активный), test-basic, test-expired (все test123456).

### ⚠️ ХВОСТЫ деплоя (не блокеры)
1. **Mongo-пароль засветился в логах** — `seed.js` печатает `MONGO_URI` целиком. Риск низкий (127.0.0.1). Рекомендация: замаскировать вывод в seed.js + опц. сменить пароль. По решению юзера (вечер 26.06): смену пароля НЕ делать (перестраховка), маскировку — по желанию. НЕ сделано.
2. **Заглушка «Нет описания»** у 3 книг (коммит `c8a2ccb`) — перезаписать, когда Анна пришлёт.
3. **Факультативы неполные** — 7 разборов + обложка `facultativ_tolstoy` отсутствуют (Анна досылает). Не ошибки.
4. **`seed-club.js`: `+21` → `+31`** — НЕ менять сейчас (тестовый seed, перетрётся при написании реальной логики доступа клуба). Решение юзера: оставить.

### Команды сервера
```bash
ssh deploy@161.97.102.73   # по паролю
cd /home/deploy/chitatel/Chitatel_app && git pull origin main
cd server && npm install        # если менялись зависимости
pm2 restart chitatel-api        # ТОЛЬКО если менялся код server/
pm2 logs chitatel-api --lines 20 --nostream
npm run seed && npm run seed:club
curl -s https://api.chitatel.app/api/health
```
⚠️ Сервер перезапускать ТОЛЬКО при изменениях в `server/`. Правки `app/` сервер не трогают.

---

## КАТАЛОГ РАЗБОРОВ — ПЕРЕСОБРАН (14.06.2026)

Источник истины: `Каталог_разборов.xlsx`. **54 разбора + 10 пакетов** (4 ПАКЕТА: `paket_woman`, `paket_love_rel`, `paket_goals_ach`, `paket_understand_yourself` + 6 ФАКУЛЬТАТИВОВ). Цены BYN+USD (USD под точки Apple `.99`).

**Коммиты:** `seed.js` (`2c893cd`) · `reader-bot-catalog.json` (`2854ecf` → авторы `b31c037` → заглушки описаний `c8a2ccb`).

**Досл­ать (у юзера, НЕ в репо):** обложки #44-54 + `facultativ_tolstoy.png`; описания 3 (Лолита, Тело помнит все, Пакет Латыпов+Франкл — стоит заглушка); 7 разборов факультативов; аудио всех разборов.

**PENDING:** «Пакет Латыпов+Франкл» (#51) разбор или пакет? Обложки-серия — ОТЛОЖЕНО (Stability MCP падает).

**seed.js:** читает `reader-bot-catalog.json`, чистит Book/Package, вставляет 54+3 бесплатных (Алиса/Ешь-молись-люби/Маленький принц с 6 аудио)+10 пакетов. Идемпотентный. `appleProductId = book.{slug}`/`package.{slug}`. Обложки → `asset://book-covers/{slug}.png`. **Залито в прод 26.06.**

---

## ✅ ЗАДАЧА 3.1 — APP STORE CONNECT — СДЕЛАНО (16.06.2026)

**Юр.лицо/соглашения:** Hanna Busel, ИП Тбилиси (`Iv. Javakhishvili Street 91, Tbilisi 0198, Georgia`, налог. №`94424749`). Paid Apps — Активно. W-8BEN + Foreign Status — Активно (Foreign Tax ID грузинский, US TIN пусто, льготу по договору НЕ заявляли). Банк Bank of Georgia USD — Активно (Beneficiary BUSEL HANNA, IBAN GE94BG0000000499009798, SWIFT BAGAGE22, intermediary Citibank NY CITIUS33).

**Small Business Program (15%):** заявка ПОДАНА, ждёт письма. До одобрения матрица считает Proceeds по 30%.

**Приложение:** «Читатель: книжный клуб», **Apple ID 6779357856**, SKU `chitatel-ios-001`, Bundle `app.chitatel.ios`, язык ru. Категория/рейтинг/скриншоты — НЕ заполнены (для публикации, Фаза 7). НЕ нажимать «Добавить для проверки».

**Продукты (subscription group «Клуб ЧИТАТЕЛЬ», id 22166930):**
- ✅ `club.basic.monthly` — Apple ID 6781739637, 1 мес, база США $27.99, лок. ru. «Метаданные отсутствуют» — норма.
- ✅ `club.basic.season` — 3 мес, база ~$54.99, лок. ru.
- ⚠️ Цены по странам не выровнены (Грузия ~$35 из-за НДС). Шлифовать потом. Ориентир — Proceeds. Анна назвала $28 — уточнить: цена клиента или доход на руки.

**Разборы/пакеты через Apple как non-consumable** (`book.{slug}`/`package.{slug}`, 64 продукта) — СКРИПТОМ через ASC API, ПОЗЖЕ (после теста покупок на подписке). API капризный (цены через price points, бывают 500).

**Осталось в кабинете:** Sandbox-тестировщики; webhook URL (`https://api.chitatel.app/api/webhooks/apple`); категория/рейтинг/метаданные (Фаза 7); APPLE_*_IAP ключ для верификации.

---

## 🔑 СОГЛАСОВАННАЯ МОДЕЛЬ ПОДПИСОК И ДОСТУПА (15.06.2026) — ВАЖНО

### Приложение и оплата
- **Бесплатное на скачивание + IAP.** Всё, что покупается в iOS → ТОЛЬКО Apple IAP (15% Small Business / 30%). Никаких ссылок «оплати на сайте» внутри iOS (реджект 3.1.1).

### Тарифы (group «Клуб ЧИТАТЕЛЬ»)
- **Месяц** `club.basic.monthly` ~$28, авто. **Сезон (3 мес)** `club.basic.season` ~$54, авто (продление сохраняем). **«Навсегда»** `archive.forever` non-consumable (позже). **Премиум** `club.premium.*` (позже).
- ⚠️ Сезоны — ОДИН продукт «3 месяца» с автопродлением, НЕ отдельные продукты на сезон, НЕ non-renewing. «Лето/осень/зима» — название+контент.

### Сезонность (всё на НАШЕМ сервере)
- Окно продажи сезона: сезонный тариф на paywall только в начале сезона (лето=июнь, осень=сен, зима=дек, весна=мар). Вне окна — только месячный.

### Правило доступа к контенту
- Контент — помесячные клубы, старт 1-го числа, ОБЩИЕ для активных. Сезон=единица оплаты, месяц=единица контента.
- **Доступ активного = скользящее окно «текущий + предыдущий месяц»** (предыдущий = архив 31 день хвоста). Глубже — закрыто.
- Деньги по личной дате Apple / контент по календарю (наш сервер). Не совпадают — норма.

### Что НЕЛЬЗЯ через Apple (→ сайту)
- Предпродажа заранее (авто-подписка списывает в момент покупки). Рассрочка, сертификаты, росс./бел. карты.

### Анонсы/пуши
- Анонс будущего клуба/сезона МОЖНО (статус `future` в API). Кнопка «Напомнить»/«Записаться» (не оплата). Анонс нового клуба → broadcast-пуш всем (Фаза 6).

---

## 🧩 БУДУЩАЯ ФИЧА: КОДЫ АКТИВАЦИИ (РФ/РБ) — ПРИОРИТЕТ ВЫСОКИЙ

⚠️ КАНАЛ №1 ПО ДЕНЬГАМ. Сервер есть (26.06) → можно браться.
- Человек платит на сайте → код → вводит в приложении в нейтральном поле «Активировать код» → сервер открывает доступ.
- ⚠️ Apple: ТОЛЬКО нейтральное поле, БЕЗ рекламы внешней покупки/гео-показа. Kindle/Spotify-модель.
- Код = не Apple-подписка → без автопродления.
- Новая модель `ActivationCode` + экран активации + связка с оплатой сайта (сначала вручную, потом авто).

---

## ЗАДАЧА 3.3 — ВЕРИФИКАЦИЯ — ✅ ГОТОВО (14.06)
- `models/Purchase.js` (`20f8d00`) product-agnostic. `routes/purchases.js` (`3821edb`) POST /verify. `services/purchase.service.js` (`889b87c`→`6462df5`): `{verifyPurchase, applyTransaction, getVerifier, mapProduct}`. `config/index.js` (`f1e4514`), `package.json` (`7839dc5`, +@apple/app-store-server-library ^3.1.0).
- ⚠️ `subscriptionPlan` enum `['monthly','semiannual','annual']`, 'season' не пишем. При финализации — добавить 'season'.
- ⚠️ **Для верификации в проде нужны APPLE_*_IAP в .env (ключ + Apple root certs) — пусто.**

## ЗАДАЧА 3.4 — WEBHOOK — ✅ ГОТОВО (14.06)
- `services/webhook.service.js` (`7045ae1`), `routes/webhooks.js` (`981bc75`) POST /api/webhooks/apple (без авторизации, всегда 200). `app.js` (`9f766d7`).
- ⚠️ URL для ASC: `https://api.chitatel.app/api/webhooks/apple` (Sandbox URL отдельно).

## ЗАДАЧА 3.2 — FLUTTER PAYWALL — ✅ ГОТОВО (15.06) + РУЧНЫЕ ШАГИ СДЕЛАНЫ (26.06)
- `api_endpoints.dart` (`154fc7d`), `purchase_service.dart` (`41a3c84`, StoreKit2), `purchase_provider.dart` (`f7431d9`), `success_screen.dart` (`cf1f287`), `paywall_screen.dart` (`e75bad4`).
- Ручные шаги (pub add, роутер, capabilities) — СДЕЛАНЫ 26.06 (см. блок «Подключение приложения»).
- Product ID `club.basic.monthly`/`club.basic.season` — Анна создала ✅.
- Ссылки Terms/Privacy — заглушки `chitatel.app/terms|privacy`. РЕШЕНО: держать на `chitatel.app`. Страницы создать — отдельная задача.

## ⚙️ Правка архивный доступ 21→31
`ClubMonth.js` (`d2370d1`) комментарий обновлён. `seed-club.js` `+21` — НЕ менять сейчас (решение юзера). Реальная логика доступа в коде ещё НЕ написана.

---

## ДАЛЬШЕ ПО ПЛАНУ

```
✅ Сервер (api.chitatel.app по HTTPS, своя Mongo, каталог+клуб)
✅ Приложение против прода (симулятор + физ.айфон)
✅ Аудио Маленького принца
✅ Ручные шаги 3.2 (пакеты/роутер/capabilities)
✅ Codemagic + первый билд в TestFlight + запуск на айфоне + Apple Sign In работает
СЛЕДУЮЩЕЕ:
  1. Проверить клуб без подписки (крутилка vs приглашение оформить) — баг или норма.
  2. Добавить Анну в Internal Testing (после теста юзера) → она тестирует удалённо.
  3. ASC API key для ВЕРИФИКАЦИИ → APPLE_*_IAP в .env сервера (+Apple root certs, +APPLE_APP_APPLE_ID=6779357856, +APPLE_ENVIRONMENT=sandbox). Свериться с purchase.service.js — нужен ли ОТДЕЛЬНЫЙ ключ «Встроенная покупка». pm2 restart после.
  4. Webhook URL в ASC + sandbox-аккаунты → тест покупок.
  5. Лендинг + Terms/Privacy на chitatel.app.
  6. Коды активации (РФ/РБ — КАНАЛ №1).
  7. Логика доступа к клубу (скользящее окно + 31 день + сезоны + окна продаж).
  8. Продукты-разборы в Apple (64 non-consumable скриптом через ASC API).
  9. Фаза 5 (ИИ-дневник), Фаза 6 (полировка + ПУШИ), Фаза 7 (метаданные + публикация).
МЕЛКИЕ ХВОСТЫ:
  - .gitignore: добавить audio-storage/, .env*, удалить app/-H app/-d.
  - Info.plist: ITSAppUsesNonExemptEncryption=false (чтобы export compliance не спрашивал каждый билд).
  - seed.js: замаскировать пароль в логе (по желанию).
```

**От Анны:** уточнить ASC-ключ для верификации; $28 цена клиента или доход; наполнение Базовый/Премиум.

---

## УРОКИ (#28+; #1-27 в AC/AC-2)

**#28** — формат/версию пакета проверять по registry. `@apple/app-store-server-library` 3.1.0 CJS.

**#29 ⚠️** Apple-подписка: старт=момент покупки, период от даты покупки. Предпродажа через Apple невозможна → сайт. Деньги по дате Apple / контент по календарю.

**#30** — активация контента извне легальна (Kindle/Spotify), НО только нейтральное поле, без рекламы внешней покупки.

**#31 ⚠️ ГЛАВНОЕ:** Apple-оплата НЕ работает в РФ/РБ. Канал №1 — сайт+коды активации.

**#32** — ценообразование Apple: витрина = НДС + комиссия + Proceeds. Ориентир Proceeds. Базовая страна США/USD.

**#33** — продукты-разборы через ASC API: создание ок, но цены/скриншоты капризны. Сначала 1-2, потом массово.

**#34 ⚠️ ПРОЦЕСС:** AI-CONTEXT обновлять ПОЛНЫМ файлом (get → дописать → запушить целиком). create_or_update_file ПЕРЕЗАПИСЫВАЕТ весь файл.

**#35 ⚠️** Общий продакшен-сервер — изоляция обязательна (Node через nvm, своя Mongo на своём порту, свой PM2-процесс с interpreter, свой nginx-конфиг). Чужое не трогать. Разведка (ss/docker ps/pm2/nginx -t) перед действиями.

**#36 ⚠️** Секреты в логах скриптов: seed.js печатает MONGO_URI с паролем. Следить за выводом, маскировать. Правки данных — через репозиторий, не молча на сервере.

**#37 ⚠️ APPLE INDIVIDUAL-АККАУНТ — ЛОКАЛЬНАЯ ПОДПИСЬ ПРИГЛАШЁННЫМ НЕДОСТИЖИМА (26.06).** Подтверждено доками Apple (DTS). В Individual-команде владелец не может добавить разработчика так, чтобы команда появилась в Xcode для подписи (только Personal Team видна). Роль Admin/перелогин/принятие приглашения НЕ помогают — это так устроено. Решения: (а) **Codemagic с ASC API key** (наш путь — обходит, без 2FA владельца), (б) конвертация в Organization (D-U-N-S, долго — НЕ делаем), (в) подпись под учёткой владельца. Для удалённого теста (Анна) и старого мака (Xcode 26 не собрать) Codemagic — единственный верный путь. НЕ покупать «Purchase membership» в Xcode/developer.apple.com под приглашённым — это попытка продать отдельную программу, не наш случай.

**#38 ⚠️ CODEMAGIC АВТОПОДПИСЬ — НУЖЕН CERTIFICATE_PRIVATE_KEY (26.06).** Для `fetch-signing-files --create` (создание сертификата через ASC API key) Codemagic требует RSA-ключ в env-переменной `CERTIFICATE_PRIVATE_KEY` (Secret, в группе, группа подключена в yaml через `groups:`), иначе `Cannot save Signing Certificates without certificate private key`. Ключ генерится `ssh-keygen -t rsa -b 2048 -m PEM`, хранится в Codemagic Secret (НЕ в репозитории — yaml только ссылается на группу). Связка шагов: keychain initialize → fetch-signing-files --create → keychain add-certificates → xcode-project use-profiles → flutter build ipa. Монорепо: codemagic.yaml в КОРНЕ, путь к app через `working_directory: app`.

**#39 ⚠️ APPLE ВАЛИДАЦИЯ .ipa: iPad-ОРИЕНТАЦИИ (код 90474) (26.06).** Если `TARGETED_DEVICE_FAMILY="1,2"` (iPhone+iPad), но в Info.plist `UISupportedInterfaceOrientations` не все 4 ориентации — Apple отклоняет загрузку (нужны все 4 для iPad-многозадачности). Решение для вертикального приложения: `TARGETED_DEVICE_FAMILY="1"` (только iPhone) во всех трёх Runner-конфигах. Export Compliance (шифрование): «Ни один из вышеперечисленных алгоритмов» = только системное шифрование iOS (exempt). Чтобы не спрашивал каждый билд — Info.plist `ITSAppUsesNonExemptEncryption=false`. Внутренний тестер (член команды) — БЕЗ beta review, билд доступен сразу после processing (`submit_to_testflight: false`).

---

*Обновлён 26.06.2026 (вечер). **✅ ПРИЛОЖЕНИЕ В TESTFLIGHT, ЗАПУЩЕНО НА ФИЗ.АЙФОНЕ, APPLE SIGN IN РАБОТАЕТ.** Сервер `api.chitatel.app` (Node20/nvm, своя Mongo в Docker 27018, PM2, nginx+certbot, изолировано на общем VPS), каталог+клуб залиты, аудio Маленького принца играет. Приложение через `--dart-define=API_BASE` (прод по умолчанию). Codemagic собирает iOS через codemagic.yaml (Flutter 3.22.3, Xcode latest, автоподпись ASC API key `chitatel-key` + CERTIFICATE_PRIVATE_KEY в группе appstore_credentials). Только iPhone (TARGETED_DEVICE_FAMILY=1). Internal Testing — пока только юзер, Анну добавить после теста. Баг двойного спиннера на входе исправлен (`c873d07`). Уроки #37 (Individual подпись), #38 (Codemagic ключ), #39 (Apple валидация). Дальше: проверить клуб без подписки → добавить Анну → ASC-ключ для верификации в .env → тест покупок → лендинг+Terms → коды активации. Прогресс фиксировать далее ТОЛЬКО здесь.*
