const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream');
const { Router } = require('express');
const config = require('../config');
const logger = require('../config/logger');
const { verifySignedUrl } = require('../services/audio.service');
const { AppError } = require('../middleware/error');

const router = Router();

// Отдача файла через stream.pipeline — при обрыве соединения клиентом
// read stream закрывается (иначе течёт файловый дескриптор).
function sendStream(stream, res) {
  pipeline(stream, res, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      logger.warn('audio stream error', { error: err.message });
    }
  });
}

/**
 * GET /audio/<filename>?exp=<timestamp>&sig=<hex>
 *
 * Отдаёт MP3-файл если signed URL валиден.
 * Поддерживает HTTP Range requests (для seek и стриминга в плеере).
 *
 * Возвращает:
 * - 200 OK + полный файл (если без Range header)
 * - 206 Partial Content + часть файла (если Range header)
 * - 403 Forbidden — подпись невалидна или filename пустой
 * - 410 Gone — токен истёк (URL устарел, нужно запросить новый)
 * - 404 Not Found — файл не существует на диске
 * - 416 Range Not Satisfiable — Range header указывает на байты вне файла
 *
 * Внимание: путь к файлу собирается из AUDIO_BASE_PATH + filename.
 * Защита от path traversal: используется path.resolve и проверка что результат
 * остаётся внутри AUDIO_BASE_PATH.
 */
router.get(/^\/(.+)$/, async (req, res, next) => {
  try {
    // req.params[0] содержит всё что после /audio/ (включая слэши внутри)
    const filename = req.params[0];
    if (!filename) {
      throw new AppError('FORBIDDEN', 'Filename не указан', 403);
    }

    // Защита от path traversal: разрешаем только относительные пути без ../
    // path.resolve развернёт любые ../ и мы проверим что не вышли за basePath.
    const decodedFilename = decodeURIComponent(filename);
    const fullPath = path.resolve(config.audio.basePath, decodedFilename);
    const safeBasePath = path.resolve(config.audio.basePath);

    if (!fullPath.startsWith(safeBasePath + path.sep) && fullPath !== safeBasePath) {
      throw new AppError('FORBIDDEN', 'Недопустимый путь', 403);
    }

    // Проверка signed URL
    const { valid, reason } = verifySignedUrl(
      decodedFilename,
      req.query.exp,
      req.query.sig
    );
    if (!valid) {
      if (reason === 'expired') {
        throw new AppError('AUDIO_URL_EXPIRED', 'Ссылка устарела, запросите новую', 410);
      }
      throw new AppError('FORBIDDEN', 'Невалидная подпись', 403);
    }

    // Проверка существования файла
    let stat;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch (_err) {
      throw new AppError('AUDIO_NOT_FOUND', 'Аудиофайл не найден', 404);
    }
    if (!stat.isFile()) {
      throw new AppError('AUDIO_NOT_FOUND', 'Аудиофайл не найден', 404);
    }

    const fileSize = stat.size;
    const rangeHeader = req.headers.range;

    // — Без Range: отдаём весь файл целиком —
    if (!rangeHeader) {
      res.status(200);
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      });
      return sendStream(fs.createReadStream(fullPath), res);
    }

    // — С Range: парсим диапазон и отдаём partial content —
    // Формат заголовка: "bytes=0-1000" или "bytes=0-" или "bytes=1000-2000"
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      res.set('Content-Range', `bytes */${fileSize}`);
      throw new AppError('RANGE_INVALID', 'Невалидный Range header', 416);
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.set('Content-Range', `bytes */${fileSize}`);
      throw new AppError('RANGE_INVALID', 'Range вне размера файла', 416);
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    });
    return sendStream(fs.createReadStream(fullPath, { start, end }), res);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
