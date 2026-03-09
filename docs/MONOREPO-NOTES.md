# MONOREPO MIGRATION NOTES

> Этот файл фиксирует изменения от исходной спецификации.
> Дата: 09.03.2026

## Решение: Monorepo

**Было в MASTER.md и STEP-BY-STEP.md:** два репозитория (`chitatel-api` + `chitatel-app`)
**Стало:** один репозиторий `anna-busel/Chitatel_app` (monorepo)

### Структура monorepo:

```
Chitatel_app/
├── server/          ← бэкенд (бывший chitatel-api)
│   ├── src/
│   ├── tests/
│   ├── admin/       ← админ-панель (задача 6.6)
│   ├── package.json
│   ├── .eslintrc.json
│   ├── .env.example
│   └── ecosystem.config.js
├── app/             ← Flutter (бывший chitatel-app)
│   ├── lib/
│   ├── ios/
│   ├── pubspec.yaml
│   └── ...
├── docs/            ← документация (общая)
│   ├── MASTER.md
│   ├── STEP-BY-STEP.md
│   ├── AI-CONTEXT.md
│   └── prototype-v4_2.jsx
└── .gitignore
```

### Маппинг путей (читая MASTER/STEP-BY-STEP):

| В документах написано | В monorepo реально |
|-----------------------|-------------------|
| `chitatel-api/src/...` | `server/src/...` |
| `chitatel-app/lib/...` | `app/lib/...` |
| `chitatel-api/admin/` | `server/admin/` |
| `src/routes/auth.js` (бэкенд) | `server/src/routes/auth.js` |
| `lib/features/auth/...` (Flutter) | `app/lib/features/auth/...` |

### Что НЕ меняется:

- Все API endpoints, схемы, экраны — без изменений
- Все пути внутри `src/` и `lib/` — без изменений (просто добавляется `server/` или `app/` перед ними)
- PM2 config, nginx config — без изменений
- Deploy процесс: git pull на VPS, npm install в `server/`, flutter build в `app/`
