  1. Деплой сервера (VPS Contabo 6vCPU/12GB) — БЛОКЕР всего: верификация, webhook, страницы Terms/Privacy, коды.
     МАШИНА: тот же VPS, где живёт мини-апп Анны **reader-bot** (github.com/g1orgi89/reader-bot) —
     стек Node+Express+MongoDB(mongoose7)+Socket.io+Telegram-бот(telegraf)+Claude/OpenAI/Qdrant, ПОРТ 3002.
     SSH-доступ ЕСТЬ (пользователь `deploy`, не root → где надо sudo). Им почти не пользуются.
     НАШ сервер ставим ОТДЕЛЬНО: свой порт (напр. 3000), СВОЯ база MongoDB, свой процесс (PM2/systemd),
     поддомен. ⚠️ ПЕРВЫМ ДЕЛОМ — СНАПШОТ (в тарифе 2), чтобы откатиться и не сломать мини-апп.
     nginx на машине уже есть (мини-апп отдаётся наружу) → добавить server-блок для нашего поддомена.
     ДОМЕН: **chitatel.app** (юзер оплачивает 16-17.06; сразу прописать DNS A-запись на IP VPS — DNS расходится часы).
     Поддомен напр. api.chitatel.app. HTTPS через certbot/Let's Encrypt после DNS.
     Порядок: снапшот → clone нашего репо → npm install → .env (своя MONGO_URI, JWT, apple.*) →
     запуск (PM2) → проверка по IP → DNS+поддомен+HTTPS → seed каталога → webhook URL в ASC.