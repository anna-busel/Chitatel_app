const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const config = require('../config');
const { verifySignedUrl } = require('../services/audio.service');
const { AppError } = require('../middleware/error');

const router = Router();

// Расширение → Content-Type для отдачи.
const EXT_CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/**
 * GET /images/<filename>?exp=<timestamp>&sig=<hex>
 *
 * Отдаёт картинку чата клуба если signed URL валиден.
 * filename — относительный путь от AUDIO_BASE_PATH, например
 * 'club-images/<clubMonthId>/<uuid>.jpg'.
 *
 * Использует ту же verifySignedUrl что и /audio (тот же AUDIO_SECRET).
 * Картинки маленькие — Range requests не нужны, отдаём целиком.
 *
 * Коды:
 * - 200 OK + файл
 * - 403 Forbidden — подпись невалидна / путь вне basePath
 * - 410 Gone — токен истёк
 * - 404 Not Found — файла нет на диске
 *
 * Защита от path traversal — как в routes/audio.js (path.resolve + проверка
 * что результат внутри AUDIO_BASE_PATH).
 */
router.get(/^\/(.+)$/, async (req, res, next) => {
  try {
    const filename = req.params[0];
    if (!filename) {
      throw new AppError('FORBIDDEN', 'Filename не указан', 403);
    }

    const decodedFilename = decodeURIComponent(filename);
    const fullPath = path.resolve(config.audio.basePath, decodedFilename);
    const safeBasePath = path.resolve(config.audio.basePath);

    if (
      !fullPath.startsWith(safeBasePath + path.sep) &&
      fullPath !== safeBasePath
    ) {
      throw new AppError('FORBIDDEN', 'Недопустимый путь', 403);
    }

    const { valid, reason } = verifySignedUrl(
      decodedFilename,
      req.query.exp,
      req.query.sig
    );
    if (!valid) {
      if (reason === 'expired') {
        throw new AppError(
          'IMAGE_URL_EXPIRED',
          'Ссылка устарела, запросите новую',
          410
        );
      }
      throw new AppError('FORBIDDEN', 'Невалидная подпись', 403);
    }

    let stat;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch (_err) {
      throw new AppError('IMAGE_NOT_FOUND', 'Картинка не найдена', 404);
    }
    if (!stat.isFile()) {
      throw new AppError('IMAGE_NOT_FOUND', 'Картинка не найдена', 404);
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = EXT_CONTENT_TYPE[ext] || 'application/octet-stream';

    res.status(200);
    res.set({
      'Content-Type': contentType,
      'Content-Length': stat.size,
      // Картинки иммутабельны (uuid в имени) — можно кешировать надолго,
      // но signed URL живёт 1 час, поэтому private + max-age в пределах TTL.
      'Cache-Control': 'private, max-age=3600',
    });
    return fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
