const crypto = require('crypto');
const config = require('../config');

/**
 * Сервис подписи аудио-URL (HMAC-SHA256).
 *
 * Стандартный подход (как у Audible, Spotify, Apple Music):
 * 1. При запросе /api/books/:id/audio/:partNumber сервер генерирует signed URL
 *    с встроенным токеном, действующим N секунд (по умолчанию 1 час).
 * 2. Юзер передаёт этот URL в плеер (например `just_audio`), плеер качает MP3.
 * 3. Сервер при отдаче MP3 проверяет токен: подпись + срок действия.
 * 4. Без токена → 403 Forbidden. С истёкшим токеном → 410 Gone.
 *
 * Защита от:
 * - Кражи прямых ссылок (без подписи URL невалиден)
 * - Шеринга ссылок (через час перестаёт работать)
 * - Подмены filename в URL (filename часть подписи)
 */

/**
 * Генерирует signed URL для аудиофайла.
 *
 * @param {string} filename - Относительный путь к файлу от AUDIO_BASE_PATH,
 *                            например 'malenkii_princ/part-1.mp3'.
 * @param {number} [ttlSeconds] - Срок действия. По умолчанию config.audio.urlTtlSeconds (3600).
 * @returns {string} Полный URL вида:
 *   http://localhost:3000/audio/<filename>?exp=<timestamp>&sig=<hex>
 */
function generateSignedUrl(filename, ttlSeconds = config.audio.urlTtlSeconds) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signPayload(filename, expiresAt);

  // encodeURI чтобы слэши внутри filename сохранились как `/`,
  // но любые специальные символы экранировались корректно.
  const safeFilename = filename
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  return `${config.publicBaseUrl}/audio/${safeFilename}?exp=${expiresAt}&sig=${signature}`;
}

/**
 * Проверяет валидность токена на запросе.
 *
 * @param {string} filename - Относительный путь (из req.params).
 * @param {string|number} exp - Срок действия (из req.query.exp).
 * @param {string} sig - Подпись (из req.query.sig).
 * @returns {{ valid: boolean, reason?: 'expired' | 'invalid' }}
 */
function verifySignedUrl(filename, exp, sig) {
  if (!exp || !sig) {
    return { valid: false, reason: 'invalid' };
  }

  const expiresAt = parseInt(exp, 10);
  if (!expiresAt || Number.isNaN(expiresAt)) {
    return { valid: false, reason: 'invalid' };
  }

  // Проверка срока действия
  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) {
    return { valid: false, reason: 'expired' };
  }

  // Проверка подписи (timing-safe сравнение чтобы избежать timing attacks)
  const expectedSig = signPayload(filename, expiresAt);
  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');

  if (sigBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'invalid' };
  }

  const isValid = crypto.timingSafeEqual(sigBuf, expectedBuf);
  return isValid ? { valid: true } : { valid: false, reason: 'invalid' };
}

/**
 * Подписывает payload HMAC-SHA256 c секретным ключом из config.audio.secret.
 */
function signPayload(filename, expiresAt) {
  const payload = `${filename}:${expiresAt}`;
  return crypto
    .createHmac('sha256', config.audio.secret)
    .update(payload)
    .digest('hex');
}

module.exports = {
  generateSignedUrl,
  verifySignedUrl,
};
