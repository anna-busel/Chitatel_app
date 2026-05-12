const dotenv = require('dotenv');

dotenv.config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/chitatel',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: '15m',
    refreshExpiresIn: '30d',
  },

  apple: {
    clientId: process.env.APPLE_CLIENT_ID || 'app.chitatel.ios',
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH || '',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  audio: {
    // HMAC-ключ для подписи временных URL
    secret: process.env.AUDIO_SECRET || 'dev-audio-secret-CHANGE-IN-PROD-min-32-chars',
    // Корневая папка с MP3 на файловой системе
    basePath: process.env.AUDIO_BASE_PATH || '/var/audio/chitatel',
    // Срок действия signed URL в секундах (1 час по умолчанию)
    urlTtlSeconds: parseInt(process.env.AUDIO_URL_TTL_SECONDS, 10) || 3600,
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'anna@chitatel.app',
  },
};

module.exports = config;
