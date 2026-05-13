import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:just_audio/just_audio.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../book/providers/book_provider.dart';
import '../providers/player_provider.dart';
import '../widgets/speed_sheet.dart';
import '../widgets/sleep_timer_sheet.dart';

/// Развёрнутый плеер (MASTER 4.15).
///
/// Открывается через `/player/:bookId`, может прийти с дополнительными
/// параметрами в `extra`: `{'startPart': int?, 'startPosition': int?}`.
///
/// Логика загрузки книги (см. _ensureBookLoaded):
/// - Книга не та же → loadBook с новыми параметрами.
/// - Та же книга + явный startPart другой → переключаем часть.
/// - Та же книга + startPart не задан или совпадает → ничего не делаем
///   (юзер пришёл из mini-player с той же книгой и частью).
///
/// Цвета: вертикальный градиент darkCoffee → #0D0705 (как в прототипе v4.2).
/// Status bar поверх плеера — светлые иконки (SystemUiOverlayStyle.light).
///
/// Закрытие: стрелка вниз в TopBar или swipe-down жест (стандарт iOS).
class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({
    super.key,
    required this.bookId,
    this.startPart,
    this.startPosition,
  });

  final String bookId;
  final int? startPart;
  final int? startPosition;

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends ConsumerState<PlayerScreen> {
  /// Нижняя точка градиента плеера. Локальная константа — используется
  /// только тут, в AppColors не добавляем чтобы не плодить лишние имена.
  /// Точный матч прототипа docs/prototype-v4_2.jsx.
  static const Color _gradientBottom = Color(0xFF0D0705);

  /// true если уже хотя бы раз вызывали _ensureBookLoaded для текущего билда.
  /// Защита от повторного срабатывания postFrameCallback в одной сессии экрана.
  bool _firstFrameProcessed = false;

  /// Загружает книгу в плеер с учётом widget.startPart / startPosition.
  ///
  /// Логика:
  /// 1. Книга НЕ та же что играет → handler.loadBook(...) с новыми параметрами.
  /// 2. Книга та же, но юзер явно попросил другую часть через extra → переключаем.
  /// 3. Книга та же, startPart не задан или совпадает с текущей → ничего
  ///    (юзер пришёл из mini-player продолжать слушать).
  Future<void> _ensureBookLoaded(BookModel book) async {
    final handler = ref.read(audioHandlerProvider);
    final current = handler.currentBook;

    // 1. Книга не та же — грузим заново.
    if (current == null || current.id != book.id) {
      await handler.loadBook(
        book,
        startPartNumber: widget.startPart,
        startPositionSeconds: widget.startPosition,
        autoPlay: true,
      );
      return;
    }

    // 2. Та же книга, но юзер явно попросил другую часть — переключаем.
    if (widget.startPart != null &&
        widget.startPart != handler.currentPartNumber) {
      await handler.loadBook(
        book,
        startPartNumber: widget.startPart,
        startPositionSeconds: widget.startPosition ?? 0,
        autoPlay: true,
      );
      return;
    }

    // 3. Та же книга, та же часть (или часть не указана) — оставляем как есть.
  }

  @override
  Widget build(BuildContext context) {
    final bookAsync = ref.watch(bookProvider(widget.bookId));

    // Status bar поверх плеера — светлые иконки. Возвращается к темным
    // автоматически когда AnnotatedRegion уходит со сцены (closing).
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.darkCoffee,
        body: Container(
          // Вертикальный градиент сверху-вниз: darkCoffee → почти чёрный.
          // Создаёт ощущение глубины, точный матч прототипа v4.2.
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [AppColors.darkCoffee, _gradientBottom],
            ),
          ),
          child: bookAsync.when(
            data: (book) {
              // Загружаем книгу один раз после первого билда с данными.
              // _firstFrameProcessed защищает от повторных вызовов в рамках
              // одного state, но при новом state (новый push) сработает заново.
              if (!_firstFrameProcessed) {
                _firstFrameProcessed = true;
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (mounted) _ensureBookLoaded(book);
                });
              }
              return _PlayerBody(book: book);
            },
            loading: () => const _LoadingView(),
            error: (_, __) => _ErrorView(
              onRetry: () => ref.invalidate(bookProvider(widget.bookId)),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── BODY ───────────────────────────

class _PlayerBody extends ConsumerWidget {
  const _PlayerBody({required this.book});

  final BookModel book;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SafeArea(
      child: GestureDetector(
        // Swipe-down → закрыть плеер (стандарт iOS для now playing screen).
        onVerticalDragEnd: (details) {
          final velocity = details.primaryVelocity ?? 0;
          if (velocity > 300) {
            if (context.canPop()) context.pop();
          }
        },
        behavior: HitTestBehavior.opaque,
        child: Column(
          children: [
            const _TopBar(),
            Expanded(
              child: SingleChildScrollView(
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenPadding,
                ),
                child: Column(
                  children: [
                    const SizedBox(height: 16),
                    _CoverSection(book: book),
                    const SizedBox(height: 32),
                    _TitleSection(book: book),
                    const SizedBox(height: 28),
                    const _ProgressSection(),
                    const SizedBox(height: 24),
                    const _MainControls(),
                    const SizedBox(height: 32),
                    const _BottomControls(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── TOP BAR ───────────────────────────

class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Semantics(
            label: 'Свернуть плеер',
            button: true,
            child: IconButton(
              onPressed: () {
                if (context.canPop()) context.pop();
              },
              icon: const Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 30,
                color: Colors.white,
              ),
              constraints: const BoxConstraints(
                minWidth: AppSpacing.minTapTarget,
                minHeight: AppSpacing.minTapTarget,
              ),
            ),
          ),
          Column(
            children: [
              Text(
                'Сейчас играет',
                style: AppTypography.microBold.copyWith(
                  color: Colors.white.withOpacity(0.5),
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(width: AppSpacing.minTapTarget),
        ],
      ),
    );
  }
}

// ─────────────────────────── COVER ───────────────────────────

class _CoverSection extends StatelessWidget {
  const _CoverSection({required this.book});

  final BookModel book;

  /// Размер обложки 220×220 — точный матч прототипа v4.2.
  /// Компактнее чем у Apple Music (300×300) и помещается на iPhone SE.
  static const double _coverSize = 220;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: _coverSize,
      height: _coverSize,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.5),
            blurRadius: 30,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BookCoverImage(
          imageUrl: book.coverImageUrl,
          gradientColors: book.coverGradientColors,
          label: book.coverLabel,
          width: _coverSize,
          height: _coverSize,
          borderRadius: 16,
        ),
      ),
    );
  }
}

// ─────────────────────────── TITLE ───────────────────────────

class _TitleSection extends ConsumerWidget {
  const _TitleSection({required this.book});

  final BookModel book;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stateAsync = ref.watch(playerUiStateProvider);
    final partTitle = stateAsync.maybeWhen(
      data: (s) => s.partTitle,
      orElse: () => '',
    );

    return Column(
      children: [
        Text(
          book.title,
          style: AppTypography.serifBookTitle.copyWith(
            color: Colors.white,
            fontSize: 22,
          ),
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        const SizedBox(height: 6),
        Text(
          book.author,
          style: AppTypography.body.copyWith(
            color: Colors.white.withOpacity(0.6),
          ),
          textAlign: TextAlign.center,
        ),
        if (partTitle.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              partTitle,
              style: AppTypography.captionMedium.copyWith(
                color: Colors.white.withOpacity(0.85),
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ],
    );
  }
}

// ─────────────────────────── PROGRESS (slider + таймеры) ───────────────────────────

class _ProgressSection extends ConsumerStatefulWidget {
  const _ProgressSection();

  @override
  ConsumerState<_ProgressSection> createState() => _ProgressSectionState();
}

class _ProgressSectionState extends ConsumerState<_ProgressSection> {
  /// null = не dragging, число = позиция в секундах под пальцем юзера.
  double? _dragSeconds;

  @override
  Widget build(BuildContext context) {
    final stateAsync = ref.watch(playerUiStateProvider);
    final state = stateAsync.valueOrNull ?? PlayerUiState.empty;

    final maxSeconds = state.duration.inSeconds.toDouble();
    final currentSeconds = _dragSeconds ?? state.position.inSeconds.toDouble();
    final clampedCurrent = currentSeconds.clamp(0, maxSeconds).toDouble();

    final displayPosition = Duration(seconds: clampedCurrent.toInt());

    return Column(
      children: [
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            trackHeight: 3,
            activeTrackColor: AppColors.terracotta,
            inactiveTrackColor: Colors.white.withOpacity(0.2),
            thumbColor: AppColors.terracotta,
            overlayColor: AppColors.terracotta.withOpacity(0.2),
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 18),
          ),
          child: Slider(
            value: clampedCurrent,
            min: 0,
            max: maxSeconds > 0 ? maxSeconds : 1,
            onChangeStart: (value) {
              setState(() => _dragSeconds = value);
            },
            onChanged: (value) {
              setState(() => _dragSeconds = value);
            },
            onChangeEnd: (value) async {
              final handler = ref.read(audioHandlerProvider);
              await handler.seek(Duration(seconds: value.toInt()));
              setState(() => _dragSeconds = null);
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _formatTime(displayPosition),
                style: AppTypography.caption.copyWith(
                  color: Colors.white.withOpacity(0.7),
                ),
              ),
              Text(
                _formatTime(state.duration),
                style: AppTypography.caption.copyWith(
                  color: Colors.white.withOpacity(0.7),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────── MAIN CONTROLS ───────────────────────────

class _MainControls extends ConsumerWidget {
  const _MainControls();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stateAsync = ref.watch(playerUiStateProvider);
    final state = stateAsync.valueOrNull ?? PlayerUiState.empty;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _SkipButton(
          icon: Icons.replay,
          label: '−15 сек',
          onTap: () => ref.read(audioHandlerProvider).rewind(),
          semanticLabel: 'Перемотать на 15 секунд назад',
        ),
        _PlayPauseBig(
          playing: state.playing,
          loading: state.processingState == ProcessingState.loading ||
              state.processingState == ProcessingState.buffering,
        ),
        _SkipButton(
          icon: Icons.forward_10,
          label: '+15 сек',
          onTap: () => ref.read(audioHandlerProvider).fastForward(),
          semanticLabel: 'Перемотать на 15 секунд вперёд',
        ),
      ],
    );
  }
}

class _SkipButton extends StatelessWidget {
  const _SkipButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.semanticLabel,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      button: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(40),
          child: Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 32, color: Colors.white),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withOpacity(0.6),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PlayPauseBig extends ConsumerWidget {
  const _PlayPauseBig({
    required this.playing,
    required this.loading,
  });

  final bool playing;
  final bool loading;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      label: playing ? 'Пауза' : 'Воспроизвести',
      button: true,
      child: Material(
        color: AppColors.terracotta,
        shape: const CircleBorder(),
        elevation: 4,
        shadowColor: AppColors.terracotta.withOpacity(0.4),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: loading
              ? null
              : () {
                  HapticFeedback.lightImpact();
                  final handler = ref.read(audioHandlerProvider);
                  if (playing) {
                    handler.pause();
                  } else {
                    handler.play();
                  }
                },
          child: Container(
            width: 80,
            height: 80,
            alignment: Alignment.center,
            child: loading
                ? const SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : Icon(
                    playing ? Icons.pause : Icons.play_arrow,
                    size: 44,
                    color: Colors.white,
                  ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── BOTTOM CONTROLS ───────────────────────────

class _BottomControls extends ConsumerWidget {
  const _BottomControls();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final speed = ref.watch(playerSpeedProvider);
    final sleepRemaining = ref.watch(sleepTimerRemainingProvider).valueOrNull;
    final handler = ref.read(audioHandlerProvider);
    final sleepActive = sleepRemaining != null || handler.sleepUntilEndOfPart;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _BottomButton(
          icon: Icons.speed,
          label: _formatSpeedLabel(speed),
          isActive: speed != 1.0,
          onTap: () {
            showModalBottomSheet(
              context: context,
              backgroundColor: Colors.transparent,
              useRootNavigator: true,
              builder: (_) => const SpeedSheet(),
            );
          },
          semanticLabel: 'Скорость воспроизведения',
        ),
        _BottomButton(
          icon: Icons.bedtime_outlined,
          label: sleepActive ? _formatSleepLabel(sleepRemaining) : 'Сон',
          isActive: sleepActive,
          onTap: () {
            showModalBottomSheet(
              context: context,
              backgroundColor: Colors.transparent,
              useRootNavigator: true,
              builder: (_) => const SleepTimerSheet(),
            );
          },
          semanticLabel: 'Таймер сна',
        ),
      ],
    );
  }

  String _formatSpeedLabel(double speed) {
    if (speed == speed.toInt()) return '${speed.toInt()}×';
    return '$speed×';
  }

  String _formatSleepLabel(Duration? remaining) {
    if (remaining == null) return 'Часть';
    if (remaining.inMinutes > 0) return '${remaining.inMinutes}м';
    return '${remaining.inSeconds}с';
  }
}

class _BottomButton extends StatelessWidget {
  const _BottomButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
    required this.semanticLabel,
  });

  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final color = isActive ? AppColors.terracotta : Colors.white.withOpacity(0.7);

    return Semantics(
      label: semanticLabel,
      button: true,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            constraints: const BoxConstraints(
              minWidth: AppSpacing.minTapTarget,
              minHeight: AppSpacing.minTapTarget,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 22, color: color),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── LOADING / ERROR ───────────────────────────

class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(
        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                size: 48, color: Colors.white70),
            const SizedBox(height: 16),
            Text(
              'Не удалось загрузить разбор',
              style: AppTypography.serifSectionTitle.copyWith(color: Colors.white),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Проверьте соединение и попробуйте снова',
              style: AppTypography.caption.copyWith(
                color: Colors.white.withOpacity(0.7),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: 200,
              height: 48,
              child: Material(
                color: AppColors.terracotta,
                borderRadius:
                    BorderRadius.circular(AppSpacing.radiusButton),
                child: InkWell(
                  onTap: onRetry,
                  borderRadius:
                      BorderRadius.circular(AppSpacing.radiusButton),
                  child: Center(
                    child: Text(
                      'Попробовать снова',
                      style: AppTypography.button.copyWith(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── HELPERS ───────────────────────────

String _formatTime(Duration d) {
  final h = d.inHours;
  final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
  final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
  if (h > 0) return '$h:$m:$s';
  return '$m:$s';
}
