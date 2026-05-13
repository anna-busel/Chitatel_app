import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

/// Провайдер кеша обложек для lock screen / Control Center.
final coverCacheProvider = Provider<CoverCache>((ref) => CoverCache());

/// Кеширует обложки книг для MediaItem.artUri.
///
/// Зачем нужно: MediaSession (iOS Now Playing) требует artUri в виде
/// http(s):// или file://. Flutter-ассеты типа `asset://book-covers/x.png`
/// нативный код прочитать не может — нужно скопировать байты в файл.
///
/// Apple HIG → Now Playing: «Provide artwork that represents your media».
/// Без обложки в lock screen приложение выглядит «недоделанным» (Guideline 4.0 risk).
///
/// Используется `getApplicationCacheDirectory()` (Library/Caches/) — Apple
/// официально рекомендует именно его для регенерируемых данных
/// (File System Programming Guide). iOS может почистить этот каталог
/// при нехватке места, но не во время работы приложения.
///
/// Логика resolveArtUri:
/// - http:// или https:// → отдаём как есть (нативный код сам загрузит)
/// - asset://book-covers/{slug}.png → копируем ассет в cache, кешируем путь, отдаём file://
/// - пусто → null (lock screen покажет иконку приложения по умолчанию)
class CoverCache {
  /// Кеш: ассет-путь → file:// URI.
  final Map<String, Uri> _assetCache = <String, Uri>{};

  /// Преобразует coverImageUrl книги в Uri, пригодный для MediaItem.artUri.
  ///
  /// Возвращает null если обложки нет или произошла ошибка чтения.
  /// Ошибки тихо проглатываются — обложка в lock screen опциональна.
  Future<Uri?> resolveArtUri(String coverImageUrl) async {
    if (coverImageUrl.isEmpty) return null;

    // HTTP(S) → как есть
    if (coverImageUrl.startsWith('http://') ||
        coverImageUrl.startsWith('https://')) {
      return Uri.tryParse(coverImageUrl);
    }

    // asset:// → копируем в cache с in-memory кешированием пути
    if (coverImageUrl.startsWith('asset://')) {
      final cached = _assetCache[coverImageUrl];
      if (cached != null) {
        // Проверяем что файл всё ещё на диске (iOS могла почистить Caches/
        // между запусками или при нехватке места).
        if (await File.fromUri(cached).exists()) {
          return cached;
        }
        _assetCache.remove(coverImageUrl);
      }
      return _copyAssetToCache(coverImageUrl);
    }

    // Неизвестный формат
    return null;
  }

  /// Копирует ассет в Application Cache Directory и возвращает file:// URI.
  /// Имя файла = последний сегмент пути ассета, чтобы избежать коллизий.
  Future<Uri?> _copyAssetToCache(String assetUrl) async {
    try {
      // asset://book-covers/slug.png → book-covers/slug.png
      final assetPath = assetUrl.replaceFirst('asset://', '');
      final byteData = await rootBundle.load(assetPath);

      // Library/Caches/ — Apple-рекомендованное место для регенерируемых данных.
      final cacheDir = await getApplicationCacheDirectory();
      final fileName = assetPath.split('/').last;
      final file = File('${cacheDir.path}/chitatel-cover-$fileName');

      await file.writeAsBytes(
        byteData.buffer.asUint8List(
          byteData.offsetInBytes,
          byteData.lengthInBytes,
        ),
        flush: true,
      );

      final uri = file.uri;
      _assetCache[assetUrl] = uri;
      return uri;
    } catch (_) {
      return null;
    }
  }
}
