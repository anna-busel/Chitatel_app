const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler } = require('./middleware/error');
const { authLimiter } = require('./middleware/rate-limit');
const { success } = require('./utils/response');
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const packageRoutes = require('./routes/packages');
const homeRoutes = require('./routes/home');
const audioRoutes = require('./routes/audio');
const imageRoutes = require('./routes/images');
const voiceRoutes = require('./routes/voice');
const progressRoutes = require('./routes/progress');
const clubRoutes = require('./routes/club');
const purchaseRoutes = require('./routes/purchases');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const quoteRoutes = require('./routes/quotes');
const reportRoutes = require('./routes/reports');
const profileRoutes = require('./routes/profile');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const adminPushRoutes = require('./routes/admin-push');
const adminUsersRoutes = require('./routes/admin-users');
const adminCatalogRoutes = require('./routes/admin-catalog');
const adminClubRoutes = require('./routes/admin-club');
const adminThoughtsRoutes = require('./routes/admin-thoughts');

const app = express();

// Доверяем ОДНОМУ обратному прокси (nginx перед приложением). Без этого
// express-rate-limit видит заголовок X-Forwarded-For и падает с ошибкой
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR — из-за чего запросы на /api/auth
// (вход, refresh-токена) отбивались 500. Это ломало обновление токена при
// перезаходе: refresh падал → токен не обновлялся → экран клуба висел на
// «вечной загрузке». trust proxy=1 — корректное определение реального IP
// клиента из X-Forwarded-For, выставленного nginx.
app.set('trust proxy', 1);

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://chitatel.app', 'https://admin.chitatel.app']
    : '*',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (_req, res) => {
  return success(res, { status: 'ok' });
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/club', clubRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);

// Дневник (Фаза 5): цитаты, еженедельные ИИ-отчёты, согласие на ИИ.
app.use('/api/quotes', quoteRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/profile', profileRoutes);

// Пользователи (Фаза 6, A1): блокировка участника участником, список
// заблокированных, жалоба на пользователя. Apple Guideline 1.2 (UGC).
app.use('/api/users', userRoutes);

// Push-уведомления (Фаза 6, 6.1): регистрация APNs-токена устройства.
app.use('/api/notifications', notificationRoutes);

// Ручная отправка push из админки (MASTER 9): POST /api/admin/push/send.
// Отдельный роут-файл, чтобы не раздувать admin.js; та же защита requireAdmin.
app.use('/api/admin/push', adminPushRoutes);

// Управление участницами из админки (6.6): поиск, ручная выдача подписки и
// доступа к разборам/пакетам, роли, бан. Отдельный роут-файл; requireAdmin
// внутри. adminRoutes (/api/admin) не имеет /users-путей, поэтому запрос
// доходит сюда.
app.use('/api/admin/users', adminUsersRoutes);

// Каталог разборов из админки (6.6): CRUD книг, загрузка обложки и аудио-
// частей (ffprobe считает длительность), публикация. Отдельный роут-файл;
// requireAdmin внутри. Как и /users, не пересекается с путями adminRoutes.
app.use('/api/admin/catalog', adminCatalogRoutes);

// Клуб месяца из админки (6.6): CRUD клубов, привязка книги, даты, расписание
// открытия частей. Отдельный роут-файл; requireAdmin внутри.
app.use('/api/admin/club', adminClubRoutes);

// Мысль дня из админки (6.6): список фраз в БД (DailyThought), CRUD, показ
// текущей. Ротация та же (thought.service). Отдельный роут-файл; requireAdmin.
app.use('/api/admin/thoughts', adminThoughtsRoutes);

/* ------------------------------------------------------------------ *
 *              СТАТИКА: АДМИНКА И ЮРИДИЧЕСКИЕ СТРАНИЦЫ               *
 * ------------------------------------------------------------------ */

// ⚠️ ВАЖНО: helmet() выше выставляет строгий Content-Security-Policy, в котором
// инлайновые <script> и <style> ЗАПРЕЩЕНЫ. Для API это правильно, но наши
// статические страницы (админка, privacy/terms) — одностраничные, со стилями и
// скриптом внутри файла. Без послабления браузер молча не выполнит скрипт, и
// админка откроется ПУСТОЙ. Поэтому на этих двух путях (и только на них)
// переопределяем CSP: разрешаем инлайн, всё остальное оставляем закрытым.
const staticPageCsp = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // helmet по умолчанию ставит script-src-attr 'none' — это ОТДЕЛЬНАЯ от
      // scriptSrc директива, которая блокирует именно инлайновые обработчики
      // событий (onclick="..."). Вся админка и legal-страницы построены на
      // onclick, поэтому без этого послабления кнопки молча не срабатывают
      // (в консоли: «Executing inline event handler violates ... script-src-attr
      // 'none'»). Разрешаем инлайн-обработчики только на этих статических путях.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
});

// Админка модерации (Фаза 6, A5) — https://api.chitatel.app/admin
//
// Apple Guideline 1.2 требует реакции на жалобы в течение 24 часов. Серверные
// эндпоинты (/api/admin/*) были готовы с задачи 4.4, но UI не существовало
// нигде — разобрать жалобу или ответить на вопрос Q&A можно было только
// curl'ом. Страница без сборки (никакого React/Vite): ходит в те же эндпоинты
// под токеном Анны (role=admin).
//
// РЕШЕНИЕ 12.07.2026: это НЕ времянка. Полноценная панель (задача 6.6) будет
// наращиваться ИЗ ЭТОЙ ЖЕ страницы — добавятся разделы «Книги», «Клуб месяца»,
// «Аудио», «Push». Отдельную React-панель не делаем: для одного пользователя
// сборочный стек не окупается, а переписывать работающее заново — потеря.
// Поддомен admin.chitatel.app поднимем, когда панель дорастёт (одна строка
// в nginx, изменений в коде не потребует).
app.use('/admin', staticPageCsp, express.static(path.join(__dirname, '..', 'admin')));

// Юридические страницы (Фаза 6, A3) — Privacy Policy, Terms/EULA, Support.
// Ссылки указываются в App Store Connect и открываются из приложения (paywall,
// экран поддержки): https://api.chitatel.app/legal/privacy и т.д.
// extensions:['html'] — чтобы /legal/privacy отдавал privacy.html без .html.
app.use(
  '/legal',
  staticPageCsp,
  express.static(path.join(__dirname, '..', 'public', 'legal'), {
    extensions: ['html'],
  })
);

// Audio streaming (на корне, не под /api — это стриминг файлов, не JSON API)
// Защита через signed URL — проверяется внутри роута.
app.use('/audio', audioRoutes);

// Картинки чата клуба (4.6) — тоже на корне, защита через signed URL.
app.use('/images', imageRoutes);

// Голосовые сообщения чата клуба (4.12) — на корне, защита через signed URL.
app.use('/voice', voiceRoutes);

// 404 handler
app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Маршрут не найден',
      details: {},
    },
  });
});

// Global error handler (должен быть последним)
app.use(errorHandler);

module.exports = app;
