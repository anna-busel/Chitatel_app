const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { generateSignedUrl, verifySignedUrl } = require('./audio.service');

/**
 * Сервис голосовых сообщений чата клуба (задача 4.12).
 *
 * Переиспортирует механизм signed URL из audio.service (тот же AUDIO_SECRET,
 * та же HMAC-SHA256 подпись) — как и картинки (image.service). Голосовые
 * хранятся в той же файловой системе:
 *   AUDIO_BASE_PATH/voice-messages/<userId>/<uuid>.m4a
 *
 * Продуктовое правило: отправлять голосовые может ТОЛЬКО Анна (role=admin) —
 * формат ведущей (разборы, ответы). Проверка роли — в routes/club.js.
 *
 * Раздаются через GET /voice/<filename>?exp&sig (routes/voice.js),
 * по аналогии с /audio/ и /images/.
 */

// Разрешённые MIME для голосовых. iOS-нативный формат — AAC в контейнере
// m4a (audio/mp4 / audio/m4a / audio/aac). Принимаем основные варианты
// которые шлёт пакет record на iOS.
const ALLOWED_MIME = new Map([
  ['audio/mp4', 'm4a'],
  ['audio/m4a', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/aac', 'm4a'],
  ['audio/aacp', 'm4a'],
]);

// Макс длительность голосового — 3 минуты (продуктовое решение). AAC 64kbps
// mono ≈ 480 КБ/мин → лимит ~2 МБ с запасом.
const MAX_DURATION_SEC = 180;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * Подпапка относительно AUDIO_BASE_PATH где лежат голосовые.
 * Полный путь: <AUDIO_BASE_PATH>/voice-messages/<userId>/<file>
 */
function voiceMessagesDir(userId) {
  return path.join(
    config.audio.basePath,
    'voice-messages',
    String(userId)
  );
}

/**
 * Относительный путь файла от AUDIO_BASE_PATH (для подписи URL).
 * Например: 'voice-messages/6a06.../a1b2c3d4.m4a'
 */
function relativeVoicePath(userId, fileName) {
  return path.posix.join('voice-messages', String(userId), fileName);
}

/**
 * Уникальное имя файла голосового. Формат: <random-hex-16>.m4a
 */
function generateVoiceFileName() {
  const id = crypto.randomBytes(16).toString('hex');
  return `${id}.m4a`;
}

/**
 * Signed URL для голосового. filename — относительный путь от
 * AUDIO_BASE_PATH. Голосовые отдаются через /voice/ а не /audio/,
 * поэтому подменяем префикс (подпись считается по filename и не зависит
 * от префикса — verifySignedUrl проверяет filename, exp, sig).
 */
function generateVoiceSignedUrl(filename) {
  const audioUrl = generateSignedUrl(filename);
  return audioUrl.replace(
    `${config.publicBaseUrl}/audio/`,
    `${config.publicBaseUrl}/voice/`
  );
}

module.exports = {
  ALLOWED_MIME,
  MAX_DURATION_SEC,
  MAX_FILE_SIZE_BYTES,
  voiceMessagesDir,
  relativeVoicePath,
  generateVoiceFileName,
  generateVoiceSignedUrl,
  verifySignedUrl,
};
