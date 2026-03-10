# ЧИТАТЕЛЬ — ПОШАГОВЫЙ ПЛАН РЕАЛИЗАЦИИ

> Каждая задача = конкретное действие с результатом, который можно проверить.
> Формат: что делаем → какие файлы создаём → что в MASTER.md читать → как проверить что готово.

> **Монорепо:** Все пути в задачах относительные. `src/...` = `server/src/...` (бэкенд), `lib/...` = `app/lib/...` (Flutter). Репозиторий: `anna-busel/Chitatel_app`.

---

## ФАЗА 0: НАСТРОЙКА ИНФРАСТРУКТУРЫ (1 неделя)

### Задача 0.1: Apple Developer Account ⏱ 1ч
**Что делаем:** Регистрация Apple Developer ($99/год)
**Действия:**
1. Зайти на developer.apple.com → Enroll
2. Оплатить $99 (привязать карту Анны или ИП)
3. Ожидание: 24-48 часов на одобрение
**Результат:** Доступ к App Store Connect, Certificates, Identifiers & Profiles
**Читать в MASTER:** —
**Проверка:** Можно войти в App Store Connect

### Задача 0.2: App ID и Certificates ⏱ 2ч
**Что делаем:** Создать App ID, Push-сертификат, Provisioning Profile
**Действия:**
1. Apple Developer Portal → Identifiers → Register App ID
   - Bundle ID: `app.chitatel.ios`
   - Включить capabilities: Push Notifications, Sign in with Apple, In-App Purchase, Associated Domains
2. Certificates → Create → iOS Distribution (для App Store)
3. Certificates → Create → Apple Push Notification Service (APNs Key — .p8 файл)
4. Provisioning Profiles → Development + Distribution для `app.chitatel.ios`
**Результат:** Bundle ID зарегистрирован, сертификаты скачаны
**Читать в MASTER:** Секция 6.10 (Entitlements)
**Проверка:** Profile можно выбрать в Xcode

### Задача 0.3: VPS настройка ⏱ 3ч
**Что делаем:** Настроить сервер на Contabo (VPS M — €5.99/мес)
**Действия:**
1. Заказать VPS M (6 vCPU, 16GB RAM, 400GB SSD) на contabo.com
2. SSH → `apt update && apt upgrade`
3. Установить: Node.js 20 LTS, MongoDB 7, nginx, PM2, git, certbot
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs mongodb-org nginx
   npm install -g pm2
   ```
4. Создать пользователя `chitatel` (не работаем под root)
5. Настроить файрвол:
   ```bash
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```
6. Настроить SSH key auth, отключить password auth
**Результат:** VPS работает, SSH доступен, MongoDB запущен
**Читать в MASTER:** Секция 7.1 (Стек)
**Проверка:** `ssh chitatel@<IP>`, `node -v`, `mongosh`

### Задача 0.4: Домен и SSL ⏱ 2ч
**Что делаем:** Настроить домен chitatel.app
**Действия:**
1. Купить домен chitatel.app (Google Domains или Namecheap)
2. DNS записи:
   - `A chitatel.app → <VPS IP>`
   - `A api.chitatel.app → <VPS IP>`
   - `A admin.chitatel.app → <VPS IP>`
3. nginx конфиг:
   ```nginx
   server {
       server_name api.chitatel.app;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";  # для Socket.io
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
4. SSL через certbot:
   ```bash
   certbot --nginx -d api.chitatel.app -d chitatel.app -d admin.chitatel.app
   ```
**Результат:** https://api.chitatel.app отвечает
**Читать в MASTER:** Секция 7.1 (Стек), 12.6 (Helmet + CORS)
**Проверка:** `curl https://api.chitatel.app` → ответ (пока 502, нет приложения)

### Задача 0.5: GitHub репозиторий ⏱ 1ч
**Что делаем:** Создать монорепо + структуру
**Действия:**
1. Создать GitHub репо: `Chitatel_app` — приватный (монорепо)
2. Структура:
   ```
   Chitatel_app/
   ├── server/              ← бэкенд (Express.js)
   │   ├── src/
   │   ├── tests/
   │   ├── package.json
   │   ├── .eslintrc.json
   │   ├── .env.example
   │   └── ecosystem.config.js
   ├── app/                 ← Flutter (iOS)
   │   ├── lib/
   │   ├── ios/
   │   └── pubspec.yaml
   ├── docs/                ← документация
   │   ├── MASTER.md
   │   ├── STEP-BY-STEP.md
   │   ├── AI-CONTEXT.md
   │   └── prototype-v4_2.jsx
   └── .gitignore
   ```
3. Начальный AI-CONTEXT.md:
   ```markdown
   # AI-CONTEXT — ЧИТАТЕЛЬ
   ## Статус: Фаза 0 — Настройка
   ## Текущая задача: Инициализация проектов
   ## Сделано: ничего (начало)
   ## Стек: Node 20, Express, JS (ES2020+), MongoDB 7, Flutter, StoreKit 2
   ## Файлы в работе: нет
   ## Проблемы: нет
   ```
**Результат:** Монорепо с начальной структурой
**Читать в MASTER:** Секция 7.2 (Структура проекта)
**Проверка:** `git clone`, файлы на месте

### Задача 0.6: Xcode проект Flutter ⏱ 2ч
**Что делаем:** Инициализировать Flutter-проект, настроить iOS-часть
**Действия:**
1. `flutter create --org app.chitatel chitatel_app` (результат помещаем в папку `app/` монорепо)
2. В Xcode → Runner.xcworkspace:
   - Bundle Identifier: `app.chitatel.ios`
   - Team: выбрать Apple Developer аккаунт
   - Minimum Deployments: iOS 16.0
   - Signing & Capabilities → добавить: Push Notifications, Background Modes (Audio), Sign in with Apple, In-App Purchase
3. Info.plist — добавить permission strings (MASTER 6.9)
4. Создать PrivacyInfo.xcprivacy (MASTER 6.8)
5. Сборка и запуск на симуляторе — убедиться что компилируется
**Результат:** Пустое Flutter-приложение запускается на симуляторе с правильным Bundle ID
**Читать в MASTER:** Секции 6.8, 6.9, 6.10, 6.11
**Проверка:** Запуск на симуляторе iPhone 15, нет ошибок signing

---

## ФАЗА 1: СКЕЛЕТ — AUTH + НАВИГАЦИЯ + ДИЗАЙН-СИСТЕМА (3 недели)

### Задача 1.1: Бэкенд — каркас Express + JavaScript (ES2020+) ⏱ 4ч
**Что делаем:** Инициализировать бэкенд-проект
**Действия:**
1. `npm init`, установить зависимости:
   ```bash
   npm i express mongoose dotenv cors helmet bcryptjs jsonwebtoken
   npm i socket.io zod winston
   npm i -D eslint nodemon jest
   ```
2. `.eslintrc.json` — strict rules, ES2020, no-unused-vars, consistent-return
3. Создать файлы:
   ```
   src/
     app.js              ← Express setup (helmet, cors, json parser)
     server.js           ← HTTP + Socket.io server, MongoDB connect
     config/
       index.js          ← env vars (PORT, MONGO_URI, JWT_SECRET, etc.)
     middleware/
       auth.js           ← JWT verify middleware
       validate.js       ← Zod validation middleware
       error.js          ← Global error handler
     models/
       User.js           ← Mongoose schema (MASTER 7.3)
     routes/
       auth.js           ← POST /register, /login, /refresh, /apple, /google
     utils/
       response.js       ← { success, data/error } helper
   ```
4. Подключить MongoDB, проверить что стартует
5. `pm2 start` → проверить что работает на VPS
**Результат:** `GET /api/health` → `{ success: true, data: { status: 'ok' } }`
**Читать в MASTER:** Секции 7.1, 7.2, 7.3 (User schema), 7.5
**Проверка:** `curl https://api.chitatel.app/api/health` → 200 OK

### Задача 1.2: Бэкенд — аутентификация (Email) ⏱ 6ч
**Что делаем:** Email регистрация, вход, refresh токенов
**Файлы:** `src/routes/auth.js`, `src/services/auth.service.js`
**Действия:**
1. `POST /api/auth/register` — email, password, name → создать User, выдать tokens
2. `POST /api/auth/login` — email, password → проверить bcrypt, выдать tokens
3. `POST /api/auth/refresh` — refreshToken → новая пара tokens, старый инвалидировать
4. `POST /api/auth/logout` — инвалидировать refresh token
5. JWT: access 15 мин, refresh 30 дней
6. Zod валидация: email format, password 8-72 символов, name 1-100 символов
7. Rate limiting на auth endpoints: 10/мин с IP
**Результат:** Можно зарегистрироваться, войти, обновить токен
**Читать в MASTER:** Секция 7.4 (Auth endpoints), 7.3 (User schema), 7.5 (коды ошибок AUTH_*), 12.1 (JWT), 12.2 (Rate Limiting)
**Проверка:** Postman — register → login → refresh → access protected route

### Задача 1.3: Бэкенд — Apple Sign In ⏱ 4ч
**Что делаем:** Серверная верификация Apple identity token
**Файлы:** `src/services/apple-auth.service.js`, обновить `src/routes/auth.js`
**Действия:**
1. `npm i apple-signin-auth`
2. `POST /api/auth/apple` — принять identityToken + authorizationCode
3. Верифицировать token через Apple JWKS (public keys)
4. Извлечь: email, sub (Apple user ID), name (только первый раз)
5. Найти/создать User с `appleId: sub`
6. Выдать JWT tokens
7. Обработать: email может быть private relay (xxx@privaterelay.appleid.com)
**Результат:** Apple Sign In работает end-to-end
**Читать в MASTER:** Секция 6.1 (#1), 7.4 (auth/apple)
**Проверка:** Тестирование потребует реальное устройство (задача 1.8)

### Задача 1.4: Бэкенд — Google Sign In ⏱ 3ч
**Что делаем:** Серверная верификация Google ID token
**Файлы:** `src/services/google-auth.service.js`, обновить `src/routes/auth.js`
**Действия:**
1. Создать проект в Google Cloud Console → OAuth 2.0 credentials (iOS client ID)
2. `npm i google-auth-library`
3. `POST /api/auth/google` — принять idToken
4. `client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`
5. Извлечь: email, name, picture
6. Найти/создать User с `googleId`
7. Выдать JWT tokens
**Результат:** Google Sign In работает
**Читать в MASTER:** Секция 7.4 (auth/google)
**Проверка:** Postman с тестовым Google token

### Задача 1.5: Flutter — дизайн-система ⏱ 12ч
**Что делаем:** Перенести ВСЕ визуальные элементы из прототипа в Flutter-код
**Файлы:**
```
lib/
  core/
    theme/
      app_colors.dart      ← ВСЕ цвета из MASTER 5.1
      app_typography.dart   ← ВСЕ текстовые стили из MASTER 5.2
      app_theme.dart        ← ThemeData с нашими цветами и шрифтами
    constants/
      app_spacing.dart      ← Отступы из MASTER 5.3
      app_sizes.dart        ← Размеры кнопок, карточек
  shared/
    widgets/
      app_button.dart       ← Основная кнопка (как в прототипе)
      app_card.dart          ← Карточка книги (2 варианта: горизонт. и верт.)
      app_text_field.dart    ← Input с нашим стилем
      app_bottom_bar.dart    ← Нижняя навигация (4 вкладки + мини-плеер)
      app_top_bar.dart       ← AppBar с нашим стилем (back + title)
      shimmer_loading.dart   ← Скелетон загрузки
      error_view.dart        ← Экран ошибки с retry
      no_connection.dart     ← Экран «Нет сети» (4.38)
```
**Действия:**
1. Открыть прототип (prototype-v4_2.jsx) → извлечь КАЖДЫЙ цвет, шрифт, отступ
2. Создать `app_colors.dart` с ТОЧНЫМИ значениями из MASTER 5.1
3. Создать `app_typography.dart` — все TextStyle (подключить шрифт Onest через pubspec.yaml)
4. Создать каждый виджет, визуально сверяя с прототипом
5. Создать тестовый экран `DesignSystemShowcase` — показывает ВСЕ компоненты
**Результат:** Все базовые виджеты готовы и выглядят как в прототипе
**Читать в MASTER:** Секции 5.1 (Цвета), 5.2 (Шрифты), 5.3 (Отступы), 5.4 (Компоненты)
**Читать прототип:** Все компоненты (Button, Card, BottomBar, TopBar)
**Проверка:** Запустить DesignSystemShowcase → визуально сравнить с прототипом → OK

### Задача 1.6: Flutter — навигация (GoRouter) ⏱ 6ч
**Что делаем:** Настроить все маршруты приложения
**Файлы:** `lib/core/router/app_router.dart`, `lib/core/router/routes.dart`
**Действия:**
1. `flutter pub add go_router flutter_riverpod`
2. Определить маршруты:
   ```dart
   /onboarding          → OnboardingScreen
   /login               → LoginScreen
   /login/email         → EmailLoginScreen
   /register            → RegisterScreen
   /forgot-password     → ForgotPasswordScreen
   /survey              → SurveyScreen (7 шагов)
   /ai-consent          → AiConsentScreen
   /push-consent        → PushConsentScreen
   /                    → ShellRoute (bottom nav):
     /home              → HomeScreen
     /catalog            → CatalogScreen
     /club              → ClubScreen
     /profile           → ProfileScreen
   /diary              → DiaryScreen (из профиля, НЕ таб)
   /book/:id            → BookScreen
   /player/:bookId      → PlayerScreen
   /paywall             → PaywallScreen
   /search              → SearchScreen
   /notifications       → NotificationsScreen
   /edit-profile        → EditProfileScreen (4.46)
   /my-purchases        → MyPurchasesScreen (4.44)
   /my-progress         → MyProgressScreen (4.45)
   /manage-sub          → ManageSubScreen (4.33)
   /delete-account      → DeleteAccountScreen (4.34)
   ```
3. Guard: если нет onboarding_seen → /onboarding
4. Guard: если нет auth token → некоторые маршруты недоступны (club, diary, profile)
5. Bottom navigation: 4 вкладки (Главная, Каталог, Клуб, Профиль)
6. Мини-плеер: persistent widget над bottom bar (позже, при интеграции аудио)
**Результат:** Навигация между пустыми экранами работает
**Читать в MASTER:** Секция 4.47 (структура навигации — маршруты, guards), условные обозначения (🆓 🔐 💎)
**Проверка:** Нажатие на каждую вкладку → правильный экран. Переход /book/1 → экран книги

### Задача 1.7: Flutter — Auth (экраны + API) ⏱ 12ч
**Что делаем:** Экраны входа и подключение к бэкенду
**Файлы:**
```
lib/features/auth/
  screens/
    login_screen.dart         ← 4.2 из MASTER
    email_login_screen.dart   ← 4.3
    email_register_screen.dart ← 4.4
    forgot_password_screen.dart ← 4.5
  providers/
    auth_provider.dart         ← Riverpod: state, login, register, logout
  services/
    auth_service.dart          ← HTTP calls к /api/auth/*
lib/core/
  network/
    api_client.dart            ← Dio с interceptor (JWT refresh)
    api_endpoints.dart         ← Все URL
  storage/
    secure_storage.dart        ← flutter_secure_storage для tokens
```
**Действия:**
1. `flutter pub add dio flutter_secure_storage sign_in_with_apple google_sign_in`
2. Создать Dio клиент с interceptor:
   - Добавлять Authorization header
   - На 401: попробовать refresh → если fail → logout
3. Экран входа (4.2): Apple + Google + Email кнопки
4. Email вход (4.3): email + password + «Забыли пароль?»
5. Регистрация (4.4): name + email + password + повтор пароля
6. Забыли пароль (4.5): email → отправить ссылку
7. Apple Sign In: `sign_in_with_apple` пакет → отправить identityToken на бэкенд
8. Google Sign In: `google_sign_in` → отправить idToken на бэкенд
9. Riverpod AuthProvider: хранит user state (Guest / Authenticated)
**Результат:** Можно зарегистрироваться и войти всеми 3 способами
**Читать в MASTER:** Секции 4.2–4.5 (экраны), 7.4 (endpoints)
**Читать прототип:** LoginScreen, EmailLoginScreen, RegisterScreen
**Проверка:** Регистрация Email → вход → закрыть приложение → открыть → автовход (saved token)

### Задача 1.8: Тестирование на устройстве ⏱ 4ч
**Что делаем:** Проверить на реальном iPhone
**Действия:**
1. Подключить iPhone к Mac → выбрать в Xcode
2. Установить Development Provisioning Profile
3. Собрать и запустить
4. Проверить:
   - Apple Sign In (работает ТОЛЬКО на реальном устройстве)
   - Google Sign In
   - Email auth
   - Навигация
   - Safe area (notch, Dynamic Island, home indicator)
   - Внешний вид компонентов
5. Исправить все проблемы
**Результат:** Приложение работает на реальном iPhone
**Читать в MASTER:** Секция 6.11 (устройства)
**Проверка:** Все 3 способа auth работают, навигация без багов

---

## ФАЗА 2: КОНТЕНТ И АУДИОПЛЕЕР (4 недели)

### Задача 2.1: Бэкенд — модели Book, Package ⏱ 3ч
**Что делаем:** Mongoose-схемы для книг и пакетов
**Файлы:** `src/models/Book.js`, `src/models/Package.js`
**Действия:**
1. Создать Book schema (MASTER 7.3 — полная схема с parts, pricing, isPartOfClub, freeChapterIndex)
2. Создать Package schema (MASTER 7.3)
3. Seed data: 2-3 тестовых книги с реальными аудиофайлами от Анны
**Результат:** Книги есть в БД
**Читать в MASTER:** Секция 7.3 (Book, Package schemas)
**Проверка:** `mongosh → db.books.find()` → данные есть

### Задача 2.2: Бэкенд — API каталога ⏱ 6ч
**Что делаем:** Эндпоинты для получения книг
**Файлы:** `src/routes/books.js`, `src/routes/packages.js`
**Действия:**
1. `GET /api/books` — список всех книг (с пагинацией, фильтрами)
2. `GET /api/books/featured` — рекомендованные для главной
3. `GET /api/books/:id` — детальная информация
4. `GET /api/books/:id/audio/:partNumber` — signed URL для аудио
5. `GET /api/packages` — список пакетов
6. `GET /api/packages/:id` — детали пакета
7. `GET /api/search?q=` — полнотекстовый поиск (MongoDB text index)
**Результат:** API отдаёт книги
**Читать в MASTER:** Секция 7.4 (Books, Packages endpoints), 7.5 (формат ответов + коды ошибок)
**Проверка:** Postman → GET /api/books → JSON с книгами

### Задача 2.3: Бэкенд — аудио стриминг ⏱ 8ч
**Что делаем:** Signed URLs + nginx стриминг
**Файлы:** `src/services/audio.service.js`, `src/middleware/audio-auth.js`, nginx config
**Действия:**
1. Загрузить тестовые MP3 файлы от Анны в `/var/audio/chitatel/`
2. nginx: `location /audio/ { internal; ... }` (MASTER 7.6)
3. Express middleware: генерация HMAC signed URL
4. Express middleware: проверка signed URL перед отдачей файла
5. Поддержка Range headers (для seek в плеере)
6. Прогресс: `POST /api/progress`, `GET /api/progress/:bookId`
**Результат:** Аудиофайлы стримятся через signed URLs
**Читать в MASTER:** Секция 7.6 (Аудио — полная)
**Проверка:** `curl -H "Range: bytes=0-1000" <signed_url>` → 206 Partial Content

### Задача 2.4: Flutter — главная страница ⏱ 8ч
**Что делаем:** Экран «Главная» с реальными данными
**Файлы:** `lib/features/home/screens/home_screen.dart`, providers, widgets
**Действия:**
1. Подключить API: GET /api/books/featured
2. Секция «Новинки» — горизонтальный скролл карточек книг
3. Секция «Разборы клуба» — вертикальный список
4. Секция «Пакеты» — карточки пакетов
5. Pull-to-refresh
6. Skeleton loading пока грузится
7. Tap на книгу → переход на /book/:id
**Результат:** Главная показывает реальные книги с сервера
**Читать в MASTER:** Секция 4.9 (Главная), 7.4 (endpoint GET /api/home)
**Читать прототип:** HomeScreen component
**Проверка:** Запуск → видны книги → нажатие → переход

### Задача 2.5: Flutter — каталог + поиск ⏱ 8ч
**Что делаем:** Экраны каталога и поиска
**Файлы:** `lib/features/catalog/`, `lib/features/search/`
**Действия:**
1. Каталог: сетка карточек книг, фильтры (категория, тип)
2. Поиск: текстовое поле + результаты в реальном времени (debounce 300ms)
3. Pull-to-refresh, pagination
**Результат:** Все книги отображаются, поиск работает
**Читать в MASTER:** Секции 4.10 (Каталог), 4.11 (Поиск)
**Проверка:** Ввести название → книга найдена

### Задача 2.6: Flutter — экран книги ⏱ 8ч
**Что делаем:** Детальный экран книги (бесплатная / платная / купленная)
**Файлы:** `lib/features/book/screens/book_screen.dart`
**Действия:**
1. 3 варианта отображения (MASTER 4.12, 4.13, 4.14):
   - Бесплатная: обложка, описание, кнопка «Слушать»
   - Платная: + цена, кнопка «Купить»
   - Купленная: + кнопка «Продолжить» с позицией
2. Список частей с длительностью
3. Отзывы/рейтинг (post-MVP — пока placeholder)
**Результат:** Экран книги отображает все данные
**Читать в MASTER:** Секции 4.12–4.14
**Проверка:** Открыть бесплатную → «Слушать». Открыть платную → «Купить» + цена

### Задача 2.7: Flutter — аудиоплеер (СЛОЖНАЯ) ⏱ 40ч
**Что делаем:** Полноценный аудиоплеер с background audio
**Файлы:**
```
lib/features/player/
  screens/player_screen.dart       ← Развёрнутый плеер (4.15)
  widgets/mini_player.dart         ← Мини-плеер (4.16)
  widgets/speed_sheet.dart         ← Шторка скорости (4.18)
  widgets/sleep_timer_sheet.dart   ← Шторка таймера сна (4.19)
  widgets/quote_sheet.dart         ← Шторка новой цитаты (4.17)
  providers/player_provider.dart   ← Riverpod state
  services/audio_service.dart      ← just_audio + audio_service
```
**Действия:**
1. `flutter pub add just_audio audio_service audio_session`
2. AudioHandler — управление воспроизведением:
   - Play, pause, seek, skip 15s forward/back
   - Lock screen controls (MediaSession)
   - Background playback (UIBackgroundModes audio)
3. Развёрнутый плеер (4.15): обложка, progress bar, кнопки, скорость, таймер
4. Мини-плеер (4.16): persistent виджет внизу экрана
5. Шторка скорости (4.18): 0.75x, 1.0x, 1.25x, 1.5x, 2.0x
6. Шторка таймера сна (4.19): 15, 30, 45, 60 мин, конец главы
7. Шторка цитаты (4.17): текстовое поле + «Сохранить» → POST /api/quotes
8. Прогресс: сохранять каждые 30 секунд, восстанавливать при открытии
9. Переключение частей: автоматически при окончании текущей
**Результат:** Полноценный плеер как в прототипе
**Читать в MASTER:** Секции 4.15–4.19, 7.6
**Читать прототип:** PlayerScreen, MiniPlayer, SpeedSheet, SleepTimerSheet
**Проверка:**
- [ ] Воспроизведение стримится (не скачивается)
- [ ] Background play: заблокировать экран → музыка играет
- [ ] Lock screen: controls видны, прогресс обновляется
- [ ] Seek: перемотка работает
- [ ] Скорость: 2x работает
- [ ] Таймер сна: останавливается через N минут
- [ ] Мини-плеер видим на других экранах
- [ ] Цитата: сохраняется с timestamp

---

## ФАЗА 3: ПЛАТЕЖИ (3 недели)

### Задача 3.1: App Store Connect — продукты ⏱ 3ч
**Что делаем:** Создать IAP продукты в App Store Connect
**Действия:**
1. App Store Connect → My Apps → создать приложение «ЧИТАТЕЛЬ»
2. Subscriptions → Create Subscription Group «Клуб ЧИТАТЕЛЬ»
3. Создать 6 подписок (MASTER 6.3):
   - club.basic.monthly, club.basic.semiannual, club.basic.annual
   - club.premium.monthly, club.premium.semiannual, club.premium.annual
4. Уровни: Premium = Level 1, Basic = Level 2
5. Grace Period: включить (6 дней для annual, 3 для monthly)
6. Non-consumables: пока не создаём (нужны конкретные book_id)
7. Sandbox Test Accounts: создать 2-3 тестовых аккаунта
**Результат:** Продукты созданы, Sandbox тестирование доступно
**Читать в MASTER:** Секция 6.3 (StoreKit 2 — полная), 6.7 (комиссия Apple 15/30%)
**Проверка:** Products видны в App Store Connect, Sandbox аккаунт создан

### Задача 3.2: Flutter — StoreKit 2 покупки ⏱ 16ч
**Что делаем:** IAP логика в приложении
**Файлы:**
```
lib/features/payments/
  services/purchase_service.dart     ← StoreKit 2 через in_app_purchase
  providers/purchase_provider.dart   ← Riverpod state
  screens/paywall_screen.dart        ← 4.28 из MASTER
  screens/success_screen.dart        ← 4.29
  widgets/subscription_card.dart     ← Карточка тарифа
```
**Действия:**
1. `flutter pub add in_app_purchase`
2. Загрузить продукты из Store
3. Paywall экран (4.28): 3 тарифа, выбор периода, юридический текст
4. Инициировать покупку → получить Transaction
5. Отправить JWS на бэкенд → POST /api/purchases/verify
6. Обработать результат: success → экран успеха (4.29)
7. Restore purchases: кнопка на paywall
8. Отслеживать `Transaction.updates` для обновлений подписки
**Результат:** Покупка через Sandbox работает
**Читать в MASTER:** Секции 4.28–4.29, 4.37 (подписка истекла), 6.3 (StoreKit 2), 6.1 (#5–7 — правила подписок Apple)
**Проверка:** Sandbox аккаунт → покупка → верификация → доступ появился

### Задача 3.3: Бэкенд — верификация покупок ⏱ 8ч
**Что делаем:** Серверная проверка покупок Apple
**Файлы:** `src/routes/purchases.js`, `src/services/purchase.service.js`, `src/models/Purchase.js`
**Действия:**
1. `npm i @apple/app-store-server-library`
2. `POST /api/purchases/verify` — принять JWS transaction
3. Верифицировать подпись через Apple App Store Server Library
4. Сохранить Purchase в MongoDB
5. Обновить User: subscription_status, subscription_tier, subscription_expires_at
6. Вернуть обновлённый профиль пользователя
**Результат:** Покупка верифицируется на сервере
**Читать в MASTER:** Секция 7.4 (purchases endpoints), 7.3 (Purchase, User schemas), 7.5 (коды ошибок PURCHASE_*)
**Проверка:** Postman с реальным JWS → purchase создан, user обновлён

### Задача 3.4: Бэкенд — S2S Notifications V2 ⏱ 6ч
**Что делаем:** Webhook для уведомлений от Apple
**Файлы:** `src/routes/webhooks.js`, `src/services/webhook.service.js`
**Действия:**
1. `POST /api/webhooks/apple` — принять signed notification от Apple
2. Верифицировать подпись
3. Обработать типы уведомлений:
   - `DID_RENEW` → продлить подписку
   - `EXPIRED` → отключить доступ
   - `DID_CHANGE_RENEWAL_INFO` → upgrade/downgrade
   - `GRACE_PERIOD_EXPIRED` → отключить доступ
   - `REFUND` → отозвать доступ
   - `DID_FAIL_TO_RENEW` → billing retry (grace period)
4. Зарегистрировать URL в App Store Connect → App → App Information → Server-to-Server Notification URL
**Результат:** Подписки автоматически обновляются/отменяются
**Читать в MASTER:** Секция 6.3 (S2S Notifications, Grace Period, Upgrade/Downgrade)
**Проверка:** В Sandbox: отменить подписку → S2S notification → статус обновлён

---

## ФАЗА 4: КЛУБ (3 недели)

### Задача 4.1: Бэкенд — модели Club, Chat, Q&A ⏱ 4ч
**Что делаем:** Mongoose-схемы для клуба
**Файлы:** `src/models/ClubMonth.js`, `src/models/ChatMessage.js`, `src/models/QAQuestion.js`
**Действия:**
1. ClubMonth schema: title, bookId, month (YYYY-MM), schedule[], isActive
2. ChatMessage schema: userId, clubMonthId, text, imageUrl?, replyToId?, createdAt
3. QAQuestion schema: userId, clubMonthId, questionText, answerText?, answeredAt?, isPublished
4. Индексы: ChatMessage — `{ clubMonthId: 1, createdAt: -1 }`, QAQuestion — `{ clubMonthId: 1 }`
5. Seed: создать ClubMonth для марта 2026 со ссылкой на книгу «Тревожные люди»
**Читать в MASTER:** Секция 7.3 (схемы)
**Проверка:** `mongosh → db.clubmonths.findOne()` → данные есть
**Результат:** Коллекции созданы, тестовый клуб месяца в БД

### Задача 4.2: Бэкенд — API клуба (REST) ⏱ 6ч
**Что делаем:** REST endpoints для клуба
**Файлы:** `src/routes/club.js`, `src/middleware/subscription.js`
**Действия:**
1. Middleware `requireSubscription` — проверить `user.subscriptionStatus === 'active'`
2. `GET /api/club/current` → текущий ClubMonth + book + schedule (💎)
3. `GET /api/club/chat?before=&limit=20` → сообщения с пагинацией (cursor-based)
4. `POST /api/club/chat/:id/report` → `{ reason }` → создать Report + уведомить модератора
5. `GET /api/club/qa` → вопросы с ответами
6. `POST /api/club/qa` → задать вопрос (лимит: 3 в неделю на юзера)
7. `POST /api/users/:id/block` → добавить в blockedUsers[], фильтровать сообщения
8. `DELETE /api/users/:id/block` → разблокировать
**Читать в MASTER:** Секция 7.4 (Клуб endpoints), 7.5 (коды ошибок)
**Проверка:** Postman → GET /api/club/current с subscription token → 200. Без подписки → 403 SUBSCRIPTION_REQUIRED

### Задача 4.3: Бэкенд — Socket.io чат ⏱ 8ч
**Что делаем:** Real-time чат через WebSocket
**Файлы:** `src/socket/index.js`, `src/socket/chat-handler.js`, `src/socket/auth-middleware.js`
**Действия:**
1. Socket.io инициализация в `server.js` (рядом с Express)
2. Auth middleware: при подключении проверить JWT из `socket.handshake.auth.token`
3. При подключении: присоединить к room `club:{clubMonthId}`
4. События:
   - Client → Server: `chat:send` `{ text, replyToId? }` → сохранить в MongoDB → emit `chat:new` всем в room
   - Client → Server: `chat:typing` → broadcast `chat:user_typing` (debounce 2 сек)
   - Server → Client: `chat:new` `{ message }` — новое сообщение
   - Server → Client: `chat:user_typing` `{ userId, name }` — кто-то печатает
5. Фильтрация: не отправлять сообщения от заблокированных юзеров
6. Rate limit: 1 сообщение в 3 секунды (anti-spam)
7. Reconnection: `socket.io-client` автоматически, показать индикатор «Переподключение...»
**Читать в MASTER:** Секция 7.8 (Socket.io — полная), 12.2 (rate limiting — обязательно для чата), 6.1 (#3 — Apple UGC requirements)
**Проверка:** 2 окна браузера → socket.io client → отправить сообщение → появляется в обоих < 500ms

### Задача 4.4: Бэкенд — Q&A + Report + Moderation ⏱ 4ч
**Что делаем:** Q&A с модерацией + система жалоб
**Файлы:** `src/routes/qa.js`, `src/models/Report.js`, `src/routes/reports.js`
**Действия:**
1. Report schema: `{ reporterId, targetType: 'message'|'user', targetId, reason, status: 'pending'|'resolved' }`
2. POST /api/club/qa — задать вопрос (макс 500 символов, макс 3 в неделю)
3. POST /api/admin/questions/:id/answer — ответ Анны
4. POST /api/club/chat/:id/report — `{ reason: 'spam'|'offensive'|'copyright'|'other' }`
5. Apple UGC requirement 1.2: report mechanism ✅, block users ✅, 24hr response → через админку
**Читать в MASTER:** Секции 4.35–4.36, 7.4 (endpoints Q&A, reports), 6.1 (#3 — UGC)
**Проверка:** Вопрос задан → Анна ответила через админку → ответ виден. Жалоба создана → видна в админке

### Задача 4.5: Flutter — экраны клуба ⏱ 16ч
**Что делаем:** 4 экрана клуба + report/block
**Файлы:**
```
lib/features/club/
  screens/club_screen.dart          ← 4.20 + TabBar для подтабов
  screens/club_episodes_tab.dart    ← 4.21 Разборы
  screens/club_chat_tab.dart        ← 4.22 Чат (Socket.io)
  screens/club_qa_tab.dart          ← 4.23 Q&A
  providers/club_provider.dart
  providers/chat_provider.dart      ← Socket.io state
  widgets/chat_message_widget.dart
  widgets/chat_input.dart
  widgets/qa_question_card.dart
  widgets/report_sheet.dart         ← 4.36 шторка жалобы
```
**Действия:**
1. Клуб главная (4.20): заголовок «Клуб [Месяц]», обложка книги, 3 вкладки
2. Разборы (4.21): список частей разбора текущего месяца (как в плейлисте)
3. Чат (4.22): `socket_io_client` → список сообщений + input + typing indicator
   - Long press на сообщение → «Ответить» / «Пожаловаться»
   - Сообщения заблокированных юзеров скрыты
   - Auto-scroll к новым сообщениям
4. Q&A (4.23): список вопросов-ответов. Кнопка «Задать вопрос» (если < 3 за неделю)
5. Report sheet (4.36): bottom sheet с 6 причинами + toggle «Заблокировать пользователя»
6. Для неподписчиков: blur + overlay «Вступите в клуб» → paywall
**Читать в MASTER:** Секции 4.20–4.23, 4.35–4.36, 6.1 (#3 — Apple UGC: report + block + 24ч модерация)
**Читать прототип:** ClubScreen, ChatTab, ClubTab components
**Проверка:**
- [ ] Чат: сообщение → появляется у другого юзера в реальном времени
- [ ] Typing indicator показывается
- [ ] Report + Block → сообщения скрыты
- [ ] Q&A → вопрос задан → лимит 3/неделя работает
- [ ] Без подписки → paywall

---

## ФАЗА 5: ИИ + ДНЕВНИК (2 недели)

### Задача 5.1: Бэкенд — OpenAI интеграция ⏱ 8ч
**Что делаем:** Сервис анализа цитат + еженедельный отчёт
**Файлы:** `src/services/ai.service.js`, `src/config/ai-prompts.js`, `src/jobs/weekly-report.js`
**Действия:**
1. `npm i openai`
2. `ai.service.js`:
   - `analyzeQuote(quote, user)` → OpenAI gpt-4o-mini → `{ resonance, context, question }`
   - **ОБЯЗАТЕЛЬНЫЙ GUARD:** `if (!user.aiConsentGiven) throw new AppError('AI_CONSENT_REQUIRED', 403)`
   - Apple 5.1.2(i): никакие данные НЕ уходят в OpenAI без `aiConsentGiven === true`
   - Retry: 3 попытки с exponential backoff (1s, 3s, 9s)
   - Таймаут: 30 секунд
   - Fallback при ошибке: установить `quote.aiStatus = 'failed'`, уведомить юзера
3. `ai-prompts.js`: system prompt из MASTER 7.7 (дословно), temperature 0.7, max_tokens 500
4. Очередь: при POST /api/quotes → если aiConsent → добавить в Bull queue → worker обработает
   - `npm i bull` (Redis-based queue) или простой `setTimeout` для MVP
5. `weekly-report.js`: cron воскресенье 10:00 → собрать цитаты за неделю → сгенерировать отчёт
   - Отправлять ТОЛЬКО если ≥ 3 цитаты за неделю
6. PATCH `/api/profile/ai-consent` → `{ consent: true/false }` → обновить user
**Читать в MASTER:** Секция 7.7 (полная, с промптами), 7.5 (коды ошибок: AI_CONSENT_REQUIRED, AI_ANALYSIS_FAILED, AI_ANALYSIS_PENDING), 4.7 (AI consent), 6.1 (#13 — AI disclosure)
**Проверка:** Сохранить цитату с aiConsent=true → через 5-10 сек → quote.aiAnalysis заполнен. Без consent → 403

### Задача 5.2: Бэкенд — API дневника ⏱ 4ч
**Что делаем:** CRUD для цитат + еженедельный отчёт
**Файлы:** `src/routes/quotes.js`, `src/routes/reports.js`
**Действия:**
1. POST /api/quotes — `{ text, author, bookTitle, bookId?, audioTimestamp? }` → сохранить + запустить AI
2. GET /api/quotes — `?page=&limit=&bookId=` → список с пагинацией (новые сверху)
3. GET /api/quotes/:id — одна цитата с анализом
4. DELETE /api/quotes/:id — удалить свою цитату
5. GET /api/reports/weekly/latest — последний отчёт
6. GET /api/reports/weekly?week=&year= — конкретный отчёт
7. Лимит: 50 цитат в день (anti-spam → QUOTE_LIMIT_REACHED)
**Читать в MASTER:** Секция 7.4 (Дневник endpoints), 7.5 (ошибки)
**Проверка:** POST quote → GET quote → aiAnalysis есть (или aiStatus: 'pending')

### Задача 5.3: Flutter — дневник + анализ + AI consent ⏱ 16ч
**Что делаем:** 4 экрана дневника + AI consent flow
**Файлы:**
```
lib/features/diary/
  screens/diary_screen.dart           ← 4.24
  screens/analysis_screen.dart        ← 4.25
  screens/weekly_report_screen.dart   ← 4.26
  providers/diary_provider.dart
  providers/ai_consent_provider.dart
  widgets/quote_card.dart
  widgets/analysis_card.dart
lib/features/auth/
  screens/ai_consent_screen.dart      ← 4.7 (онбординг)
lib/shared/widgets/
  ai_consent_modal.dart               ← 4.42 (модалка из профиля)
```
**Действия:**
1. AI Consent экран (4.7): 4 пункта про OpenAI + чекбокс «Согласна» + «Не сейчас»
   - При согласии → PATCH /api/profile/ai-consent `{ consent: true }` → далее по онбордингу
   - «Не сейчас» → пропустить, можно включить потом в профиле
2. AI Consent модалка (4.42): тот же текст, из профиля → toggle «ИИ-анализ»
3. Дневник (4.24): пустое состояние / список цитат / фильтр по книге / streak
4. Экран анализа (4.25): цитата + 3 блока (resonance, context, question) + кнопка «Поделиться»
5. Еженедельный отчёт (4.26): тема недели + инсайт + рекомендация + «Поделиться»
6. FAB (плавающая кнопка) → открывает шторку новой цитаты (4.17)
7. Шторка цитаты (4.17): поле текста + автор + книга (autocomplete из прослушанных) + «Сохранить»
**Читать в MASTER:** Секции 4.7, 4.17, 4.24–4.26, 4.42
**Читать прототип:** DiaryScreen, AiAnalysisScreen, WeeklyReportScreen, QuoteSheet, ConsentScreen
**Проверка:**
- [ ] Без AI consent → при сохранении цитаты → анализ НЕ запускается
- [ ] С consent → сохранить → через 10 сек → анализ появился
- [ ] Отключить consent в профиле → новые цитаты без анализа
- [ ] Еженедельный отчёт отображается (если ≥ 3 цитат)

---

## ФАЗА 6: ПОЛИРОВКА (3 недели)

### Задача 6.1: Push-уведомления ⏱ 10ч
**Что делаем:** APNs интеграция + 7 типов уведомлений
**Файлы:**
```
src/services/push.service.js        ← Серверная отправка
src/jobs/push-scheduler.js          ← Cron-задачи
lib/core/services/push_service.dart ← Flutter приёмник
```
**Действия (бэкенд):**
1. `npm i apn firebase-admin`
2. APNs: подключение через .p8 ключ (задача 0.2)
3. `push.service.js` — универсальная функция `sendPush(userId, { title, body, data })`
4. 7 типов уведомлений (MASTER 7.9):
   - Мысль дня → cron 8:00 (персонализированное время из опроса)
   - Новый аудиоразбор → event при публикации
   - #цитатадня → cron вт/пт 12:00
   - Напоминание: цитата → cron 4 раза/неделя 20:00
   - ИИ-анализ готов → event при завершении анализа
   - Еженедельный отчёт → cron вс 10:00
   - Ответ в чате / Q&A → event
5. Уважать настройки: проверять `user.pushSettings.*` перед отправкой
**Действия (Flutter):**
1. `flutter pub add firebase_messaging firebase_core`
2. Запрос разрешения (4.8) — после онбординга
3. `onMessage` → показать in-app banner
4. `onMessageOpenedApp` → навигация к нужному экрану (deep link)
5. Регистрация token → POST /api/notifications/register
**Читать в MASTER:** Секция 7.9 (Push — полная), 6.9 (Info.plist permission strings — без них crash), 4.8 (экран разрешения), 4.30 (уведомления)
**Проверка:** Отправить тестовый push → приходит на устройство → нажатие → открывает нужный экран

### Задача 6.2: Профиль + подэкраны ⏱ 12ч
**Что делаем:** 7 экранов профильной зоны
**Файлы:**
```
lib/features/profile/
  screens/profile_screen.dart              ← 4.27
  screens/edit_profile_screen.dart         ← 4.46
  screens/my_purchases_screen.dart         ← 4.44
  screens/my_progress_screen.dart          ← 4.45
  screens/manage_sub_screen.dart           ← 4.33
  screens/notification_settings_screen.dart ← 4.31
  screens/support_screen.dart              ← 4.40
  screens/referral_screen.dart             ← 4.41
  screens/delete_account_screen.dart       ← 4.34
  providers/profile_provider.dart
```
**Действия:**
1. Профиль (4.27): аватар + меню + toggle AI + «Выйти» + «Удалить аккаунт»
2. Редактирование профиля (4.46): аватар (камера/галерея) + имя + email (readonly для Apple/Google)
3. Мои покупки (4.44): GET /api/purchases/history → список карточек
4. Мой прогресс (4.45): GET /api/progress/stats → графики + streak + цель
5. Управление подпиской (4.33): план, цена, следующее списание, «Как отменить»
6. Настройки уведомлений (4.31): 11 toggles по категориям (MASTER 4.31)
7. Поддержка (4.40): FAQ + email + Telegram ссылка
8. Реферал (4.41): ссылка + Share Sheet + статистика
9. Удаление аккаунта (4.34): предупреждения + ввод «УДАЛИТЬ» + DELETE /api/auth/account
**Читать в MASTER:** Секции 4.27, 4.31, 4.33, 4.34, 4.40, 4.41, 4.44–4.46
**Проверка:** Все 7 экранов открываются из профиля. Редактирование сохраняется. Удаление работает.

### Задача 6.3: Онбординг + опрос ⏱ 8ч
**Что делаем:** Первый запуск приложения
**Файлы:**
```
lib/features/onboarding/
  screens/onboarding_screen.dart      ← 4.1 (3 слайда)
  screens/survey_screen.dart          ← 4.6 (7 вопросов)
  screens/push_permission_screen.dart ← 4.8
  providers/onboarding_provider.dart
```
**Действия:**
1. Онбординг (4.1): 3 слайда с PageView + индикатор + «Далее» / «Начать»
2. После онбординга → экран входа (4.2) — уже сделан в Фазе 1
3. Опрос (4.6): 7 вопросов из MASTER 4.6 (точные тексты!) → POST /api/profile/survey
4. AI Consent (4.7): уже сделан в Фазе 5
5. Push Permission (4.8): список типов уведомлений + «Разрешить» → системный диалог iOS
6. Purchase success (4.29): если купил подписку → «Добро пожаловать!» + «Начать слушать»
7. Guard в GoRouter: `onboardingSeen` в SharedPreferences → пропустить если видел
**Читать в MASTER:** Секции 4.1, 4.6, 4.8, 4.29
**Читать прототип:** OnboardingSlides, SurveyScreen, PushPermission
**Проверка:** Чистая установка → онбординг → auth → опрос → AI consent → push → главная

### Задача 6.4: Accessibility ⏱ 4ч
**Что делаем:** VoiceOver, Dynamic Type, contrast
**Действия:**
1. Semantics labels на ВСЕХ кнопках, изображениях, иконках
2. `excludeSemantics: true` на декоративных элементах
3. Проверить Dynamic Type: увеличить размер шрифта в Accessibility → UI не ломается
4. Контраст: все тексты на цветных фонах ≥ 4.5:1 ratio
5. Tap targets: все кнопки минимум 44×44pt (Apple HIG)
**Читать в MASTER:** Секция 6.1 (#10–11), 6.2.1
**Проверка:** Включить VoiceOver → пройти весь flow от онбординга до дневника → все элементы озвучиваются

### Задача 6.5: Error states + edge cases ⏱ 8ч
**Что делаем:** Все сценарии ошибок из MASTER 11
**Действия:**
1. Сеть пропала во время загрузки → показать cached данные + banner «Офлайн»
2. Покупка прервана → восстановить state, НЕ оставлять loading spinner
3. OpenAI timeout → показать «Анализ временно недоступен» + retry кнопка
4. Аудио URL истёк → автоматически запросить новый (прозрачно для юзера)
5. Token expired → автоматический refresh (interceptor в Dio — уже в Фазе 1)
6. Push token обновился → автоматическая перерегистрация
7. Apple Sign In отозван → при следующем запросе → экран входа
8. Первый запуск без сети → экран 4.38 (без онбординга)
9. Подписка истекла → экран 4.37 при входе
10. Deep link → если не авторизован → auth → redirect к контенту
**Читать в MASTER:** Секция 11 (все подсекции — сценарии ошибок), 7.5 (коды ошибок — полный каталог)
**Проверка:** Включить Airplane mode → пройти по всем экранам → ни один не крэшнулся

### Задача 6.6: Админ-панель Анны ⏱ 20ч
**Что делаем:** Минимальная веб-панель для управления контентом
**Файлы:** `server/admin/` (папка внутри server/ в монорепо)
**Действия:**
1. React + Vite + TailwindCSS (простейший стек)
2. Авторизация: email + password → JWT (роль `admin` в User schema)
3. Экраны:
   - **Дашборд:** юзеры (total/active/premium), прослушиваний за неделю, новых цитат
   - **Книги:** CRUD — название, описание, обложка, аудио-файлы, категория, pricing
   - **Клуб месяца:** создать/редактировать, привязать книгу, расписание
   - **Q&A:** список вопросов → текстовое поле для ответа → «Опубликовать»
   - **Чат модерация:** жалобы (список) → удалить сообщение / mute юзера / dismiss
   - **Push:** отправить кастомное уведомление всем/подписчикам
4. Upload аудио: multipart → сохранить в `/var/audio/chitatel/`
5. Upload обложки: multipart → resize 600×800, WebP → `/var/covers/`
6. Deploy: `admin.chitatel.app` через nginx → build папка React
**Читать в MASTER:** Секция 9 (Админ-панель — полная)
**Проверка:** Анна может: добавить книгу + загрузить аудио + ответить на Q&A + удалить сообщение чата

### Задача 6.7: Финальная визуальная проверка ⏱ 6ч
**Что делаем:** Pixel-по-прототипу сверка всех экранов
**Действия:**
1. Открыть прототип в браузере (prototype-v4_2.jsx)
2. Открыть каждый экран приложения на устройстве
3. Сравнить: отступы, цвета, размеры шрифтов, порядок элементов
4. Проверить оба состояния (новый юзер / активный)
5. Проверить тёмный текст на светлом фоне (нет серых-на-сером)
6. Проверить safe area на iPhone с Dynamic Island и на SE
**Читать прототип:** Все компоненты
**Проверка:** Каждый экран визуально соответствует прототипу (±10% допустимо)

### Задача 6.8: Seed data + демо-аккаунт ⏱ 3ч
**Что делаем:** Скрипт наполнения тестовыми данными
**Файлы:** `src/scripts/seed.js`
**Действия:**
1. Создать seed из MASTER 7.10 (3 книги, 1 пакет, демо-аккаунт)
2. Демо-аккаунт `reviewer@chitatel.app` с активной premium подпиской
3. Предзаполнить: 5 цитат с анализами, прогресс 180 мин, streak 7 дней
4. `npm run seed` — идемпотентный (можно запускать повторно)
**Читать в MASTER:** Секция 7.10 (Seed Data)
**Проверка:** `npm run seed` → войти как reviewer → все экраны с данными

---

## ФАЗА 7: TESTFLIGHT И APP STORE (2-3 недели)

### Задача 7.1: Подготовка метаданных ⏱ 6ч
**Что делаем:** Все данные для App Store Connect
**Действия:**
1. Скриншоты: 6.7" (iPhone 15 Pro Max) + 6.1" (iPhone 15) — минимум 3 каждого размера
   - Рекомендуемые экраны: Главная, Плеер, Дневник с анализом, Клуб чат
2. Описание на русском (до 4000 символов) — что это, для кого, что внутри
3. Keywords (100 символов): книжный клуб, аудиоразборы, психология, саморазвитие, цитаты, дневник
4. What's New: «Первая версия»
5. Privacy Policy URL: `https://chitatel.app/privacy` — ПРОВЕРИТЬ что открывается
6. Support URL: `https://chitatel.app/support` — ПРОВЕРИТЬ что открывается
7. Review Notes (для ревьюера Apple):
   ```
   Demo account: reviewer@chitatel.app / ChitatelReview2026!
   This account has an active premium subscription.
   AI feature: uses OpenAI API for quote analysis. Users must give explicit consent before any data is sent to OpenAI (screen 4.7).
   UGC: Club chat with report and block functionality.
   ```
8. Age Rating questionnaire — ответить на ВСЕ вопросы (MASTER 6.12)
9. Категория: Books (основная), Education (дополнительная)
**Читать в MASTER:** Секции 6.5, 6.12

### Задача 7.2: Privacy Manifest + Info.plist ⏱ 2ч
**Что делаем:** Финальная проверка Apple privacy requirements
**Действия:**
1. PrivacyInfo.xcprivacy — все API reasons заполнены (MASTER 6.8)
2. Info.plist — все permission strings на русском (MASTER 6.9)
3. App Privacy questionnaire в App Store Connect (MASTER 6.4) — какие данные собираем:
   - Name ✅, Email ✅, User Content (quotes) ✅, Usage Data ✅
4. Проверить третьи стороны: OpenAI (disclosed), Firebase (analytics)
**Читать в MASTER:** Секции 6.4, 6.8, 6.9
**Проверка:** Xcode → Build → нет warnings про Privacy Manifest

### Задача 7.3: Pre-Submit Checklist ⏱ 4ч
**Что делаем:** Финальная проверка ВСЕГО перед сабмитом

**🔴 КРИТИЧЕСКИЕ (rejection без них):**
- [ ] Приложение НЕ крэшится при запуске на чистом устройстве
- [ ] Приложение НЕ крэшится при первом запуске без сети → показывает 4.38
- [ ] Apple Sign In работает (первая кнопка на экране входа)
- [ ] Demo account (`reviewer@chitatel.app`) работает, подписка активна
- [ ] Restore Purchases кнопка на paywall → восстанавливает покупки
- [ ] Account Deletion работает полностью (4.34)
- [ ] Privacy Policy URL открывается из приложения И из App Store
- [ ] Support URL открывается
- [ ] Юридический текст на paywall: цена, период, автопродление, как отменить
- [ ] Ссылки на Terms и Privacy на paywall
- [ ] PrivacyInfo.xcprivacy заполнен
- [ ] Info.plist: все permission strings
- [ ] Нет placeholder контента, Lorem ipsum, test data
- [ ] Нет слов «beta», «demo», «test» в UI
- [ ] AI disclosure: OpenAI назван, explicit opt-in ПЕРЕД первой отправкой

**🟡 ВАЖНЫЕ (могут отклонить):**
- [ ] Все ссылки в приложении работают (ни одна не ведёт в 404)
- [ ] Background audio: работает при заблокированном экране
- [ ] Lock screen controls отображаются при воспроизведении
- [ ] Report + Block в чате работают
- [ ] UGC модерация: жалобы видны в админке
- [ ] Нет кнопок/ссылок на внешние платёжные системы
- [ ] Скриншоты соответствуют реальному приложению
- [ ] Age Rating анкета заполнена
- [ ] Приложение работает на iPhone SE (маленький экран)
- [ ] Приложение работает на iPhone 15 Pro Max (большой экран)

**🟢 РЕКОМЕНДУЕМЫЕ:**
- [ ] VoiceOver проходит основной flow
- [ ] Dynamic Type: крупный шрифт не ломает layout
- [ ] Pull-to-refresh на всех списках
- [ ] Empty states на всех экранах (нет пустых белых страниц)
- [ ] Skeleton loading при первой загрузке
- [ ] Нет memory leaks (Instruments → Leaks)
- [ ] App size < 200MB

### Задача 7.4: TestFlight Internal ⏱ 3ч
**Действия:**
1. Xcode → Product → Archive → Distribute → App Store Connect
2. ⚠️ **С 28 апреля 2026**: apps должны быть собраны с iOS 26 SDK
3. App Store Connect → TestFlight → Internal Testing
4. Пригласить 5-10 тестеров (включая Анну)
5. Тестировать 1 неделю минимум
6. Собрать crash reports из Xcode Organizer
7. Исправить все crashes и critical bugs

### Задача 7.5: Submit for Review ⏱ 2ч
**Действия:**
1. Пройти Pre-Submit Checklist (задача 7.3) — ВСЁ зелёное
2. App Store Connect → добавить build
3. Заполнить все метаданные (задача 7.1)
4. Submit for Review
5. Ожидание: 24-72 часа (обычно 24-48ч)
6. Если rejection → прочитать причину → исправить → resubmit
   - Частые причины: demo account не работает, Restore Purchases не найден, broken links

---

## ЗАВИСИМОСТИ МЕЖДУ ЗАДАЧАМИ

```
0.1 → 0.2 → 0.6 (Apple аккаунт → сертификаты → Xcode)
0.3 → 0.4 → 1.1 (VPS → домен → бэкенд)
0.5 (независимая)
1.1 → 1.2 → 1.3, 1.4 (каркас → auth → Apple/Google)
1.5 (независимая, можно параллельно с 1.1-1.4)
1.6 → 1.7 (навигация → auth экраны)
1.5 + 1.7 → 1.8 (дизайн + auth → тест на устройстве)
2.1 → 2.2 → 2.3 (модели → API → аудио)
2.4, 2.5, 2.6 зависят от 2.2
2.7 зависит от 2.3
3.1 зависит от 0.2 (App Store Connect)
3.2 зависит от 3.1
3.3, 3.4 можно параллельно с 3.2
4.1 → 4.2 → 4.3 (модели → Socket.io → Q&A)
4.5 зависит от 4.2 + 4.3 (Flutter клуб от бэкенда)
5.1 → 5.2 → 5.3 (OpenAI → API дневника → Flutter дневник)
Фаза 6: 6.1–6.5 параллельно, 6.6 (админка) параллельно, 6.7 после всех
Фаза 7: строго последовательно
```

---

## СВОДКА ПО ВРЕМЕНИ

| Фаза | Задачи | Часов | Календарно |
|------|--------|-------|------------|
| 0. Инфраструктура | 0.1–0.6 | 11ч | 1 неделя |
| 1. Скелет (Auth + Nav + Design) | 1.1–1.8 | 51ч | 3 недели |
| 2. Контент + Плеер | 2.1–2.7 | 81ч | 4 недели |
| 3. Платежи | 3.1–3.4 | 33ч | 2-3 недели |
| 4. Клуб | 4.1–4.5 | 38ч | 2-3 недели |
| 5. ИИ + Дневник | 5.1–5.3 | 28ч | 2 недели |
| 6. Полировка | 6.1–6.8 | 71ч | 3 недели |
| 7. TestFlight + App Store | 7.1–7.5 | 17ч | 2 недели |
| **ИТОГО** | **46 задач** | **~330ч** | **~18-20 недель** |

> ⚠️ 330 часов — это чистое время кода. С учётом отладки, code review, ожидания от Анны — реально 5-6 месяцев.

---

## ЧТО НУЖНО ОТ АННЫ ДО НАЧАЛА КОДА

| Что | Зачем | Блокирует |
|-----|-------|-----------|
| **Цены на тарифы в USD** | Создать IAP продукты в App Store Connect | Фазу 3 |
| **2-3 аудиофайла** (любые, можно черновики) | Тестировать плеер | Задачу 2.3 |
| **Описания разборов** (хотя бы для тестовых книг) | Наполнить каталог | Задачу 2.1 |
| **Согласие на структуру тарифов** | Финализировать Product IDs | Фазу 3 |
| **Apple Developer Account** ($99/год) | Всё | Задачу 0.1 |

---

*Документ: STEP-BY-STEP v2.0 | 28.02.2026*
*Синхронизирован с MASTER v2.5 + прототип v4.2*
*46 задач · 330ч · 7 фаз · все задачи с оценкой времени и чеклистами*
*При работе в чате: Claude читает AI-CONTEXT.md → понимает текущую задачу → читает нужную секцию MASTER.md → работает*
