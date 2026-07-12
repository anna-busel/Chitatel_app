import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../providers/player_provider.dart';

/// Мини-плеер — шоколадная полоска между контентом и таб-баром (MASTER 4.16).
///
/// Цвета (13.05.2026 v3 — шоколадные тона, согласовано с заказчиком):
/// фон AppColors.lightCoffee (#3A2018), белый текст (контраст 12.4:1),
/// метаданные white 0.75 (9.3:1), обложка 40×40, высота 64.
///
/// ⚠️ 12.07.2026 — ПОЛОСУ СТАЛО ВОЗМОЖНО ЗАКРЫТЬ.
/// Раньше мини-плеер висел ВЕЧНО: включила разбор, поставила на паузу, ушла в
/// клуб — полоса всё равно занимает место, и убрать её можно было только
/// перезапуском приложения. Теперь:
///
///   СВАЙП ВНИЗ → позиция сохраняется на сервер → воспроизведение
///   останавливается → полоса исчезает (handler.closePlayer()).
///
/// Открыла книгу снова — продолжит С ТОГО ЖЕ МЕСТА (прогресс лежит на сервере,
/// а closePlayer() перед остановкой принудительно сохраняет позицию — иначе
/// потерялся бы хвост с последнего автосохранения, они идут раз в 30 сек).
///
/// ПОЧЕМУ СВАЙП, А НЕ КРЕСТИК:
/// - крестик спорит с кнопкой play (два круглых элемента в ряд), выглядит
///   чужеродно на тёплой книжной полосе и на 64px забирает место у названия;
/// - Apple Podcasts закрывает мини-плеер ровно свайпом вниз — жест привычен.
/// ЧТОБЫ ЖЕСТ НЕ БЫЛ НЕВИДИМЫМ (главное возражение против свайпов):
/// - сверху по центру — «РУЧКА» (короткая чёрточка, как у шторок iOS): молчаливый
///   намёк «меня можно тянуть»;
/// - при ПЕРВОМ появлении плеера — подсказка «Смахните вниз, чтобы закрыть»
///   на 3 секунды. Показывается ОДИН РАЗ за всё время (флаг в SharedPreferences),
///   дальше полоса чистая. Постоянная подсказка превращается в шум.
///
/// ЧТО СОЗНАТЕЛЬНО НЕ ДЕЛАЛИ:
/// - ПРОЗРАЧНОСТЬ: полупрозрачная полоса поверх скроллящегося списка = «грязь»,
///   контраст падает ниже WCAG. Красиво только с blur, а blur — самая дорогая
///   операция отрисовки (мы только что боролись с лагом ленты чата).
/// - КНОПКИ ПЕРЕМОТКИ ±15с: цели касания стали бы меньше 44×44 (требование
///   Apple), промах вёл бы к открытию плеера вместо перемотки. Мини-плеер —
///   напоминание, а не пульт.
/// - ВЫСОТА: 64 (пробовали 58 — узко).
///
/// Показывается ТОЛЬКО когда в плеере что-то загружено (`hasContent == true`).
class MiniPlayer extends ConsumerStatefulWidget {
  const MiniPlayer({super.key});

  static const double height = 64;

  /// Скругление верхних углов.
  static const double topRadius = 14;

  /// Толщина полоски прогресса.
  static const double progressHeight = 2;

  /// Ключ разовой подсказки про свайп.
  static const String hintPrefsKey = 'mini_player_swipe_hint_seen';

  @override
  ConsumerState<MiniPlayer> createState() => _MiniPlayerState();
}

class _MiniPlayerState extends ConsumerState<MiniPlayer> {
  bool _showHint = false;
  bool _hintChecked = false;
  Timer? _hintTimer;

  @override
  void dispose() {
    _hintTimer?.cancel();
    super.dispose();
  }

  /// Показать подсказку про свайп — один раз за всё время.
  Future<void> _maybeShowHint() async {
    if (_hintChecked) return;
    _hintChecked = true;

    final prefs = await SharedPreferences.getInstance();
    final seen = prefs.getBool(MiniPlayer.hintPrefsKey) ?? false;
    if (seen || !mounted) return;

    setState(() => _showHint = true);
    await prefs.setBool(MiniPlayer.hintPrefsKey, true);

    _hintTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) setState(() => _showHint = false);
    });
  }

  Future<void> _close() async {
    // closePlayer(): сохраняет позицию → останавливает → забывает книгу.
    await ref.read(audioHandlerProvider).closePlayer();
  }

  @override
  Widget build(BuildContext context) {
    final stateAsync = ref.watch(playerUiStateProvider);

    return stateAsync.when(
      data: (state) {
        if (!state.hasContent) return const SizedBox.shrink();

        // Первое появление полосы — покажем подсказку (после кадра, чтобы не
        // дёргать setState во время build).
        WidgetsBinding.instance.addPostFrameCallback((_) => _maybeShowHint());

        return Dismissible(
          key: const ValueKey('mini-player'),
          direction: DismissDirection.down,
          // Полоса низкая — порог смахивания делаем мягким, иначе жест
          // придётся «дотягивать» и он будет казаться неотзывчивым.
          dismissThresholds: const {DismissDirection.down: 0.35},
          onDismissed: (_) => _close(),
          child: _MiniPlayerBar(state: state, showHint: _showHint),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _MiniPlayerBar extends ConsumerWidget {
  const _MiniPlayerBar({required this.state, required this.showHint});

  final PlayerUiState state;
  final bool showHint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final book = state.book!;

    const radius = BorderRadius.only(
      topLeft: Radius.circular(MiniPlayer.topRadius),
      topRight: Radius.circular(MiniPlayer.topRadius),
    );

    return Semantics(
      label: 'Сейчас играет: ${book.title}, ${state.partTitle}. '
          'Смахните вниз, чтобы закрыть',
      container: true,
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          color: AppColors.lightCoffee,
          child: InkWell(
            onTap: () => context.push(Routes.player(book.id)),
            child: SizedBox(
              height: MiniPlayer.height,
              child: Stack(
                children: [
                  Column(
                    children: [
                      // Полоска прогресса части — тонкая, во всю ширину.
                      _ProgressLine(progress: state.progress),

                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(14, 6, 14, 8),
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
                              // Название + часть/время (или подсказка)
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
                                    AnimatedSwitcher(
                                      duration:
                                          const Duration(milliseconds: 250),
                                      child: showHint
                                          ? Text(
                                              'Смахните вниз, чтобы закрыть',
                                              key: const ValueKey('hint'),
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: AppColors.terracotta
                                                    .withOpacity(0.95),
                                                fontWeight: FontWeight.w600,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            )
                                          : Text(
                                              '${state.partTitle} · ${_formatTime(state.position)}',
                                              key: const ValueKey('meta'),
                                              style: TextStyle(
                                                fontSize: 11,
                                                color: Colors.white
                                                    .withOpacity(0.75),
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
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

                  // «Ручка» — намёк, что полосу можно потянуть вниз.
                  Positioned(
                    top: MiniPlayer.progressHeight + 3,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        width: 32,
                        height: 3,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.30),
                          borderRadius: BorderRadius.circular(2),
                        ),
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
              Container(color: Colors.white.withOpacity(0.12)),
              Container(width: width, color: AppColors.terracotta),
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
