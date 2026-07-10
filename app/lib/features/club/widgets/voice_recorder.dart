import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Виджет записи голосового сообщения (задача 4.12).
///
/// Показывается ТОЛЬКО Анне-admin. Продуктовое правило: голосовые отправляет
/// только ведущая (разборы, ответы голосом).
///
/// Запись: AAC в .m4a (encoder aacLc, 64 kbps, 44100) во временную
/// директорию. Параллельно семплируем амплитуду каждые 200мс и строим
/// waveform из 40 значений 0..100 (как ожидает бэк).
///
/// ⚠️ АПГРЕЙД 10.07.2026: пакет record 5.x. Класс AudioRecorder() (был
/// Record() в 4.x). Параметры записи передаются через RecordConfig в start()
/// (в 4.x — прямо в start). sampleRate вместо samplingRate. Остальной API
/// (hasPermission/getAmplitude/stop/dispose) совпадает.
///
/// Apple 5.1.2(iii): во время записи виден явный индикатор (красная точка +
/// таймер).
///
/// Лимит — 180 сек (совпадает с MAX_DURATION_SEC на бэке). На 180 сек
/// автостоп с автоотправкой.
class VoiceRecorder extends StatefulWidget {
  const VoiceRecorder({
    super.key,
    required this.onSend,
    this.onRecordingStateChanged,
  });

  /// Вызывается при отправке: путь к файлу .m4a, длительность сек, waveform[40].
  final void Function(String filePath, int durationSec, List<int> waveform)
      onSend;

  /// Сообщает родителю о смене состояния записи (true = идёт запись).
  final ValueChanged<bool>? onRecordingStateChanged;

  @override
  State<VoiceRecorder> createState() => _VoiceRecorderState();
}

class _VoiceRecorderState extends State<VoiceRecorder> {
  // record 5.x: класс AudioRecorder (был Record() в 4.x).
  final AudioRecorder _recorder = AudioRecorder();

  bool _isRecording = false;
  int _elapsedSec = 0;
  Timer? _ticker;
  Timer? _ampSampler;
  String? _filePath;

  /// Сырые амплитуды (0..1), собираем каждые 200мс, потом ресемплим в 40.
  final List<double> _amplitudes = [];

  static const int _maxSec = 180;

  @override
  void dispose() {
    _ticker?.cancel();
    _ampSampler?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  /// Меняем _isRecording + уведомляем родителя (для перестройки layout).
  void _setRecording(bool v) {
    setState(() => _isRecording = v);
    widget.onRecordingStateChanged?.call(v);
  }

  Future<void> _start() async {
    try {
      final hasPerm = await _recorder.hasPermission();
      if (!hasPerm) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Нет доступа к микрофону. Разрешите в настройках'),
            backgroundColor: AppColors.error,
          ));
        }
        return;
      }

      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      // record 5.x: параметры через RecordConfig, путь — отдельным аргументом.
      // sampleRate (5.x) вместо samplingRate (4.x).
      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 64000,
          sampleRate: 44100,
        ),
        path: path,
      );

      _filePath = path;
      _amplitudes.clear();
      _elapsedSec = 0;

      _setRecording(true);

      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _elapsedSec++);
        if (_elapsedSec >= _maxSec) {
          _stopAndSend();
        }
      });

      _ampSampler = Timer.periodic(
        const Duration(milliseconds: 200),
        (_) async {
          try {
            final amp = await _recorder.getAmplitude();
            // amp.current в дБ (отрицательное, ~-60..0). Нормируем в 0..1.
            final db = amp.current;
            final norm = ((db + 60) / 60).clamp(0.0, 1.0);
            _amplitudes.add(norm);
          } catch (_) {
            _amplitudes.add(0.0);
          }
        },
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Не удалось начать запись: $e'),
          backgroundColor: AppColors.error,
        ));
      }
    }
  }

  /// Ресемпл собранных амплитуд в ровно 40 значений 0..100 (как ждёт бэк).
  List<int> _buildWaveform() {
    const target = 40;
    if (_amplitudes.isEmpty) {
      return List<int>.filled(target, 6); // плоская линия-минимум
    }
    final result = <int>[];
    final n = _amplitudes.length;
    for (var i = 0; i < target; i++) {
      final start = (i * n / target).floor();
      final end = ((i + 1) * n / target).ceil().clamp(start + 1, n);
      double sum = 0;
      for (var j = start; j < end; j++) {
        sum += _amplitudes[j];
      }
      final avg = sum / (end - start);
      result.add((avg * 100).round().clamp(6, 100));
    }
    return result;
  }

  Future<void> _stopAndSend() async {
    _ticker?.cancel();
    _ampSampler?.cancel();

    final duration = _elapsedSec;
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      path = _filePath;
    }

    _setRecording(false);
    setState(() => _elapsedSec = 0);

    if (path == null) return;
    if (duration < 1) {
      _safeDelete(path);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Запись слишком короткая'),
          backgroundColor: AppColors.error,
        ));
      }
      return;
    }

    widget.onSend(path, duration, _buildWaveform());
  }

  Future<void> _cancel() async {
    _ticker?.cancel();
    _ampSampler?.cancel();
    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      path = _filePath;
    }
    if (path != null) _safeDelete(path);
    _setRecording(false);
    setState(() => _elapsedSec = 0);
  }

  void _safeDelete(String path) {
    try {
      final f = File(path);
      if (f.existsSync()) f.deleteSync();
    } catch (_) {/* не критично */}
  }

  String _fmt(int sec) {
    final m = (sec ~/ 60).toString();
    final s = (sec % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    if (!_isRecording) {
      return Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: _start,
          child: const SizedBox(
            width: 44,
            height: 44,
            child: Icon(
              Icons.mic_none,
              size: 24,
              color: AppColors.terracotta,
            ),
          ),
        ),
      );
    }

    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.delete_outline, color: AppColors.error),
            onPressed: _cancel,
            tooltip: 'Отменить запись',
          ),
          const _RecDot(),
          const SizedBox(width: 8),
          Text(
            _fmt(_elapsedSec),
            style: AppTypography.bodyMedium.copyWith(
              color: AppColors.textPrimary,
              fontFeatures: const [],
            ),
          ),
          const Spacer(),
          Text(
            'Идёт запись…',
            style: AppTypography.caption.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: AppColors.terracotta,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _stopAndSend,
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(Icons.arrow_upward,
                    size: 20, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Пульсирующая красная точка — индикатор активной записи.
class _RecDot extends StatefulWidget {
  const _RecDot();

  @override
  State<_RecDot> createState() => _RecDotState();
}

class _RecDotState extends State<_RecDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.35, end: 1.0).animate(_c),
      child: Container(
        width: 12,
        height: 12,
        decoration: const BoxDecoration(
          color: AppColors.error,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
