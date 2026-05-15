import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

/// Провайдер сервиса аудио-эндпоинтов плеера.
final playerApiServiceProvider = Provider<PlayerApiService>((ref) {
  return PlayerApiService(ref.read(apiClientProvider));
});

/// Ответ сервера на `GET /api/books/:id/audio/:partNumber`.
/// Соответствует server/src/routes/books.js → success({ audioUrl, duration, partNumber, title, isPreview }).
class AudioUrlResponse {
  const AudioUrlResponse({
    required this.audioUrl,
    required this.duration,
    required this.partNumber,
    required this.title,
    required this.isPreview,
  });

  /// Подписанный HTTP URL аудиофайла. TTL 1 час (AUDIO_URL_TTL_SECONDS на сервере).
  final String audioUrl;

  /// Длительность части в секундах.
  final int duration;

  final int partNumber;
  final String title;

  /// true если это превью платной книги (доступна без покупки).
  final bool isPreview;

  factory AudioUrlResponse.fromJson(Map<String, dynamic> json) {
    return AudioUrlResponse(
      audioUrl: json['audioUrl'] as String? ?? '',
      duration: (json['duration'] as num?)?.toInt() ?? 0,
      partNumber: (json['partNumber'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      isPreview: json['isPreview'] as bool? ?? false,
    );
  }
}

/// Сервис для получения signed URL'ов аудио.
///
/// Signed URL живёт 1 час (см. server/src/services/audio.service.js).
/// При истечении плеер получит 410 Gone — в этом случае player_provider
/// должен перезапросить URL и переустановить источник с сохранением позиции.
class PlayerApiService {
  PlayerApiService(this._api);
  final ApiClient _api;

  /// GET /api/books/:bookId/audio/:partNumber → подписанный URL.
  ///
  /// Возможные ошибки сервера (MASTER 7.5):
  /// - 404 BOOK_NOT_FOUND
  /// - 404 NOT_FOUND (часть не найдена или audioFilename отсутствует)
  /// - 403 PURCHASE_REQUIRED (платная часть без покупки/подписки)
  Future<AudioUrlResponse> fetchAudioUrl({
    required String bookId,
    required int partNumber,
  }) async {
    if (kDebugMode) {
      debugPrint('[PlayerApi] fetchAudioUrl: book=$bookId, part=$partNumber');
    }
    try {
      final response = await _api.dio.get(
        ApiEndpoints.bookAudio(bookId, partNumber),
      );
      final body = response.data as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>? ?? const {};
      final result = AudioUrlResponse.fromJson(data);
      if (kDebugMode) {
        debugPrint('[PlayerApi] got audioUrl: ${result.audioUrl}');
        debugPrint('[PlayerApi] duration=${result.duration}, isPreview=${result.isPreview}');
      }
      return result;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[PlayerApi] fetchAudioUrl FAILED: $e');
      }
      rethrow;
    }
  }
}
