import 'dart:async';
import 'package:audio_service/audio_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:just_audio/just_audio.dart';
import 'package:rxdart/rxdart.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../shared/models/book_model.dart';
import '../services/audio_service.dart';

/// Список доступных скоростей воспроизведения.
const List<double> kPlayerSpeeds = [0.75, 1.0, 1.25, 1.5, 2.0];

/// SharedPreferences ключ для сохранения скорости между сессиями.
/// Apple-стандарт: предпочтения юзера сохраняются (как в Apple Books, Audible).
const String _kSpeedPrefKey = 'player_speed';

/// Провайдер singleton-экземпляра AudioHandler.
/// Сам handler создаётся в main.dart до runApp().
final audioHandlerProvider = Provider<ChitatelAudioHandler>((ref) {
  return ChitatelAudioHandler.instance;
});

/// События «нужна покупка» из плеера: превью кончилось ИЛИ юзер упёрся в
/// платную часть (403). Экран плеера слушает и показывает шторку покупки.
final playerPaywallProvider = StreamProvider<BookModel>((ref) {
  return ref.watch(audioHandlerProvider).paywallStream;
});

/// Объединённое состояние плеера для UI.
class PlayerUiState {
  const PlayerUiState({
    required this.book,
    required this.partNumber,
    required this.position,
    required this.duration,
    required this.playing,
    required this.processingState,
    required this.speed,
  });

  /// null если в плеере ничего не загружено.
  final BookModel? book;

  final int partNumber;
  final Duration position;
  final Duration duration;
  final bool playing;
  final ProcessingState processingState;
  final double speed;

  /// true если что-то загружено в плеер (UI mini-player показывается).
  bool get hasContent => book != null;

  /// Заголовок текущей части (берём из book.parts по partNumber).
  String get partTitle {
    final b = book;
    if (b == null) return '';
    final part = b.parts.firstWhere(
      (p) => p.number == partNumber,
      orElse: () => const BookPart(number: 0, title: '', duration: 0),
    );
    return part.title.isNotEmpty ? part.title : 'Часть $partNumber';
  }

  /// Прогресс 0..1 для slider.
  double get progress {
    if (duration.inMilliseconds <= 0) return 0;
    final p = position.inMilliseconds / duration.inMilliseconds;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  static const empty = PlayerUiState(
    book: null,
    partNumber: 0,
    position: Duration.zero,
    duration: Duration.zero,
    playing: false,
    processingState: ProcessingState.idle,
    speed: 1.0,
  );
}

/// Главный стрим состояния плеера для UI.
///
/// Объединяет 5 стримов из ChitatelAudioHandler:
/// - playerState (playing + processingState)
/// - position
/// - duration
/// - speed (для немедленного отображения смены скорости в UI)
/// - currentMediaItem (триггер пересборки при смене книги/части)
///
/// Использовать в виджетах через `ref.watch(playerUiStateProvider)`.
final playerUiStateProvider = StreamProvider<PlayerUiState>((ref) {
  final handler = ref.watch(audioHandlerProvider);

  return Rx.combineLatest5<PlayerState, Duration, Duration?, double, MediaItem?,
      PlayerUiState>(
    handler.playerStateStream,
    handler.positionStream,
    handler.durationStream,
    handler.speedStream,
    handler.currentMediaItemStream,
    (playerState, position, duration, speed, _) {
      return PlayerUiState(
        book: handler.currentBook,
        partNumber: handler.currentPartNumber,
        position: position,
        duration: duration ?? Duration.zero,
        playing: playerState.playing,
        processingState: playerState.processingState,
        speed: speed,
      );
    },
  );
});

/// Стрим оставшегося времени sleep таймера (для UI).
/// null означает «таймер не активен» или «до конца части».
final sleepTimerRemainingProvider = StreamProvider<Duration?>((ref) {
  final handler = ref.watch(audioHandlerProvider);
  return handler.sleepRemainingStream;
});

/// Текущая скорость воспроизведения как StateNotifier-провайдер.
/// Сохраняется между сессиями через SharedPreferences.
///
/// Загружает сохранённую скорость при первой инициализации и применяет к плееру.
final playerSpeedProvider =
    StateNotifierProvider<PlayerSpeedNotifier, double>((ref) {
  return PlayerSpeedNotifier(ref.read(audioHandlerProvider));
});

class PlayerSpeedNotifier extends StateNotifier<double> {
  PlayerSpeedNotifier(this._handler) : super(1.0) {
    _restoreSpeed();
  }

  final ChitatelAudioHandler _handler;

  Future<void> _restoreSpeed() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getDouble(_kSpeedPrefKey);
      if (saved != null && kPlayerSpeeds.contains(saved)) {
        state = saved;
        await _handler.setSpeed(saved);
      }
    } catch (_) {
      // Игнорируем — оставляем 1.0x по умолчанию.
    }
  }

  /// Установить скорость и сохранить.
  Future<void> setSpeed(double speed) async {
    if (!kPlayerSpeeds.contains(speed)) return;
    state = speed;
    await _handler.setSpeed(speed);
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(_kSpeedPrefKey, speed);
    } catch (_) {
      // Не критично.
    }
  }
}
