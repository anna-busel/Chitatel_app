const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { setupSocket } = require('./socket');
const { scheduleWeeklyReports, runWeeklyReports } = require('./jobs/weekly-report');
const { scheduleMonthlyReports, runMonthlyReports } = require('./jobs/monthly-report');
const { schedulePushJobs } = require('./jobs/push-scheduler');

const server = http.createServer(app);

// Socket.io — инициализация
const io = new Server(server, {
  cors: {
    origin: config.nodeEnv === 'production'
      ? ['https://chitatel.app', 'https://admin.chitatel.app']
      : '*',
    credentials: true,
  },
});

// Подключаем хендлеры чата клуба (задача 4.3)
setupSocket(io);

// Сделать io доступным в routes через app
app.set('io', io);

// Фоновый catch-up: до-генерирует пропущенные отчёты (если сервер был выключен
// во время cron). Не блокирует старт, запускается через паузу после listen.
// Идемпотентно: готовые отчёты пропускаются без повторного вызова OpenAI.
const CATCHUP_DELAY_MS = 60 * 1000;

const runReportsCatchUp = () => {
  setTimeout(() => {
    logger.info('Reports catch-up started (background)');
    runWeeklyReports().catch((err) =>
      logger.error('Weekly catch-up error', { message: err.message })
    );
    runMonthlyReports().catch((err) =>
      logger.error('Monthly catch-up error', { message: err.message })
    );
  }, CATCHUP_DELAY_MS);
};

// MongoDB connect + start server
const start = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('MongoDB connected');

    // Cron ИИ-отчётов (задачи 5.1 / отчёты).
    // ⚠️ PM2 — строго fork mode, 1 инстанс, иначе cron задвоится.
    scheduleWeeklyReports();
    scheduleMonthlyReports();

    // Cron push-уведомлений (задача 6.1). Тот же принцип: 1 инстанс.
    // Асинхронна: напоминание собирается из настройки в БД (ReminderSetting).
    await schedulePushJobs();

    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
      // Фоновый catch-up отчётов — после того как сервер поднялся.
      runReportsCatchUp();
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Graceful shutdown.
// Mongoose 8 убрал callback у connection.close() — теперь это промис.
// Раньше передавался callback → unhandledRejection при остановке сервера.
// Используем async/await + await на закрытие HTTP-сервера.
const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down...`);
  try {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close(false);
    logger.info('Server closed');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Аудит S4: глобальные ловушки. unhandledRejection — только лог (процесс
// живёт). uncaughtException — лог и exit(1): состояние процесса неизвестно,
// PM2 перезапустит чисто.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    message: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', {
    message: err && err.message,
    stack: err && err.stack,
  });
  process.exit(1);
});

start();
