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
    final response = await _api.dio.get(
      ApiEndpoints.bookAudio(bookId, partNumber),
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    return AudioUrlResponse.fromJson(data);
  }
}
