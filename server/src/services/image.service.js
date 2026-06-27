const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { generateSignedUrl, verifySignedUrl } = require('./audio.service');

/**
 * Сервис картинок чата клуба (задача 4.6).
 *
 * Переиспользует механизм signed URL из audio.service (тот же AUDIO_SECRET,
 * та же HMAC-SHA256 подпись). Картинки хранятся в той же файловой системе
 * что и аудио — AUDIO_BASE_PATH/club-images/<clubMonthId>/<uuid>.<ext>.
 *
 * Это согласовано с архитектурой из AI-CONTEXT: voice messages и картинки
 * переиспользуют ту же signed-URL инфраструктуру что аудиоразборы (2.3),
 * чтобы не плодить отдельные секреты и схемы доступа.
 *
 * Раздаются через GET /images/<filename>?exp&sig (routes/images.js),
 * по аналогии с /audio/.
 */

// Разрешённые MIME-типы для загрузки картинок в чат.
const ALLOWED_MIME = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
]);

// Максимальный размер файла — 8 МБ (Telegram сжимает до ~10, для книжного
// чата 8 достаточно; экономит диск VPS).
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

// Срок жизни signed URL картинки — 10 лет (фактически «вечный»).
//
// Почему НЕ 1 час как у аудио: картинка чата иммутабельна (uuid в имени,
// содержимое не меняется) и НЕ является платным контентом, который надо
// защищать от шеринга по времени (как аудиоразборы). Защиту даёт ПОДПИСЬ
// (sig) — без неё URL невалиден, чужой не откроет. Срок тут лишний и вреден:
// при коротком TTL URL приходилось перевыпускать на каждой отдаче истории,
// из-за чего ссылка постоянно менялась → клиент не мог кэшировать картинку →
// она каждый раз грузилась заново (видна «подгрузка» при входе в чат).
// Со стабильным долгим URL ссылка одна и та же → клиент кэширует → картинка
// показывается мгновенно. Аудио (audio.service) остаётся с TTL 1 час — там
// защита от шеринга платного контента нужна.
const IMAGE_URL_TTL_SECONDS = 10 * 365 * 24 * 60 * 60; // ~10 лет

/**
 * Подпапка относительно AUDIO_BASE_PATH где лежат картинки чата.
 * Полный путь: <AUDIO_BASE_PATH>/club-images/<clubMonthId>/<file>
 */
function clubImagesDir(clubMonthId) {
  return path.join(config.audio.basePath, 'club-images', String(clubMonthId));
}

/**
 * Относительный путь файла от AUDIO_BASE_PATH (для подписи URL).
 * Например: 'club-images/6a06.../a1b2c3d4.jpg'
 */
function relativeImagePath(clubMonthId, fileName) {
  return path.posix.join('club-images', String(clubMonthId), fileName);
}

/**
 * Сгенерировать уникальное имя файла картинки.
 * Формат: <random-hex-16>.<ext>
 */
function generateImageFileName(ext) {
  const id = crypto.randomBytes(16).toString('hex');
  return `${id}.${ext}`;
}

/**
 * Сгенерировать signed URL для картинки чата.
 * filename — относительный путь от AUDIO_BASE_PATH (см. relativeImagePath).
 *
 * Картинки отдаются через /images/ а не /audio/, поэтому подменяем префикс:
 * generateSignedUrl даёт .../audio/<filename>?... — нам нужен .../images/...
 * Подпись считается по filename и не зависит от префикса пути, поэтому
 * простая замена префикса безопасна (verifySignedUrl проверяет filename, exp, sig).
 *
 * TTL — IMAGE_URL_TTL_SECONDS (10 лет) → URL стабильный → клиент кэширует
 * картинку, она показывается мгновенно (а не грузится при каждом входе в чат).
 */
function generateImageSignedUrl(filename) {
  const audioUrl = generateSignedUrl(filename, IMAGE_URL_TTL_SECONDS);
  return audioUrl.replace(
    `${config.publicBaseUrl}/audio/`,
    `${config.publicBaseUrl}/images/`
  );
}

module.exports = {
  ALLOWED_MIME,
  MAX_FILE_SIZE_BYTES,
  IMAGE_URL_TTL_SECONDS,
  clubImagesDir,
  relativeImagePath,
  generateImageFileName,
  generateImageSignedUrl,
  // verifySignedUrl переэкспортируем — routes/images.js использует ту же
  // проверку что и аудио (тот же секрет, тот же алгоритм).
  verifySignedUrl,
};
