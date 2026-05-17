import 'dart:async';
import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Плеер голосового сообщения в bubble (задача 4.12).
///
/// Кнопка play/pause + waveform (40 баров из message.voiceWaveform) с
/// прогрессом воспроизведения + длительность. Использует just_audio
/// (уже в проекте из 2.7 — отдельный AudioPlayer на каждое голосовое,
/// освобождается в dispose).
///
/// Цвета подстраиваются под bubble: своё сообщение (terracotta фон) —
/// белые элементы; чужое — terracotta на светлом.
///
/// signed URL voiceUrl живёт 1 час; если истёк (403/410) — показываем
/// «запись недоступна» (перезагрузка истории перевыпустит URL — как у
/// картинок). Не усложняем авто-рефетчем здесь.
class VoicePlayer extends StatefulWidget {
  const VoicePlayer({
    super.key,
    required this.url,
    required this.durationSec,
    required this.waveform,
    required this.isMine,
  });

  final String url;
  final int durationSec;
  final List<int> waveform; // 40 значений 0..100
  final bool isMine;

  @override
  State<VoicePlayer> createState() => _VoicePlayerState();
}

class _VoicePlayerState extends State<VoicePlayer> {
  final AudioPlayer _player = AudioPlayer();

  bool _loaded = false;
  bool _failed = false;
  bool _playing = false;
  Duration _position = Duration.zero;
  Duration _total = Duration.zero;

  StreamSubscription<PlayerState>? _stateSub;
  StreamSubscription<Duration>? _posSub;

  @override
  void initState() {
    super.initState();
    _total = Duration(seconds: widget.durationSec);
    _init();
  }

  Future<void> _init() async {
    try {
      await _player.setUrl(widget.url);
      _total = _player.duration ?? _total;

      _stateSub = _player.playerStateStream.listen((s) {
        if (!mounted) return;
        final isPlaying = s.playing &&
            s.processingState != ProcessingState.completed;
        setState(() => _playing = isPlaying);
        if (s.processingState == ProcessingState.completed) {
          _player.seek(Duration.zero);
          _player.pause();
          if (mounted) {
            setState(() {
              _playing = false;
              _position = Duration.zero;
            });
          }
        }
      });

      _posSub = _player.positionStream.listen((p) {
        if (!mounted) return;
        setState(() => _position = p);
      });

      if (mounted) setState(() => _loaded = true);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _posSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  void _toggle() {
    if (_failed) return;
    if (_playing) {
      _player.pause();
    } else {
      _player.play();
    }
  }

  String _fmt(Duration d) {
    final mm = (d.inSeconds ~/ 60).toString().padLeft(2, '0');
    final ss = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final accent = widget.isMine ? Colors.white : AppColors.terracotta;
    final dim = widget.isMine
        ? Colors.white.withOpacity(0.4)
        : AppColors.terracotta.withOpacity(0.3);
    final textColor =
        widget.isMine ? Colors.white70 : AppColors.textSecondary;

    if (_failed) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 18, color: textColor),
          const SizedBox(width: 8),
          Text(
            'Запись недоступна',
            style: AppTypography.body.copyWith(color: textColor),
          ),
        ],
      );
    }

    final totalMs = _total.inMilliseconds == 0
        ? widget.durationSec * 1000
        : _total.inMilliseconds;
    final progress = totalMs > 0
        ? (_position.inMilliseconds / totalMs).clamp(0.0, 1.0)
        : 0.0;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: _toggle,
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: accent,
              shape: BoxShape.circle,
            ),
            child: Icon(
              !_loaded
                  ? Icons.hourglass_empty
                  : (_playing ? Icons.pause : Icons.play_arrow),
              color: widget.isMine ? AppColors.terracotta : Colors.white,
              size: 22,
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 140,
          height: 32,
          child: GestureDetector(
            onTapDown: (d) {
              if (!_loaded) return;
              final w = 140.0;
              final frac = (d.localPosition.dx / w).clamp(0.0, 1.0);
              _player.seek(
                Duration(milliseconds: (totalMs * frac).round()),
              );
            },
            child: CustomPaint(
              painter: _WaveformPainter(
                waveform: widget.waveform,
                progress: progress,
                playedColor: accent,
                bgColor: dim,
              ),
              size: const Size(140, 32),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          _loaded && _playing
              ? _fmt(_position)
              : _fmt(Duration(seconds: widget.durationSec)),
          style: AppTypography.micro.copyWith(color: textColor),
        ),
      ],
    );
  }
}

/// Рисует 40 баров waveform. Сыгранная часть — playedColor, остаток — bgColor.
class _WaveformPainter extends CustomPainter {
  _WaveformPainter({
    required this.waveform,
    required this.progress,
    required this.playedColor,
    required this.bgColor,
  });

  final List<int> waveform; // 0..100
  final double progress; // 0..1
  final Color playedColor;
  final Color bgColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (waveform.isEmpty) return;
    final n = waveform.length;
    final gap = 2.0;
    final barW = (size.width - gap * (n - 1)) / n;
    final playedBars = (progress * n).round();

    for (var i = 0; i < n; i++) {
      final v = (waveform[i].clamp(0, 100)) / 100.0;
      final h = (size.height * v).clamp(3.0, size.height);
      final x = i * (barW + gap);
      final y = (size.height - h) / 2;
      final paint = Paint()
        ..color = i < playedBars ? playedColor : bgColor
        ..style = PaintingStyle.fill;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(x, y, barW, h),
        const Radius.circular(1.5),
      );
      canvas.drawRRect(rect, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _WaveformPainter old) =>
      old.progress != progress ||
      old.playedColor != playedColor ||
      old.bgColor != bgColor;
}
