import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Кнопка записи голосового сообщения (задача 4.12).
///
/// ПРОДУКТОВОЕ ПРАВИЛО: показывается ТОЛЬКО Анне (role=admin) — родитель
/// рендерит этот виджет лишь при isAdmin. Сама кнопка дополнительно ничего
/// не проверяет (бэк всё равно отклонит не-админа с VOICE_ADMIN_ONLY).
///
/// Поведение (как в Telegram, упрощённо — тап вместо hold):
/// - Тап по микрофону → запрос разрешения (iOS, лениво — Apple 5.1.1(i)) →
///   старт записи. AAC .m4a, 64 kbps, mono.
/// - Во время записи: красная пульсирующая точка + таймер MM:SS
///   (Apple 5.1.2(iii) — явный индикатор записи), кнопки «корзина» (отмена)
///   и «отправить» (стоп + upload через onSend).
/// - Автостоп на 180 сек (лимит бэка voiceService.MAX_DURATION_SEC).
/// - Waveform: семплируем амплитуду каждые ~N мс, нормализуем в 40 значений
///   0..100 (бэк требует ровно 40). Если семплов мало/много — ресемплим.
///
/// Разрешение микрофона: пакет record сам триггерит системный диалог при
/// первом start(). NSMicrophoneUsageDescription уже в Info.plist.
class VoiceRecorder extends StatefulWidget {
  const VoiceRecorder({super.key, required this.onSend});

  /// Вызывается когда запись завершена и подтверждена отправка.
  /// (filePath .m4a, durationSec, waveform 40×[0..100]).
  final void Function(String filePath, int durationSec, List<int> waveform)
      onSend;

  @override
  State<VoiceRecorder> createState() => _VoiceRecorderState();
}

class _VoiceRecorderState extends State<VoiceRecorder> {
  final AudioRecorder _recorder = AudioRecorder();

  bool _isRecording = false;
  bool _isBusy = false; // идёт старт/стоп — блокируем повторные тапы
  int _elapsedSec = 0;
  Timer? _ticker;

  /// Накопленные амплитуды (raw), потом ресемплим в 40 значений.
  final List<double> _amplitudes = [];
  Timer? _ampTimer;

  static const int _maxSec = 180; // = voiceService.MAX_DURATION_SEC

  @override
  void dispose() {
    _ticker?.cancel();
    _ampTimer?.cancel();
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    if (_isBusy || _isRecording) return;
    setState(() => _isBusy = true);

    try {
      final hasPermission = await _recorder.hasPermission();
      if (!hasPermission) {
        if (mounted) {
          setState(() => _isBusy = false);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text(
              'Нет доступа к микрофону. Разрешите в настройках iOS',
            ),
            backgroundColor: AppColors.error,
          ));
        }
        return;
      }

      final dir = await getTemporaryDirectory();
      final filePath =
          '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _recorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 64000,
          numChannels: 1,
          sampleRate: 44100,
        ),
        path: filePath,
      );

      _amplitudes.clear();
      _elapsedSec = 0;

      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _elapsedSec++);
        if (_elapsedSec >= _maxSec) {
          _stopAndSend();
        }
      });

      // Семплируем амплитуду ~5 раз/сек для waveform.
      _ampTimer = Timer.periodic(
        const Duration(milliseconds: 200),
        (_) async {
          try {
            final amp = await _recorder.getAmplitude();
            // amp.current в дБ (отрицательное, ~ -60..0). Нормализуем 0..1.
            final db = amp.current;
            final norm = ((db + 60) / 60).clamp(0.0, 1.0);
            _amplitudes.add(norm);
          } catch (_) {
            _amplitudes.add(0.0);
          }
        },
      );

      if (mounted) {
        setState(() {
          _isRecording = true;
          _isBusy = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isBusy = false;
          _isRecording = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Не удалось начать запись'),
          backgroundColor: AppColors.error,
        ));
      }
    }
  }

  /// Привести накопленные амплитуды к ровно 40 значениям 0..100.
  List<int> _buildWaveform() {
    const target = 40;
    if (_amplitudes.isEmpty) {
      return List<int>.filled(target, 8); // плоская линия-заглушка
    }
    final src = _amplitudes;
    final out = <int>[];
    for (var i = 0; i < target; i++) {
      // Усредняем «корзину» исходных семплов на каждый из 40 баров.
      final startF = i * src.length / target;
      final endF = (i + 1) * src.length / target;
      final start = startF.floor();
      final end = math.max(start + 1, endF.ceil()).clamp(0, src.length);
      double sum = 0;
      var cnt = 0;
      for (var j = start; j < end && j < src.length; j++) {
        sum += src[j];
        cnt++;
      }
      final avg = cnt > 0 ? sum / cnt : 0.0;
      // Лёгкий «пол», чтобы тихие места не были нулевыми барами.
      final v = (avg * 100).clamp(0, 100).round();
      out.add(v < 6 ? 6 : v);
    }
    return out;
  }

  Future<void> _stopAndSend() async {
    if (_isBusy || !_isRecording) return;
    setState(() => _isBusy = true);

    _ticker?.cancel();
    _ampTimer?.cancel();

    String? path;
    try {
      path = await _recorder.stop();
    } catch (_) {
      path = null;
    }

    final duration = _elapsedSec;
    final waveform = _buildWaveform();

    if (mounted) {
      setState(() {
        _isRecording = false;
        _isBusy = false;
        _elapsedSec = 0;
      });
    }

    if (path == null || duration < 1) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Запись слишком короткая'),
          backgroundColor: AppColors.error,
        ));
      }
      return;
    }

    widget.onSend(path, duration, waveform);
  }

  Future<void> _cancel() async {
    if (_isBusy || !_isRecording) return;
    setState(() => _isBusy = true);
    _ticker?.cancel();
    _ampTimer?.cancel();
    try {
      await _recorder.stop();
    } catch (_) {}
    if (mounted) {
      setState(() {
        _isRecording = false;
        _isBusy = false;
        _elapsedSec = 0;
      });
    }
  }

  String _fmt(int s) {
    final mm = (s ~/ 60).toString().padLeft(2, '0');
    final ss = (s % 60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    if (!_isRecording) {
      // Свёрнутое состояние — кнопка-микрофон.
      return Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: _isBusy ? null : _start,
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

    // Состояние записи: красная точка + таймер + отмена/отправить.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.delete_outline, color: AppColors.error),
            onPressed: _isBusy ? null : _cancel,
            tooltip: 'Отменить',
          ),
          // Пульсирующая красная точка — индикатор записи (Apple 5.1.2(iii)).
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
              onTap: _isBusy ? null : _stopAndSend,
              child: const SizedBox(
                width: 40,
                height: 40,
                child: Icon(Icons.send, size: 20, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Пульсирующая красная точка — визуальный индикатор активной записи.
class _RecDot extends StatefulWidget {
  const _RecDot();

  @override
  State<_RecDot> createState() => _RecDotState();
}

class _RecDotState extends State<_RecDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.3, end: 1.0).animate(_c),
      child: Container(
        width: 12,
        height: 12,
        decoration: const BoxDecoration(
          color: Color(0xFFE53935),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}
