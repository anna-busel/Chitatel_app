const dotenv = require('dotenv');

dotenv.config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/chitatel',

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
    secret: process.env.AUDIO_SECRET || 'dev-audio-secret',
    basePath: process.env.AUDIO_BASE_PATH || '/var/audio/chitatel',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'anna@chitatel.app',
  },
};

module.exports = config;
