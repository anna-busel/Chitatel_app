const path = require('path');
const fs = require('fs');
const { Router } = require('express');
const config = require('../config');
const { verifySignedUrl } = require('../services/audio.service');
const { AppError } = require('../middleware/error');

const router = Router();

/**
 * GET /voice/<filename>?exp=<timestamp>&sig=<hex>
 *
 * Отдаёт голосовое сообщение чата клуба если signed URL валиден (4.12).
 * filename — относительный путь от AUDIO_BASE_PATH, например
 * 'voice-messages/<userId>/<uuid>.m4a'.
 *
 * Использует ту же verifySignedUrl что /audio и /images (тот же
 * AUDIO_SECRET). Голосовые до 3 мин / ~2 МБ — поддерживаем Range
 * (плеер just_audio на iOS любит делать Range-запросы при перемотке).
 *
 * Коды:
 * - 200 OK + файл (или 206 при Range)
 * - 403 Forbidden — подпись невалидна / путь вне basePath
 * - 410 Gone — токен истёк
 * - 404 Not Found — файла нет на диске
 *
 * Защита от path traversal — как в routes/audio.js / routes/images.js.
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
          'VOICE_URL_EXPIRED',
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
      throw new AppError('VOICE_NOT_FOUND', 'Голосовое не найдено', 404);
    }
    if (!stat.isFile()) {
      throw new AppError('VOICE_NOT_FOUND', 'Голосовое не найдено', 404);
    }

    const total = stat.size;
    const range = req.headers.range;

    // Range — частичная отдача (перемотка плеера).
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? parseInt(match[2], 10) : total - 1;
        if (start >= total || end >= total || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${total}`,
          });
          return res.end();
        }
        const chunkSize = end - start + 1;
        res.status(206);
        res.set({
          'Content-Type': 'audio/mp4',
          'Content-Length': chunkSize,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        });
        return fs
          .createReadStream(fullPath, { start, end })
          .pipe(res);
      }
    }

    res.status(200);
    res.set({
      'Content-Type': 'audio/mp4',
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    });
    return fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
