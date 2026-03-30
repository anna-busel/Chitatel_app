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

**Фаза:** 1 — скелет (пишем код, инфраструктура параллельно)
**Следующая задача:** 2.1 (Mongoose-схемы Book, Package)
**Блокеры:** 1.3 (Apple Sign In) ждёт покупки Apple Dev Account.

---

## ПРОГРЕСС

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6, 1.7

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

---

## ПОРЯДОК РАБОТЫ

```
СЕЙЧАС:
  1.1 ✅ → 1.2 ✅ → 1.4 ✅ → 0.6 ✅ → 1.5 ✅ → 1.6 ✅ → 1.7 ✅ → 2.1 → 2.2 → 2.4 → 2.5 → 2.6

КОГДА APPLE DEV: 0.1 → 0.2 → 1.3
КОГДА VPS: 0.3 → 0.4 → деплой
```

---

## ПРОШЛАЯ СЕССИЯ

_15.03.2026 — Задача 1.7: Auth экраны + API. Созданы: login_screen.dart (Apple/Google/Email кнопки, GDPR чекбокс, «Пропустить»), email_login_screen.dart, email_register_screen.dart, forgot_password_screen.dart, auth_provider.dart (Riverpod: login, register, googleSignIn, logout, checkAuth), auth_service.dart (HTTP calls к /api/auth/*), api_client.dart (Dio + JWT refresh interceptor), api_endpoints.dart, secure_storage.dart (Keychain). Apple Sign In — кнопка есть, показывает сообщение «Будет доступно после Apple Dev Account». Guard обновлён: новые пользователи видят LoginScreen, после входа/пропуска — Главную. pubspec.yaml: dio, flutter_secure_storage, google_sign_in. Следующая задача: 2.1._

---

## ПРАВИЛА КОДА

- НЕ создавать заглушки. Файл создаётся только когда пишется его реализация.
- AI-CONTEXT обновлять В ТОМ ЖЕ КОММИТЕ что и код.

---

*Последнее обновление: 15.03.2026*
