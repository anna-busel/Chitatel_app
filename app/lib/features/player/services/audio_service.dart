import 'dart:async';
import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:rxdart/rxdart.dart';
import '../../../shared/models/book_model.dart';
import 'cover_cache.dart';
import 'player_api_service.dart';
import 'progress_service.dart';

/// AudioHandler — ядро аудиоплеера приложения ЧИТАТЕЛЬ.
///
/// Инициализируется один раз при старте приложения через `AudioService.init()`
/// (см. main.dart). После инициализации доступен через [ChitatelAudioHandler.instance].
///
/// MASTER 4.15-4.19, STEP-BY-STEP 2.7.
///
/// Что делает:
/// 1. Управляет `just_audio` AudioPlayer (play/pause/seek/speed).
/// 2. Транслирует состояние в `audio_service` PlaybackState (lock screen,
///    Control Center, Apple Watch, CarPlay).
/// 3. Настраивает AVAudioSession через `audio_session` (категория `.playback`)
///    — обязательно для iOS Background Audio (Apple Guideline 6.10).
/// 4. Загружает signed URL через PlayerApiService (TTL 1 час).
/// 5. При истечении signed URL (410/403) перезапрашивает и продолжает с позиции.
/// 6. Сохраняет прогресс через ProgressService каждые 30 сек воспроизведения
///    + при pause/dispose + при автопереходе + при закрытии плеера.
/// 7. Автоматически переключает части (часть 1 → 2 → 3 ...) при окончании.
/// 8. Sleep timer: 15/30/45/60 мин или до конца части.
/// 9. ПРЕВЬЮ-режим (loadPreview): проигрывает 5-мин тизер платного разбора БЕЗ
///    записи в прогресс; когда отрывок кончается — шлёт событие в paywallStream
///    (экран плеера показывает шторку покупки). Отказ в доступе к платной части
///    (403) — тоже шлёт это событие.
class ChitatelAudioHandler extends BaseAudioHandler with SeekHandler {
  ChitatelAudioHandler({
    required PlayerApiService apiService,
    required ProgressService progressService,
    required CoverCache coverCache,
  })  : _apiService = apiService,
        _progressService = progressService,
        _coverCache = coverCache {
    _init();
  }

  // — Synchronous singleton holder для доступа из main.dart / провайдеров —
  static ChitatelAudioHandler? _instance;
  static ChitatelAudioHandler get instance {
    final h = _instance;
    if (h == null) {
      throw StateError(
        'ChitatelAudioHandler не инициализирован. Вызовите initChitatelAudio() в main.dart.',
      );
    }
    return h;
  }

  static set instance(ChitatelAudioHandler handler) => _instance = handler;

  // — Зависимости —
  final PlayerApiService _apiService;
  final ProgressService _progressService;
  final CoverCache _coverCache;

  // — Плеер —
  final AudioPlayer _player = AudioPlayer();

  // — Текущий контекст воспроизведения —
  BookModel? _currentBook;
  int _currentPartNumber = 1;
  Uri? _currentArtUri;

  /// Книга, которая сейчас загружена в плеер (null если ничего не играет).
  BookModel? get currentBook => _currentBook;
  int get currentPartNumber => _currentPartNumber;

  // — Превью-режим (тизер платного разбора) —
  // В превью НЕ пишем прогресс и НЕ переходим на следующую часть: когда 5-мин
  // отрывок кончается, шлём событие в paywallStream, и экран плеера показывает
  // шторку покупки.
  bool _previewMode = false;
  bool get isPreviewMode => _previewMode;

  // Куда вернуться после успешной покупки: часть + позиция (сек). Для превью —
  // часть 1 с секунды, где кончился отрывок; для платной части — её начало.
  int? _resumePart;
  int _resumePosition = 0;

  // — События «нужна покупка» (превью кончилось / упёрся в платную часть) —
  final _paywallController = StreamController<BookModel>.broadcast();

  /// Экран плеера слушает и показывает шторку покупки.
  Stream<BookModel> get paywallStream => _paywallController.stream;

  // — Таймер сохранения прогресса (каждые 30 сек) —
  Timer? _progressSaveTimer;
  static const Duration _progressSaveInterval = Duration(seconds: 30);

  // — Sleep timer —
  Timer? _sleepCountdownTimer;
  DateTime? _sleepEndsAt;
  bool _sleepUntilEndOfPart = false;

  /// Время окончания sleep таймера, если активен. Иначе null.
  DateTime? get sleepEndsAt => _sleepEndsAt;
  bool get sleepUntilEndOfPart => _sleepUntilEndOfPart;

  // — Стрим оставшегося времени sleep таймера для UI (тикает каждую секунду) —
  final _sleepRemainingController = BehaviorSubject<Duration?>.seeded(null);
  ValueStream<Duration?> get sleepRemainingStream =>
      _sleepRemainingController.stream;

  // — Защита от повторной обработки одной и той же ошибки 410 —
  bool _isRecovering = false;

  // — Подписки —
  StreamSubscription<PlayerState>? _playerStateSub;
  StreamSubscription<Duration?>? _durationSub;
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<PlaybackEvent>? _eventSub;

  // ─────────────────────────── ИНИЦИАЛИЗАЦИЯ ───────────────────────────

  Future<void> _init() async {
    // 1. AVAudioSession для iOS background audio.
    try {
      final session = await AudioSession.instance;
      await session.configure(const AudioSessionConfiguration.music());
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AudioHandler] AudioSession.configure failed: $e');
      }
    }

    // 2. Подписки на стримы плеера.
    _playerStateSub = _player.playerStateStream.listen(_onPlayerStateChanged);
    _durationSub = _player.durationStream.listen(_onDurationChanged);
    _positionSub = _player.positionStream.listen(_onPositionChanged);
    _player.processingStateStream.listen(_onProcessingStateChanged);

    // 3. Обработка ошибок плеера — для перезапроса signed URL при 410.
    _eventSub = _player.playbackEventStream.listen(
      (_) {},
      onError: _onPlaybackError,
    );
  }

  // ─────────────────────────── ЗАГРУЗКА КНИГИ ───────────────────────────

  /// Загружает книгу в плеер.
  Future<void> loadBook(
    BookModel book, {
    int? startPartNumber,
    int? startPositionSeconds,
    bool autoPlay = true,
  }) async {
    if (book.parts.isEmpty) {
      if (kDebugMode) {
        debugPrint('[AudioHandler] loadBook: parts пустой для ${book.title}');
      }
      return;
    }

    // Сохраняем прогресс предыдущей книги (если была). Выходим из превью-режима
    // — дальше настоящее воспроизведение, прогресс снова пишется.
    await _flushProgress();
    _previewMode = false;

    // Если стартовая часть/позиция не заданы — запрашиваем прогресс с сервера.
    int targetPart = startPartNumber ?? 1;
    int targetPosition = startPositionSeconds ?? 0;
    if (startPartNumber == null && startPositionSeconds == null) {
      final progress = await _progressService.fetchProgress(book.id);
      targetPart = progress.currentPartNumber;
      targetPosition = progress.positionSeconds;
      // Если часть из прогресса не существует в книге — начинаем с первой.
      final partExists = book.parts.any((p) => p.number == targetPart);
      if (!partExists) {
        targetPart = book.parts.first.number;
        targetPosition = 0;
      }
    }

    _currentBook = book;
    _currentPartNumber = targetPart;

    // Готовим artUri для lock screen.
    _currentArtUri = await _coverCache.resolveArtUri(book.coverImageUrl);

    await _loadPart(
      partNumber: targetPart,
      startPositionSeconds: targetPosition,
      autoPlay: autoPlay,
    );
  }

  /// Загружает 5-мин ПРЕВЬЮ платного разбора (тизер без покупки).
  ///
  /// НЕ пишет прогресс и не помечает части прослушанными. Когда отрывок
  /// кончится — _onPreviewEnded шлёт событие в paywallStream, и экран плеера
  /// показывает шторку покупки.
  ///
  /// Контекст (_currentBook/_previewMode) выставляется СИНХРОННО до await —
  /// чтобы экран плеера при открытии увидел, что эта книга уже загружена
  /// (превью), и не перегрузил её как обычную (loadBook).
  Future<void> loadPreview(BookModel book) async {
    // Фиксируем контекст СИНХРОННО (до любого await): экран плеера при открытии
    // должен увидеть превью-режим и НЕ перегрузить книгу как обычную (loadBook).
    final prevBook = _currentBook;
    final prevWasPreview = _previewMode;
    final prevPart = _currentPartNumber;
    final prevPos = _player.position.inSeconds;

    _previewMode = true;
    _currentBook = book;
    _currentPartNumber = 1;
    _resumePart = 1;
    _resumePosition = book.previewDuration > 0 ? book.previewDuration : 300;

    // Сохранить прогресс прошлого РЕАЛЬНОГО воспроизведения (в превью — нет).
    if (!prevWasPreview && prevBook != null) {
      await _progressService.saveProgress(
        bookId: prevBook.id,
        currentPartNumber: prevPart,
        positionSeconds: prevPos,
      );
    }

    _currentArtUri = await _coverCache.resolveArtUri(book.coverImageUrl);

    try {
      final audio = await _apiService.fetchPreviewUrl(bookId: book.id);

      mediaItem.add(MediaItem(
        id: '${book.id}_preview',
        album: book.author,
        title: 'Превью',
        artist: book.title,
        duration: Duration(seconds: audio.duration),
        artUri: _currentArtUri,
        extras: {'bookId': book.id, 'preview': true},
      ));

      await _player.setUrl(audio.audioUrl);
      await _player.play();
      // Прогресс-таймер в превью НЕ запускаем.
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AudioHandler] loadPreview failed: $e');
      }
      // Превью не загрузилось (сеть/404) — показываем шторку, чтобы плеер не
      // завис пустым: человек всё равно сможет купить.
      _paywallController.add(book);
    }
  }

  /// Загружает конкретную часть текущей книги.
  Future<void> _loadPart({
    required int partNumber,
    int startPositionSeconds = 0,
    bool autoPlay = true,
  }) async {
    final book = _currentBook;
    if (book == null) return;
    final part = book.parts.firstWhere(
      (p) => p.number == partNumber,
      orElse: () => book.parts.first,
    );

    _currentPartNumber = part.number;

    // Получаем signed URL.
    try {
      final audio = await _apiService.fetchAudioUrl(
        bookId: book.id,
        partNumber: part.number,
      );

      // Обновляем MediaItem для lock screen / Control Center.
      mediaItem.add(MediaItem(
        id: '${book.id}_${part.number}',
        album: book.author,
        title: part.title.isNotEmpty ? part.title : 'Часть ${part.number}',
        artist: book.title,
        duration: Duration(seconds: part.duration),
        artUri: _currentArtUri,
        extras: {
          'bookId': book.id,
          'partNumber': part.number,
        },
      ));

      // Загружаем URL в плеер с восстановлением позиции.
      await _player.setUrl(
        audio.audioUrl,
        initialPosition: Duration(seconds: startPositionSeconds),
      );

      if (autoPlay) {
        await _player.play();
      }

      _startProgressTimer();
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AudioHandler] _loadPart failed: $e');
      }
      // Отказ в доступе (платная часть без покупки/подписки) — просим показать
      // шторку покупки. Отличаем от сетевых ошибок по 403/PURCHASE_REQUIRED.
      // Истечение signed URL (410) сюда не относится — им занимается
      // _onPlaybackError (перезапрос уже загруженного URL).
      final s = e.toString();
      if (s.contains('403') ||
          s.contains('PURCHASE_REQUIRED') ||
          s.contains('Forbidden')) {
        _resumePart = part.number;
        _resumePosition = startPositionSeconds;
        _paywallController.add(book);
      }
    }
  }

  // ─────────────────────────── ОБРАБОТКА ОШИБОК URL ───────────────────────────

  Future<void> _onPlaybackError(Object error, StackTrace stack) async {
    if (kDebugMode) {
      debugPrint('[AudioHandler] playback error: $error');
    }

    if (_isRecovering) return; // защита от бесконечного цикла

    final book = _currentBook;
    if (book == null) return;

    final errorString = error.toString();
    final isUrlExpired = errorString.contains('410') ||
        errorString.contains('403') ||
        errorString.contains('Gone') ||
        errorString.contains('Forbidden');

    if (!isUrlExpired) return;

    _isRecovering = true;
    try {
      if (_previewMode) {
        // В превью перезапрашиваем ПРЕВЬЮ (не реальную часть).
        await loadPreview(book);
      } else {
        final savedPosition = _player.position;
        final wasPlaying = _player.playing;
        await _loadPart(
          partNumber: _currentPartNumber,
          startPositionSeconds: savedPosition.inSeconds,
          autoPlay: wasPlaying,
        );
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[AudioHandler] recovery failed: $e');
      }
    } finally {
      _isRecovering = false;
    }
  }

  // ─────────────────────────── СТАНДАРТНЫЕ КОМАНДЫ ───────────────────────────

  @override
  Future<void> play() async {
    await _player.play();
    _startProgressTimer();
  }

  @override
  Future<void> pause() async {
    await _player.pause();
    _stopProgressTimer();
    await _flushProgress();
  }

  @override
  Future<void> stop() async {
    await _flushProgress();
    _stopProgressTimer();
    _stopSleepTimer();
    await _player.stop();
    await super.stop();
  }

  /// ЗАКРЫТЬ ПЛЕЕР (свайп вниз по мини-плееру, 12.07.2026).
  ///
  /// ЗАЧЕМ ОТДЕЛЬНО ОТ `stop()`: `stop()` глушит звук, но НЕ забывает книгу —
  /// `_currentBook` остаётся, `mediaItem` остаётся, значит `hasContent` в
  /// PlayerUiState по-прежнему true и мини-плеер тут же возвращается на экран.
  /// Раньше убрать полосу было нельзя вообще: она висела до перезапуска
  /// приложения, даже если человек давно ушёл из плеера.
  ///
  /// ЧТО ДЕЛАЕТ (порядок важен):
  /// 1. СНАЧАЛА сохраняет позицию на сервер — иначе потерялся бы «хвост» с
  ///    последнего автосохранения (они идут раз в 30 секунд). Человек ждёт, что
  ///    вернувшись, продолжит ровно с того места, где закрыл.
  /// 2. Останавливает воспроизведение и таймеры.
  /// 3. ЗАБЫВАЕТ текущую книгу и чистит MediaItem (`mediaItem.add(null)`) —
  ///    именно это убирает мини-плеер с экрана и Now Playing с локскрина.
  ///
  /// Прогресс при этом НЕ стирается: он лежит на сервере (Progress), и при
  /// следующем открытии книги плеер сам подтянет часть и секунду.
  Future<void> closePlayer() async {
    await _flushProgress();

    _stopProgressTimer();
    _stopSleepTimer();
    await _player.stop();

    _currentBook = null;
    _currentPartNumber = 1;
    _currentArtUri = null;
    _previewMode = false;
    _resumePart = null;
    _resumePosition = 0;

    // Сбрасываем Now Playing — без этого мини-плеер вернётся.
    mediaItem.add(null);

    playbackState.add(playbackState.value.copyWith(
      processingState: AudioProcessingState.idle,
      playing: false,
    ));
  }

  @override
  Future<void> seek(Duration position) async {
    await _player.seek(position);
  }

  @override
  Future<void> fastForward() async {
    final current = _player.position;
    final newPos = current + const Duration(seconds: 15);
    final duration = _player.duration;
    if (duration != null && newPos >= duration) {
      await _player.seek(duration);
    } else {
      await _player.seek(newPos);
    }
  }

  @override
  Future<void> rewind() async {
    final current = _player.position;
    final newPos = current - const Duration(seconds: 15);
    if (newPos < Duration.zero) {
      await _player.seek(Duration.zero);
    } else {
      await _player.seek(newPos);
    }
  }

  @override
  Future<void> skipToNext() async {
    if (_previewMode) return; // в превью частей не листаем
    return _skipToPart(_currentPartNumber + 1);
  }

  @override
  Future<void> skipToPrevious() async {
    if (_previewMode) return;
    return _skipToPart(_currentPartNumber - 1);
  }

  /// Переключение на часть с номером [target].
  Future<void> _skipToPart(int target) async {
    final book = _currentBook;
    if (book == null) return;
    final partExists = book.parts.any((p) => p.number == target);
    if (!partExists) return;

    await _flushProgress();
    await _loadPart(partNumber: target, startPositionSeconds: 0, autoPlay: true);
  }

  /// Установить скорость воспроизведения (0.75, 1.0, 1.25, 1.5, 2.0).
  @override
  Future<void> setSpeed(double speed) async {
    await _player.setSpeed(speed);
  }

  /// Текущая скорость воспроизведения.
  double get speed => _player.speed;

  /// Продолжить после успешной покупки из шторки: выходим из превью-режима и
  /// грузим нужную часть с сохранённого места (для превью — часть 1 с секунды,
  /// где кончился отрывок; для платной части — её начало). Доступ теперь есть,
  /// прогресс снова пишется.
  Future<void> resumeAfterPurchase() async {
    final book = _currentBook;
    if (book == null) return;
    _previewMode = false;
    final part = _resumePart ?? 1;
    final pos = _resumePosition;
    _resumePart = null;
    _resumePosition = 0;
    await loadBook(
      book,
      startPartNumber: part,
      startPositionSeconds: pos,
      autoPlay: true,
    );
  }

  // ─────────────────────────── АВТОПЕРЕХОД ───────────────────────────

  void _onProcessingStateChanged(ProcessingState state) {
    if (state == ProcessingState.completed) {
      if (_previewMode) {
        _onPreviewEnded();
      } else {
        _onPartCompleted();
      }
    }
  }

  /// 5-мин превью закончилось — просим показать шторку покупки. Прогресс в
  /// превью не пишется; _resumePart/_resumePosition уже выставлены в loadPreview
  /// (часть 1 с секунды окончания отрывка).
  Future<void> _onPreviewEnded() async {
    final book = _currentBook;
    if (book == null) return;
    await _player.pause();
    _paywallController.add(book);
  }

  /// Часть закончилась естественным путём — переходим к следующей
  /// или останавливаемся если это последняя.
  Future<void> _onPartCompleted() async {
    final book = _currentBook;
    if (book == null) return;

    // Помечаем текущую часть как полностью прослушанную.
    await _progressService.saveProgress(
      bookId: book.id,
      currentPartNumber: _currentPartNumber,
      positionSeconds: 0,
      markPartCompleted: true,
    );

    // Sleep до конца части → остановка.
    if (_sleepUntilEndOfPart) {
      _stopSleepTimer();
      await pause();
      return;
    }

    // Ищем следующую часть.
    final sortedNumbers = book.parts.map((p) => p.number).toList()..sort();
    final currentIndex = sortedNumbers.indexOf(_currentPartNumber);
    if (currentIndex < 0 || currentIndex == sortedNumbers.length - 1) {
      // Последняя часть — стоп.
      await pause();
      return;
    }

    final nextNumber = sortedNumbers[currentIndex + 1];
    await _loadPart(
      partNumber: nextNumber,
      startPositionSeconds: 0,
      autoPlay: true,
    );
  }

  // ─────────────────────────── PLAYBACK STATE ───────────────────────────

  void _onPlayerStateChanged(PlayerState state) => _broadcastState();
  void _onDurationChanged(Duration? duration) => _broadcastState();
  void _onPositionChanged(Duration position) => _broadcastState();

  /// Передаёт текущее состояние в audio_service (lock screen, Control Center).
  void _broadcastState() {
    final playing = _player.playing;
    final processing = _player.processingState;

    playbackState.add(playbackState.value.copyWith(
      controls: [
        MediaControl.rewind,
        if (playing) MediaControl.pause else MediaControl.play,
        MediaControl.fastForward,
      ],
      systemActions: const {
        MediaAction.seek,
        MediaAction.seekForward,
        MediaAction.seekBackward,
      },
      androidCompactActionIndices: const [0, 1, 2],
      processingState: _mapProcessingState(processing),
      playing: playing,
      updatePosition: _player.position,
      bufferedPosition: _player.bufferedPosition,
      speed: _player.speed,
      queueIndex: 0,
    ));
  }

  AudioProcessingState _mapProcessingState(ProcessingState s) {
    switch (s) {
      case ProcessingState.idle:
        return AudioProcessingState.idle;
      case ProcessingState.loading:
        return AudioProcessingState.loading;
      case ProcessingState.buffering:
        return AudioProcessingState.buffering;
      case ProcessingState.ready:
        return AudioProcessingState.ready;
      case ProcessingState.completed:
        return AudioProcessingState.completed;
    }
  }

  // ─────────────────────────── ПУБЛИЧНЫЕ СТРИМЫ ДЛЯ UI ───────────────────────────

  /// Стрим позиции воспроизведения (для slider в плеере).
  Stream<Duration> get positionStream => _player.positionStream;

  /// Стрим состояния плеера (playing / processingState) для UI.
  Stream<PlayerState> get playerStateStream => _player.playerStateStream;

  /// Стрим длительности текущей части.
  Stream<Duration?> get durationStream => _player.durationStream;

  /// Стрим скорости воспроизведения (для PlayerUiState).
  Stream<double> get speedStream => _player.speedStream;

  /// Стрим текущего MediaItem (книга + часть) для UI mini-player.
  ValueStream<MediaItem?> get currentMediaItemStream =>
      mediaItem.stream.publishValueSeeded(mediaItem.value).autoConnect();

  /// Текущая позиция плеера (для синхронных запросов из UI).
  Duration get position => _player.position;

  /// Длительность текущей части (null пока загружается).
  Duration? get duration => _player.duration;

  /// true если плеер сейчас проигрывает.
  bool get playing => _player.playing;

  // ─────────────────────────── PROGRESS SAVE ───────────────────────────

  void _startProgressTimer() {
    if (_previewMode) return; // в превью прогресс не пишем
    _progressSaveTimer?.cancel();
    _progressSaveTimer = Timer.periodic(_progressSaveInterval, (_) {
      _flushProgress();
    });
  }

  void _stopProgressTimer() {
    _progressSaveTimer?.cancel();
    _progressSaveTimer = null;
  }

  /// Сохранить текущую позицию на сервер. В превью-режиме — НЕ сохраняем
  /// (тизер не должен попадать в «Продолжить слушать» / «Мой прогресс»).
  Future<void> _flushProgress() async {
    if (_previewMode) return;
    final book = _currentBook;
    if (book == null) return;
    await _progressService.saveProgress(
      bookId: book.id,
      currentPartNumber: _currentPartNumber,
      positionSeconds: _player.position.inSeconds,
    );
  }

  // ─────────────────────────── SLEEP TIMER ───────────────────────────

  /// Установить sleep timer на конкретную длительность.
  void setSleepTimer(Duration duration) {
    _stopSleepTimer();
    if (duration == Duration.zero) return;

    _sleepUntilEndOfPart = false;
    _sleepEndsAt = DateTime.now().add(duration);
    _sleepRemainingController.add(duration);

    _sleepCountdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final endsAt = _sleepEndsAt;
      if (endsAt == null) {
        timer.cancel();
        return;
      }
      final remaining = endsAt.difference(DateTime.now());
      if (remaining <= Duration.zero) {
        _sleepRemainingController.add(Duration.zero);
        _stopSleepTimer();
        pause();
      } else {
        _sleepRemainingController.add(remaining);
      }
    });
  }

  /// Включить sleep timer «до конца части».
  void setSleepUntilEndOfPart() {
    _stopSleepTimer();
    _sleepUntilEndOfPart = true;
    _sleepRemainingController.add(null); // UI отрисует «До конца части»
  }

  void _stopSleepTimer() {
    _sleepCountdownTimer?.cancel();
    _sleepCountdownTimer = null;
    _sleepEndsAt = null;
    _sleepUntilEndOfPart = false;
    _sleepRemainingController.add(null);
  }

  /// Отменить sleep timer (внешний вызов из UI).
  void cancelSleepTimer() => _stopSleepTimer();

  // ─────────────────────────── CLEANUP ───────────────────────────

  @override
  Future<void> onTaskRemoved() async {
    await _flushProgress();
    await super.onTaskRemoved();
  }

  /// Закрыть плеер и освободить ресурсы. Вызывается только при выходе
  /// из приложения целиком.
  Future<void> dispose() async {
    await _flushProgress();
    _stopProgressTimer();
    _stopSleepTimer();
    await _playerStateSub?.cancel();
    await _durationSub?.cancel();
    await _positionSub?.cancel();
    await _eventSub?.cancel();
    await _sleepRemainingController.close();
    await _paywallController.close();
    await _player.dispose();
  }
}

/// Инициализация AudioHandler через `AudioService.init()`.
/// Вызывается один раз в `main.dart` ДО `runApp()`.
Future<ChitatelAudioHandler> initChitatelAudio({
  required PlayerApiService apiService,
  required ProgressService progressService,
  required CoverCache coverCache,
}) async {
  final handler = await AudioService.init(
    builder: () => ChitatelAudioHandler(
      apiService: apiService,
      progressService: progressService,
      coverCache: coverCache,
    ),
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'app.chitatel.ios.audio',
      androidNotificationChannelName: 'ЧИТАТЕЛЬ — аудио',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: true,
    ),
  );
  ChitatelAudioHandler.instance = handler;
  return handler;
}
