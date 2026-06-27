const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { verifySignedUrl } = require('./audio.service');

/**
 * Сервис картинок чата клуба (задача 4.6).
 *
 * Переиспользует механизм signed URL из audio.service (тот же AUDIO_SECRET,
 * та же HMAC-SHA256 подпись, та же verifySignedUrl). Картинки хранятся в той
 * же файловой системе что и аудио — AUDIO_BASE_PATH/club-images/<clubMonthId>/<uuid>.<ext>.
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

// ФИКСИРОВАННЫЙ срок действия signed URL картинки — 1 января 2099, 00:00 UTC
// (Unix-секунды). Это НЕ «now + TTL», а КОНСТАНТА.
//
// Почему именно константа, а не длинный TTL:
// Раньше URL картинки генерировался как (Date.now() + 10 лет). Срок длинный,
// НО точка отсчёта — текущий момент, поэтому при КАЖДОЙ отдаче истории exp
// получался чуть другим (22:00 vs 22:05) → другой exp → другая подпись (sig
// зависит от exp) → ДРУГОЙ URL. Клиент (cached_network_image) видел каждый раз
// новый URL и грузил картинку заново, кэш не попадал.
//
// С фиксированным exp (константа 2099) одна и та же картинка ВСЕГДА даёт один
// и тот же URL (exp одинаковый → sig одинаковый → URL идентичный). Клиент
// кэширует её на диск и больше не качает — мгновенный показ, как в Telegram.
//
// Безопасность не страдает: защиту картинки даёт ПОДПИСЬ (sig) — без неё URL
// невалиден, чужой не откроет. Срок (2099) для картинки чата роли не играет:
// она иммутабельна (uuid в имени) и не платный контент. Аудио (audio.service)
// остаётся с TTL 1 час — там защита от шеринга платного контента нужна.
const IMAGE_URL_FIXED_EXP = Math.floor(Date.UTC(2099, 0, 1) / 1000);

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
 * Подписать payload HMAC-SHA256 секретом config.audio.secret.
 * Идентично signPayload в audio.service (тот же секрет, тот же алгоритм,
 * тот же формат payload `filename:expiresAt`), поэтому verifySignedUrl из
 * audio.service корректно проверит подпись. Воспроизводим здесь, чтобы не
 * менять audio.service ради экспорта приватной функции.
 */
function signPayload(filename, expiresAt) {
  const payload = `${filename}:${expiresAt}`;
  return crypto
    .createHmac('sha256', config.audio.secret)
    .update(payload)
    .digest('hex');
}

/**
 * Сгенерировать signed URL для картинки чата с ФИКСИРОВАННЫМ exp.
 *
 * filename — относительный путь от AUDIO_BASE_PATH (см. relativeImagePath).
 *
 * Ключевое отличие от аудио: exp = IMAGE_URL_FIXED_EXP (константа 2099), а НЕ
 * (now + TTL). Поэтому URL одной картинки ВСЕГДА идентичен между отдачами →
 * клиент кэширует на диск → мгновенный показ. См. подробный комментарий у
 * IMAGE_URL_FIXED_EXP выше.
 *
 * Формат идентичен audio.service.generateSignedUrl, только префикс /images/
 * и exp фиксированный. verifySignedUrl (из audio.service) проверит exp (2099,
 * не истёк) и sig (совпадёт) — URL валиден.
 */
function generateImageSignedUrl(filename) {
  const expiresAt = IMAGE_URL_FIXED_EXP;
  const signature = signPayload(filename, expiresAt);

  // encodeURI чтобы слэши внутри filename сохранились как `/`,
  // но любые специальные символы экранировались корректно.
  const safeFilename = filename
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  return `${config.publicBaseUrl}/images/${safeFilename}?exp=${expiresAt}&sig=${signature}`;
}

module.exports = {
  ALLOWED_MIME,
  MAX_FILE_SIZE_BYTES,
  IMAGE_URL_FIXED_EXP,
  clubImagesDir,
  relativeImagePath,
  generateImageFileName,
  generateImageSignedUrl,
  // verifySignedUrl переэкспортируем — routes/images.js использует ту же
  // проверку что и аудио (тот же секрет, тот же алгоритм).
  verifySignedUrl,
};
