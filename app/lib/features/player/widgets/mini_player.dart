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
/// Содержит:
/// - Миниатюра обложки (40×40)
/// - Название книги + текущая часть (2 строки)
/// - Текущая позиция / длительность
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
        color: AppColors.cardBackground,
        child: InkWell(
          onTap: () => context.push(Routes.player(book.id)),
          child: Container(
            height: MiniPlayer.height,
            decoration: const BoxDecoration(
              color: AppColors.cardBackground,
              border: Border(
                top: BorderSide(color: AppColors.border, width: 1),
                bottom: BorderSide(color: AppColors.border, width: 0.5),
              ),
            ),
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
                // Название + часть + время
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        book.title,
                        style: AppTypography.bodyMedium.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${state.partTitle} · ${_formatTime(state.position)}',
                        style: AppTypography.caption,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Кнопка play/pause
                _PlayPauseButton(playing: state.playing),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

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
        child: IconButton(
          onPressed: () {
            final handler = ref.read(audioHandlerProvider);
            if (playing) {
              handler.pause();
            } else {
              handler.play();
            }
          },
          icon: Icon(
            playing ? Icons.pause : Icons.play_arrow,
            size: 28,
            color: AppColors.terracotta,
          ),
          padding: EdgeInsets.zero,
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
