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
**Следующая задача:** 2.4 (Flutter — главная страница)
**Блокеры:** 1.3 (Apple Sign In) ждёт Apple Dev Account. 2.3 (аудио стриминг) ждёт аудиофайлы от Анны.

---

## ПРОГРЕСС

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2

---

## ПРОПУЩЕННЫЕ ЗАДАЧИ (вернуться позже)

| Задача | Что | Почему пропущена | Когда вернуться |
|--------|-----|-----------------|-----------------| 
| 0.1 | Apple Developer Account | Не куплен | Перед задачей 1.3 |
| 0.2 | App ID и Certificates | Зависит от 0.1 | После 0.1 |
| 0.3 | VPS настройка | Не куплен | Перед деплоем |
| 0.4 | Домен и SSL | Зависит от 0.3 | После 0.3 |
| 1.3 | Apple Sign In | Нет Apple Dev Account | После 0.1-0.2 |
| 2.3 | Аудио стриминг (signed URLs + nginx) | Нет аудиофайлов от Анны | Когда Анна пришлёт MP3 |
| 2.7 | Аудиоплеер Flutter | Зависит от 2.3 | После 2.3 |
| Фаза 3 | Платежи (StoreKit 2) | Нет Apple Dev Account | После 0.1-0.2 |

> ⚠️ Без Apple Dev нельзя: 1.3 (Apple Sign In), фазу 3 (платежи), фазу 7 (TestFlight)
> ⚠️ Без аудиофайлов нельзя: 2.3 (стриминг), 2.7 (плеер)
> ⚠️ Без VPS нельзя: деплоить бэкенд (но код писать можно!)

---

## РАБОЧАЯ СРЕДА

- **Mac:** MacBook Pro 2017, macOS Ventura 13.7
- **Xcode:** 15.2 + iOS 17.2 симулятор
- **Flutter:** 3.22.3
- **CocoaPods:** 1.16.2 через rbenv Ruby 3.2.2
- **rbenv:** `/usr/local/bin/rbenv`, init в `~/.bash_profile`
- **SSL для Ruby/CocoaPods:** `~/.ssl_certs/cacert.pem`, `SSL_CERT_FILE` в `~/.bash_profile`
- **Shell:** bash, PATH в `~/.bash_profile`
- **Google Cloud:** OAuth Client ID: `29430814146-6i4kal1nihgo8l4685i53009dg1tjm81.apps.googleusercontent.com`
- **Node.js:** 20.20.1 (nvm)
- **MongoDB:** 7.0.20
- **Запуск MongoDB:** `mongod --dbpath ~/mongodb/data`
- **Запуск бэкенда:** `cd ~/Chitatel_app/server && npm run dev`
- **Запуск Flutter:** `cd ~/Chitatel_app/app && flutter run`
- **Открытие симулятора:** `open /Applications/Xcode.app/Contents/Developer/Applications/Simulator.app`
- **Симулятор зависает:** если launchd_sim ошибка → `killall -9 com.apple.CoreSimulator.CoreSimulatorService`, `xcrun simctl shutdown all`, подождать, перезапустить

---

## ПОРЯДОК РАБОТЫ

```
СЕЙЧАС:
  1.1–2.2 ✅ → 2.4 → 2.5 → 2.6 → Фаза 4 → Фаза 5 → Фаза 6
  (2.3 и 2.7 ждут аудиофайлы от Анны)

КОГДА APPLE DEV: 0.1 → 0.2 → 1.3 → Фаза 3
КОГДА АУДИОФАЙЛЫ: 2.3 → 2.7
КОГДА VPS: 0.3 → 0.4 → деплой
```

---

## ПРОШЛАЯ СЕССИЯ

_30.03.2026 — Задачи 1.5–2.2: дизайн-система (13 файлов), навигация GoRouter (22 маршрута), экраны входа (Login/Email/Register/ForgotPassword + auth_provider + api_client + secure_storage), модели Book.js и Package.js, API каталога (routes/books.js: GET books, featured, search, :id, :id/audio/:partNumber; routes/packages.js: GET packages, :id; routes/home.js: GET home). app.js обновлён с новыми роутами. Исправлен rbenv init, SSL для CocoaPods, зависший симулятор. Следующая задача: 2.4._

---

## ПРАВИЛА КОДА

- НЕ создавать заглушки. Файл создаётся только когда пишется его реализация.
- AI-CONTEXT обновлять В ТОМ ЖЕ КОММИТЕ что и код.

---

*Последнее обновление: 30.03.2026*
