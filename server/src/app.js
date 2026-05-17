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
const adminRoutes = require('./routes/admin');

const app = express();

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
app.use('/api/admin', adminRoutes);

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
