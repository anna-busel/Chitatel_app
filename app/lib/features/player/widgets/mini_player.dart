import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../providers/player_provider.dart';

/// Мини-плеер — полоска между контентом и таб-баром (MASTER 4.16).
///
/// Показывается ТОЛЬКО когда в плеере что-то загружено (`hasContent == true`).
/// Если ничего не играет — возвращает SizedBox.shrink (нулевая высота).
///
/// Цвета (прототип v4.2):
/// - Фон: AppColors.darkCoffee (#1A0E08) — solid тёмно-коричневый.
/// - Текст: белый, метаданные — белый 50% opacity.
/// - Кнопка play: обводка полупрозрачным белым, иконка белая.
///
/// Содержит:
/// - Миниатюра обложки (48×48)
/// - Название книги + текущая часть + время (2 строки)
/// - Кнопка play/pause
/// - Нажатие на любое место кроме кнопки → разворачивает плеер
///
/// Apple HIG → Persistent Playback Controls: «Provide a Now Playing indicator
/// so people always know media is playing and can quickly access controls».
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
          // splash на тёмном фоне — полупрозрачный белый.
          splashColor: Colors.white.withOpacity(0.08),
          highlightColor: Colors.white.withOpacity(0.04),
          child: Container(
            height: MiniPlayer.height,
            color: AppColors.darkCoffee,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                // Миниатюра обложки
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: BookCoverImage(
                    imageUrl: book.coverImageUrl,
                    gradientColors: book.coverGradientColors,
                    label: book.coverLabel,
                    width: 48,
                    height: 48,
                    borderRadius: 6,
                  ),
                ),
                const SizedBox(width: 12),
                // Название + часть + время — белый на тёмном фоне.
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        book.title,
                        style: AppTypography.bodyMedium.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${state.partTitle} · ${_formatTime(state.position)}',
                        style: AppTypography.caption.copyWith(
                          color: Colors.white.withOpacity(0.5),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Кнопка play/pause — обводка полупрозрачным белым.
                _PlayPauseButton(playing: state.playing),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Кнопка play/pause в стиле прототипа: круглая 32×32 с обводкой
/// rgba(255,255,255,0.8) и белой иконкой внутри.
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
        child: InkWell(
          onTap: () {
            final handler = ref.read(audioHandlerProvider);
            if (playing) {
              handler.pause();
            } else {
              handler.play();
            }
          },
          customBorder: const CircleBorder(),
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
              alignment: Alignment.center,
              child: Icon(
                playing ? Icons.pause : Icons.play_arrow,
                size: 18,
                color: Colors.white.withOpacity(0.9),
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
