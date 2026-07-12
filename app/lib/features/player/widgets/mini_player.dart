import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../providers/player_provider.dart';

/// Мини-плеер — шоколадная полоска между контентом и таб-баром (MASTER 4.16).
///
/// Цвета (13.05.2026 v3 — шоколадные тона, согласовано с заказчиком):
/// - background: AppColors.lightCoffee (#3A2018) — заметно светлее тёмного
///   низа развёрнутого плеера, явно выделяется на белом фоне приложения.
///   Тот же оттенок что в карточке «Клуб месяца» на главной.
/// - название книги: белый bold
/// - метаданные (часть + время): rgba(255,255,255,0.75) — контраст 9.3:1.
/// - кнопка play: обводка rgba(255,255,255,0.85)
/// - обложка: 40×40
///
/// ⚠️ 12.07.2026 — ВИЗУАЛЬНАЯ ПРАВКА (полоса казалась «плитой»):
/// 1. СКРУГЛЕНЫ ВЕРХНИЕ УГЛЫ (14px) — полоса читается как карточка, лежащая
///    поверх контента, а не как второй бар, приклеенный к таб-бару.
/// 2. ДОБАВЛЕНА ПОЛОСКА ПРОГРЕССА сверху (2px, терракота) — как в Apple
///    Podcasts/Spotify. Она визуально разбивает монолит И несёт пользу:
///    видно, сколько дослушано.
///
/// ЧТО СОЗНАТЕЛЬНО НЕ ДЕЛАЛИ:
/// - ПРОЗРАЧНОСТЬ: полупрозрачная полоса поверх скроллящегося списка = «грязь»
///   (под ней едут обложки и текст), контраст белого падает ниже нормы WCAG.
///   Красиво было бы только с blur («матовое стекло»), а blur — самая дорогая
///   операция отрисовки; мы только что боролись с лагом ленты чата. Не тот
///   размен. Цвет и контраст оставлены как есть.
/// - ВЫСОТА: оставлена 64 (пробовали 58 — узко).
/// - КНОПКИ ПЕРЕМОТКИ ±15с: на 64px в ряд с обложкой и названием цели касания
///   стали бы меньше 44×44 (требование Apple), а промах вёл бы к открытию
///   плеера вместо перемотки. Мини-плеер — напоминание, а не пульт: play/pause
///   + тап «открыть». Так же у Apple Podcasts, Spotify, Audible.
///
/// Apple HIG → Persistent Playback Controls: «Provide a Now Playing indicator
/// so people always know media is playing and can quickly access controls».
///
/// Показывается ТОЛЬКО когда в плеере что-то загружено (`hasContent == true`).
/// Если ничего не играет — возвращает SizedBox.shrink (нулевая высота).
class MiniPlayer extends ConsumerWidget {
  const MiniPlayer({super.key});

  static const double height = 64;

  /// Скругление верхних углов.
  static const double topRadius = 14;

  /// Толщина полоски прогресса.
  static const double progressHeight = 2;

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

    const radius = BorderRadius.only(
      topLeft: Radius.circular(MiniPlayer.topRadius),
      topRight: Radius.circular(MiniPlayer.topRadius),
    );

    return Semantics(
      label: 'Сейчас играет: ${book.title}, ${state.partTitle}',
      container: true,
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          color: AppColors.lightCoffee,
          child: InkWell(
            onTap: () => context.push(Routes.player(book.id)),
            child: SizedBox(
              height: MiniPlayer.height,
              child: Column(
                children: [
                  // Полоска прогресса части — тонкая, во всю ширину.
                  _ProgressLine(progress: state.progress),

                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
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
                                    color: Colors.white.withOpacity(0.75),
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          // Кнопка play/pause с обводкой
                          _PlayPauseButton(playing: state.playing),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Полоска прогресса текущей части (2px). Терракота на затемнённой подложке —
/// видно, сколько дослушано, без единого лишнего элемента управления.
class _ProgressLine extends StatelessWidget {
  const _ProgressLine({required this.progress});

  /// 0..1
  final double progress;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MiniPlayer.progressHeight,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth * progress.clamp(0.0, 1.0);
          return Stack(
            children: [
              // Подложка — чуть светлее фона полосы.
              Container(color: Colors.white.withOpacity(0.12)),
              // Заполнение.
              Container(
                width: width,
                color: AppColors.terracotta,
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Круглая кнопка play/pause с белой обводкой.
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
                    color: Colors.white.withOpacity(0.85),
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  playing ? Icons.pause : Icons.play_arrow,
                  size: 18,
                  color: Colors.white,
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
