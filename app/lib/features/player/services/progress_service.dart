import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';

/// Провайдер сервиса прогресса прослушивания.
final progressServiceProvider = Provider<ProgressService>((ref) {
  return ProgressService(
    ref.read(apiClientProvider),
    ref.read(secureStorageProvider),
  );
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
/// Два режима (задача 1.8 — гостевой режим, Apple 5.1.1(v)):
/// - **Авторизован** (есть токен) → сервер:
///   - GET /api/progress/:bookId — получить (сервер возвращает defaults если нет записи)
///   - POST /api/progress — сохранить
/// - **Гость** (нет токена) → локально в SharedPreferences (ключ
///   `guest_progress_<bookId>`). Так бесплатные разборы реально работают без
///   регистрации: позиция запоминается между сессиями. Раньше для гостя
///   POST уходил на сервер, получал 401 и тихо терялся — позиция не сохранялась.
///
/// Логика сервера (server/src/routes/progress.js):
/// - $inc totalListenedSeconds += delta только если currentPartNumber === previousPart
///   И positionSeconds > previousSeconds. То есть seek назад или смена части НЕ накапливает.
/// - upsert по (userId, bookId).
/// Локальный гостевой режим повторяет это же правило накопления.
///
/// Клиент шлёт сохранение:
/// - каждые 30 секунд во время воспроизведения
/// - при pause / dispose плеера
/// - при автопереходе на следующую часть (с markPartCompleted=true для предыдущей)
///
/// Ошибки тихо проглатываются (Apple HIG: не прерывать UX из-за фоновых операций).
/// В debug-режиме логируется через debugPrint для отладки.
class ProgressService {
  ProgressService(this._api, this._storage);
  final ApiClient _api;
  final SecureStorage _storage;

  /// Префикс ключа локального гостевого прогресса в SharedPreferences.
  static const String _guestKeyPrefix = 'guest_progress_';

  /// Получить прогресс по книге.
  /// Гость → читаем из локального хранилища; авторизован → с сервера
  /// (сервер вернёт дефолты если записи нет).
  Future<PlaybackProgress> fetchProgress(String bookId) async {
    final hasTokens = await _storage.hasTokens();
    if (!hasTokens) {
      return _fetchGuestProgress(bookId);
    }

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
      // Сетевая ошибка — играем «с начала».
      return PlaybackProgress.empty(bookId);
    }
  }

  /// Сохранить прогресс. Гость → локально, авторизован → на сервер.
  /// Тихо проглатываем ошибки — это фоновая операция, она не должна ломать
  /// воспроизведение.
  Future<void> saveProgress({
    required String bookId,
    required int currentPartNumber,
    required int positionSeconds,
    bool markPartCompleted = false,
  }) async {
    final hasTokens = await _storage.hasTokens();
    if (!hasTokens) {
      await _saveGuestProgress(
        bookId: bookId,
        currentPartNumber: currentPartNumber,
        positionSeconds: positionSeconds,
        markPartCompleted: markPartCompleted,
      );
      return;
    }

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
      // Нет сети — игнорируем. При появлении сети следующий тик сохранит
      // актуальную позицию.
    }
  }

  // — Гостевой локальный прогресс (SharedPreferences). Задача 1.8 —

  Future<PlaybackProgress> _fetchGuestProgress(String bookId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString('$_guestKeyPrefix$bookId');
      if (raw == null) return PlaybackProgress.empty(bookId);
      final json = jsonDecode(raw) as Map<String, dynamic>;
      json['bookId'] = bookId;
      return PlaybackProgress.fromJson(json);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ProgressService] guest fetchProgress($bookId) failed: $e');
      }
      return PlaybackProgress.empty(bookId);
    }
  }

  Future<void> _saveGuestProgress({
    required String bookId,
    required int currentPartNumber,
    required int positionSeconds,
    required bool markPartCompleted,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final key = '$_guestKeyPrefix$bookId';

      // Предыдущее состояние нужно для накопления totalListenedSeconds и
      // списка прослушанных частей по тому же правилу, что на сервере.
      Map<String, dynamic> prev = const {};
      final prevRaw = prefs.getString(key);
      if (prevRaw != null) {
        try {
          prev = jsonDecode(prevRaw) as Map<String, dynamic>;
        } catch (_) {
          prev = const {};
        }
      }

      final prevPart =
          (prev['currentPartNumber'] as num?)?.toInt() ?? currentPartNumber;
      final prevPos = (prev['positionSeconds'] as num?)?.toInt() ?? 0;
      var total = (prev['totalListenedSeconds'] as num?)?.toInt() ?? 0;
      // Накапливаем только при той же части и движении позиции вперёд
      // (seek назад или смена части не накапливает) — как на сервере.
      if (currentPartNumber == prevPart && positionSeconds > prevPos) {
        total += positionSeconds - prevPos;
      }

      final listenedRaw = prev['listenedPartNumbers'];
      final listened = listenedRaw is List
          ? listenedRaw.map((e) => (e as num).toInt()).toList()
          : <int>[];
      if (markPartCompleted && !listened.contains(currentPartNumber)) {
        listened.add(currentPartNumber);
      }

      final data = {
        'bookId': bookId,
        'currentPartNumber': currentPartNumber,
        'positionSeconds': positionSeconds,
        'listenedPartNumbers': listened,
        'totalListenedSeconds': total,
        'lastListenedAt': DateTime.now().toUtc().toIso8601String(),
      };
      await prefs.setString(key, jsonEncode(data));
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ProgressService] guest saveProgress($bookId) failed: $e');
      }
    }
  }
}
