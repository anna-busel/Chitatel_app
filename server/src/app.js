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
