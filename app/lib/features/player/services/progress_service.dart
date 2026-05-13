import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

/// Провайдер сервиса прогресса прослушивания.
final progressServiceProvider = Provider<ProgressService>((ref) {
  return ProgressService(ref.read(apiClientProvider));
});

/// Прогресс прослушивания книги (соответствует server/src/models/Progress.js).
class PlaybackProgress {
  const PlaybackProgress({
    required this.bookId,
    required this.currentPartNumber,
    required this.positionSeconds,
    required this.listenedPartNumbers,
    required this.totalListenedSeconds,
    this.lastListenedAt,
  });

  final String bookId;
  final int currentPartNumber;
  final int positionSeconds;

  /// Номера частей, отмеченных как полностью прослушанные (1-based).
  final List<int> listenedPartNumbers;

  /// Накопленные секунды реального прослушивания (используется в статистике 4.45).
  final int totalListenedSeconds;

  final DateTime? lastListenedAt;

  factory PlaybackProgress.fromJson(Map<String, dynamic> json) {
    final listenedRaw = json['listenedPartNumbers'];
    final listened = listenedRaw is List
        ? listenedRaw.map((e) => (e as num).toInt()).toList(growable: false)
        : const <int>[];

    final lastRaw = json['lastListenedAt'];
    DateTime? lastDate;
    if (lastRaw is String && lastRaw.isNotEmpty) {
      lastDate = DateTime.tryParse(lastRaw);
    }

    return PlaybackProgress(
      bookId: (json['bookId'] ?? '').toString(),
      currentPartNumber: (json['currentPartNumber'] as num?)?.toInt() ?? 1,
      positionSeconds: (json['positionSeconds'] as num?)?.toInt() ?? 0,
      listenedPartNumbers: listened,
      totalListenedSeconds: (json['totalListenedSeconds'] as num?)?.toInt() ?? 0,
      lastListenedAt: lastDate,
    );
  }

  /// Дефолт для книги без сохранённого прогресса (начать с части 1, позиция 0).
  factory PlaybackProgress.empty(String bookId) => PlaybackProgress(
        bookId: bookId,
        currentPartNumber: 1,
        positionSeconds: 0,
        listenedPartNumbers: const [],
        totalListenedSeconds: 0,
      );
}

/// Сервис прогресса прослушивания.
///
/// Эндпоинты:
/// - GET /api/progress/:bookId — получить (сервер возвращает defaults если нет записи)
/// - POST /api/progress — сохранить
///
/// Логика сервера (server/src/routes/progress.js):
/// - $inc totalListenedSeconds += delta только если currentPartNumber === previousPart
///   И positionSeconds > previousSeconds. То есть seek назад или смена части НЕ накапливает.
/// - upsert по (userId, bookId).
///
/// Клиент шлёт POST:
/// - каждые 30 секунд во время воспроизведения
/// - при pause / dispose плеера
/// - при автопереходе на следующую часть (с markPartCompleted=true для предыдущей)
///
/// Ошибки тихо проглатываются (Apple HIG: не прерывать UX из-за фоновых операций).
/// В debug-режиме логируется через debugPrint для отладки.
class ProgressService {
  ProgressService(this._api);
  final ApiClient _api;

  /// Получить прогресс по книге. Если записи нет — сервер вернёт дефолты.
  ///
  /// Все endpoint-ы прогресса требуют авторизацию. Для гостя (нет токена)
  /// сервер вернёт 401 — в этом случае возвращаем пустой прогресс локально.
  Future<PlaybackProgress> fetchProgress(String bookId) async {
    try {
      final response = await _api.dio.get(ApiEndpoints.progressByBook(bookId));
      final body = response.data as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>? ?? const {};
      final progressJson = data['progress'] as Map<String, dynamic>? ?? const {};
      return PlaybackProgress.fromJson(progressJson);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ProgressService] fetchProgress($bookId) failed: $e');
      }
      // Гость / сетевая ошибка / 401 — играем «с начала».
      return PlaybackProgress.empty(bookId);
    }
  }

  /// Сохранить прогресс. Тихо проглатываем ошибки — это фоновая операция,
  /// которая не должна ломать воспроизведение.
  Future<void> saveProgress({
    required String bookId,
    required int currentPartNumber,
    required int positionSeconds,
    bool markPartCompleted = false,
  }) async {
    try {
      await _api.dio.post(
        ApiEndpoints.progress,
        data: {
          'bookId': bookId,
          'currentPartNumber': currentPartNumber,
          'positionSeconds': positionSeconds,
          if (markPartCompleted) 'markPartCompleted': true,
        },
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint(
          '[ProgressService] saveProgress(book=$bookId, part=$currentPartNumber, pos=$positionSeconds) failed: $e',
        );
      }
      // Гость, нет сети, 401 — игнорируем. При появлении сети следующий тик
      // сохранит актуальную позицию.
    }
  }
}
