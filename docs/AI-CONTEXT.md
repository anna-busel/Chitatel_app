# AI-CONTEXT — ЧИТАТЕЛЬ

> Обновляется после каждой завершённой задачи. Только статус и прогресс.
> Правила и роль — в Project Instructions (CHAT-INSTRUCTION.md).

---

## ПРОЕКТ

**Что:** iOS-приложение книжного клуба «ЧИТАТЕЛЬ» (аудиоразборы книг + дневник цитат + ИИ-анализ + чат)
**Стек:** Flutter (iOS) + Express.js (ES2020+) + MongoDB 7 + nginx + Contabo VPS
**Репозиторий:** github.com/anna-busel/Chitatel_app (монорепо: `server/` + `app/` + `docs/`)
**Документы в репо:**
- `docs/MASTER.md` (v2.5) — полная спецификация
- `docs/STEP-BY-STEP.md` (v2.0) — 46 задач, 7 фаз
- `docs/prototype-v4_2.jsx` — прототип UI

---

## ТЕКУЩИЙ СТАТУС

**Фаза:** 1 — скелет (пишем код, инфраструктура параллельно)
**Следующая задача:** 1.7 (Flutter — Auth экраны + API)
**Блокеры:** 1.3 (Apple Sign In) ждёт покупки Apple Dev Account.

---

## ПРОГРЕСС

**Готовые задачи:** 0.5, 0.6, 1.1, 1.2, 1.4, 1.5, 1.6
**Протестировано:** бэкенд auth (health, register, login, google) — всё работает локально ✅
**Протестировано:** Flutter-проект запускается на симуляторе iPhone 15 ✅
**Протестировано:** DesignSystemShowcase — все компоненты отображаются, Playfair Display загружается ✅
**Исправлено:** дублированные индексы в User.js

---

## РАБОЧАЯ СРЕДА

- **Mac:** MacBook Pro 2017, macOS Ventura 13.7
- **Xcode:** 15.2 + iOS 17.2 симулятор (достаточно для разработки, для App Store нужен Xcode 16+)
- **Flutter:** 3.22.3 (не latest — latest требует macOS 14+)
- **CocoaPods:** 1.16.2 через rbenv Ruby 3.2.2
- **rbenv:** установлен через Homebrew в `/usr/local/bin/rbenv`. Инициализация в `~/.bash_profile`: `eval "$(/usr/local/bin/rbenv init - bash)"`
- **SSL для Ruby/CocoaPods:** сертификаты в `~/.ssl_certs/cacert.pem`, переменная `SSL_CERT_FILE` в `~/.bash_profile`. Без этого `pod install` падает с SSL-ошибкой
- **Shell:** bash (не zsh!), PATH в `~/.bash_profile`
- **Google Cloud:** проект создан, OAuth Client ID (iOS): `29430814146-6i4kal1nihgo8l4685i53009dg1tjm81.apps.googleusercontent.com`
- **Node.js:** 20.20.1 (установлен через nvm) ✅
- **MongoDB:** 7.0.20 (бинарники в ~/mongodb/bin, данные в ~/mongodb/data) ✅
- **Запуск MongoDB:** `mongod --dbpath ~/mongodb/data` (в отдельном окне терминала)
- **Запуск бэкенда:** `cd ~/Chitatel_app/server && npm run dev`
- **Запуск Flutter:** `cd ~/Chitatel_app/app && flutter run`
- **Открытие симулятора:** `open /Applications/Xcode.app/Contents/Developer/Applications/Simulator.app` (в отдельном окне терминала)
- **Homebrew:** 5.0.16 (но на macOS 13 компиляция из исходников не работает — использовать nvm/бинарники)
- **Git push:** настроен через Personal Access Token + osxkeychain

---

## ПРАВИЛА КОДА (выучены на ошибках)

- **НЕ создавать заглушки.** Если файл упомянут в текущей задаче, но реализация в другой — не создавать файл и не подключать его. Создать когда дойдём до той задачи.
- **НЕ подключать в app.js роуты которые ещё не реализованы.** Подключать только вместе с реализацией.
- **AI-CONTEXT обновлять В ТОМ ЖЕ КОММИТЕ что и код задачи.** Не отдельным коммитом потом. Запушил код → в том же push_files включил обновлённый AI-CONTEXT.md.

---

## ПРОПУЩЕННЫЕ ЗАДАЧИ (вернуться позже)

| Задача | Что | Почему пропущена | Когда вернуться |
|--------|-----|-----------------|-----------------|
| 0.1 | Apple Developer Account | Не куплен | Перед задачей 1.3 (Apple Sign In) |
| 0.2 | App ID и Certificates | Зависит от 0.1 | После 0.1 |
| 0.3 | VPS настройка | Не куплен | Перед деплоем |
| 0.4 | Домен и SSL | Зависит от 0.3 | После 0.3 |
| 1.3 | Apple Sign In | Нет Apple Dev Account | После 0.1-0.2 |

> ⚠️ Без 0.1-0.2 нельзя делать: 1.3 (Apple Sign In), 3.x (платежи)
> ⚠️ Без 0.3-0.4 нельзя: деплоить бэкенд (но код писать можно!)

---

## ПОРЯДОК РАБОТЫ (актуальный)

```
СЕЙЧАС (код без сервера):
  1.1 ✅ → 1.2 ✅ → 1.4 ✅ → 0.6 ✅ → 1.5 ✅ → 1.6 ✅ → 1.7 (без Apple auth)

КОГДА APPLE DEV КУПЛЕН:
  0.1 → 0.2 → 1.3 (Apple Sign In)

КОГДА VPS КУПЛЕН:
  0.3 → 0.4 → деплой всего готового кода
```

---

## ПРОШЛАЯ СЕССИЯ

_15.03.2026 — Задача 1.6: навигация GoRouter. Создан app_router.dart с полной картой маршрутов (22 маршрута из MASTER 4.47). ShellRoute с 4 табами (Главная/Каталог/Клуб/Профиль) + AppBottomBar. Guard: onboarding_seen через SharedPreferences. Все экраны — placeholder "Экран в разработке" (заменятся реальными в следующих задачах). routes.dart — константы всех путей. main.dart: ProviderScope + MaterialApp.router. pubspec.yaml: go_router, flutter_riverpod, shared_preferences. Следующая задача: 1.7 (Auth экраны + API)._

---

## ЗАДАЧА 0.6 — ЧТО ОСТАЛОСЬ СДЕЛАТЬ В XCODE ВРУЧНУЮ

Следующие настройки нельзя сделать через GitHub — нужно открыть Xcode:
1. **Bundle Identifier:** сменить на `app.chitatel.ios`
2. **Minimum Deployments:** iOS 16.0
3. **Signing & Capabilities → + Capability:** Push Notifications, Background Modes (Audio уже в Info.plist), Sign in with Apple, In-App Purchase
4. **Team:** выбрать Personal Team (для разработки) или Apple Dev Account когда купят

После этих изменений — пересобрать: `cd ~/Chitatel_app/app && flutter run`

---

## РЕШЕНИЯ

| Дата | Решение | Причина |
|------|---------|---------|
| 28.02.2026 | Вечный доступ к архиву — POST-MVP | Мало контента на старте |
| 28.02.2026 | Возрастной рейтинг 13+ (не 12+) | Apple убрала 12+ в июле 2025 |
| 03.03.2026 | MVP = только iOS. Android — post-MVP | Flutter готов, но запуск после стабилизации iOS |
| 09.03.2026 | Монорепо вместо двух репозиториев | Проще управлять, один git clone |
| 10.03.2026 | Пишем код до покупки VPS/Apple Dev | Код не зависит от сервера, тестируем локально |
| 10.03.2026 | CommonJS вместо ESM | Express стандарт, убрали sourceType: module из eslintrc |
| 10.03.2026 | Никаких заглушек | Файл создаётся только когда пишется его реализация |
| 10.03.2026 | AI-CONTEXT в одном коммите с кодом | Не забывать обновлять, не плодить лишние коммиты |
| 10.03.2026 | express-rate-limit добавлен | Нужен для rate limiting auth (MASTER 12.2) |
| 12.03.2026 | Flutter 3.22.3 (не latest) | macOS 13.7 не поддерживает Flutter 3.24+ (требует macOS 14) |
| 15.03.2026 | Node.js через nvm, MongoDB из бинарников | Homebrew на macOS 13 не может компилировать из исходников |
| 15.03.2026 | Playfair Display через google_fonts | Не Onest. MASTER и прототип используют Playfair Display |

---

## ПРОБЛЕМЫ

| Проблема | Блокирует | Статус |
|----------|-----------|--------|
| Apple Dev не куплен | Задачи 0.1, 0.2, 1.3, фазу 3 | Нужен к концу марта. Ждём от Анны |
| VPS не куплен | Деплой бэкенда | Нужен к концу марта. Ждём от Анны |
| Цены на тарифы не утверждены | Фазу 3 | Ждём от Анны |
| Аудиофайлы не получены | Задачу 2.3 | Ждём от Анны |
| Обложки книг не готовы | Задачу 2.4 | Ждём от Анны |
| Mac 2017 + macOS Ventura 13.7 | Фазу 7 (App Store) | Для релиза нужен Xcode 16+ → macOS Sonoma 14+. Решить до фазы 7: новый мак или облачный Mac |
| Flutter 3.22.3 (не latest) | Возможно фазу 7 | Для разработки хватает. Перед релизом может потребоваться обновление на более новом маке |
| Homebrew на macOS 13 | Установка пакетов | Tier 2/3 — компиляция не работает. Использовать nvm и бинарники |

---

*Последнее обновление: 15.03.2026*
