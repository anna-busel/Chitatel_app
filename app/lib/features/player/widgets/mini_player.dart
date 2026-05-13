import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../providers/player_provider.dart';

/// Мини-плеер — тёмная полоска между контентом и таб-баром (MASTER 4.16).
///
/// Цвета — точный матч прототипа v4.2 (строка 1099):
/// - background: AppColors.darkCoffee (#1A0E08)
/// - текст: белый
/// - кнопка play: обводка rgba(255,255,255,0.8)
/// - обложка: 40×40
///
/// Apple HIG → Persistent Playback Controls: «Provide a Now Playing indicator
/// so people always know media is playing and can quickly access controls».
/// Контраст белого на #1A0E08 = 18.7:1 (WCAG AA минимум 4.5:1).
///
/// Показывается ТОЛЬКО когда в плеере что-то загружено (`hasContent == true`).
/// Если ничего не играет — возвращает SizedBox.shrink (нулевая высота).
class MiniPlayer extends ConsumerWidget {
  const MiniPlayer({super.key});

  static const double height = 64;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stateAsync = ref.watch(playerUiStateProvider);

    return stateAsync.when(
      data: (state) {
        if (!state.hasContent) return const SizedBox.shrink();
        return _MiniPlayerBar(state: state);
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _MiniPlayerBar extends ConsumerWidget {
  const _MiniPlayerBar({required this.state});

  final PlayerUiState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final book = state.book!;
    return Semantics(
      label: 'Сейчас играет: ${book.title}, ${state.partTitle}',
      container: true,
      child: Material(
        color: AppColors.darkCoffee,
        child: InkWell(
          onTap: () => context.push(Routes.player(book.id)),
          child: Container(
            height: MiniPlayer.height,
            color: AppColors.darkCoffee,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Row(
              children: [
                // Миниатюра обложки
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: BookCoverImage(
                    imageUrl: book.coverImageUrl,
                    gradientColors: book.coverGradientColors,
                    label: book.coverLabel,
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                  ),
                ),
                const SizedBox(width: 10),
                // Название + часть + время
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        book.title,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${state.partTitle} · ${_formatTime(state.position)}',
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withOpacity(0.4),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Кнопка play/pause с обводкой (как в прототипе)
                _PlayPauseButton(playing: state.playing),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Круглая кнопка play/pause с белой обводкой.
/// Точный матч прототипа v4.2 (строка 1102).
class _PlayPauseButton extends ConsumerWidget {
  const _PlayPauseButton({required this.playing});
  final bool playing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      label: playing ? 'Пауза' : 'Воспроизвести',
      button: true,
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () {
              final handler = ref.read(audioHandlerProvider);
              if (playing) {
                handler.pause();
              } else {
                handler.play();
              }
            },
            child: Center(
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Colors.white.withOpacity(0.8),
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  playing ? Icons.pause : Icons.play_arrow,
                  size: 18,
                  color: Colors.white.withOpacity(0.9),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Форматирует Duration в MM:SS или H:MM:SS.
String _formatTime(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  if (h > 0) return '$h:$m:$s';
  return '$m:$s';
}
