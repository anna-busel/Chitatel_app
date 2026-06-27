const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');
const { setupSocket } = require('./socket');

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

// MongoDB connect + start server
const start = async () => {
  try {
    await mongoose.connect(config.mongoUri);
    logger.info('MongoDB connected');

    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
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

start();
