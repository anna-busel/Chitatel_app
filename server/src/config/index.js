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
    // bundleId для верификации чеков (совпадает с App ID / clientId)
    bundleId:
      process.env.APPLE_BUNDLE_ID ||
      process.env.APPLE_CLIENT_ID ||
      'app.chitatel.ios',
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH || '',

    // Верификация покупок / App Store Server API (задача 3.3).
    // issuerId/keyId/ключ — из App Store Connect → Users and Access →
    // Integrations → In-App Purchase (роль Admin, заказывает Анна, Фаза 7).
    issuerId: process.env.APPLE_ISSUER_ID || '',
    // Числовой Apple ID приложения (App Store Connect → App Information).
    // Обязателен для Production-верификации; в sandbox можно пусто.
    appAppleId: process.env.APPLE_APP_APPLE_ID
      ? parseInt(process.env.APPLE_APP_APPLE_ID, 10)
      : null,
    // 'sandbox' | 'production'
    environment: process.env.APPLE_ENVIRONMENT || 'sandbox',
    // Папка с корневыми сертификатами Apple PKI (.cer/.pem) для проверки подписи.
    // Скачать: https://www.apple.com/certificateauthority/ (Apple Root CA).
    rootCertsPath: process.env.APPLE_ROOT_CERTS_PATH || '',
  },

  // APNs для push-уведомлений (задача 6.1). Token-based (.p8), отдельный ключ —
  // НЕ тот, что для Sign in with Apple (apple.keyId). Создаётся в Apple Developer
  // → Keys → Apple Push Notification service (APNs). Файл .p8 лежит вне репо,
  // chmod 600. teamId можно переиспользовать из APPLE_TEAM_ID.
  apns: {
    keyId: process.env.APNS_KEY_ID || '',
    teamId: process.env.APNS_TEAM_ID || process.env.APPLE_TEAM_ID || '',
    keyPath: process.env.APNS_KEY_PATH || '',
    bundleId:
      process.env.APNS_BUNDLE_ID ||
      process.env.APPLE_BUNDLE_ID ||
      process.env.APPLE_CLIENT_ID ||
      'app.chitatel.ios',
    // true → продовый шлюз APNs. Для TestFlight/разработки — false (sandbox).
    production: process.env.APNS_PRODUCTION === 'true',
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
