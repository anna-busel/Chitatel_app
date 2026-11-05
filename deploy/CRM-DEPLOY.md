# CRM и страницы оплаты на VPS (CRM-PLAN A5)

Домены: `crm.chitatel.app` — интерфейс CRM (статика + `/api` на сервер),
`pay.chitatel.app` — страницы оплаты (пока проксирует на API, страницы — E3).
Отдельный pm2-процесс не нужен: `/api` обслуживает уже работающий `chitatel-api`
(127.0.0.1:3000).

VPS: `ssh deploy@161.97.102.73`, репозиторий — `/home/deploy/chitatel/Chitatel_app`.

## 1. DNS (один раз)

DNS chitatel.app — у регистратора домена (доступ у Гиорги). Добавить две A-записи на IP VPS (тот же, что у `api`):

| Имя | Тип | Значение |
|-----|-----|----------|
| `crm` | A | `161.97.102.73` |
| `pay` | A | `161.97.102.73` |

Проверка (через 5–30 минут): `dig +short crm.chitatel.app` и
`dig +short pay.chitatel.app` → IP VPS.

## 2. Сервер API (один раз, из `main`)

Задеплоить `main` с CORS для `https://crm.chitatel.app` (`server/src/app.js`)
обычным порядком и `pm2 restart chitatel-api`.

## 3. Сборка CRM

Нужен Node 20+ (`node -v`).

```bash
cd /home/deploy/chitatel/Chitatel_app
git pull
cd crm && npm ci && npm run build      # → crm/dist
sudo mkdir -p /var/www/crm.chitatel.app
sudo rsync -a --delete dist/ /var/www/crm.chitatel.app/
```

`VITE_API_URL` не задаём: CRM ходит в `/api` своего домена.

## 4. nginx (один раз)

```bash
cd /home/deploy/chitatel/Chitatel_app
sudo cp deploy/nginx/crm.chitatel.app.conf /etc/nginx/sites-available/crm.chitatel.app
sudo cp deploy/nginx/pay.chitatel.app.conf /etc/nginx/sites-available/pay.chitatel.app
sudo ln -s /etc/nginx/sites-available/crm.chitatel.app /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/pay.chitatel.app /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

⚠️ Никаких `.bak` в `sites-enabled/` — nginx читает оттуда все файлы.

## 5. SSL (один раз, после того как DNS отвечает)

```bash
sudo certbot --nginx -d crm.chitatel.app -d pay.chitatel.app
```

certbot сам допишет в оба конфига блок 443 и редирект с 80. Продление — тот же
таймер certbot, что у `api.chitatel.app`.

## 6. Проверка

- `curl -I https://crm.chitatel.app` → 200, `curl -I https://crm.chitatel.app/clients` → 200 (SPA);
- `curl https://crm.chitatel.app/api/health` → `{"success":true,...}`;
- `curl https://pay.chitatel.app/api/health` → то же;
- в браузере: вход почта+пароль → код 2FA; менеджер не видит «Настройки» и «Импорт».

## Обновление CRM потом

Только шаг 3 (`git pull`, `npm ci && npm run build`, `rsync`). nginx и certbot
не трогаем. Если менялся сервер — ещё `pm2 restart chitatel-api`.
