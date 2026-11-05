import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/models/book_model.dart';
import '../screens/banner_books_screen.dart';
import '../services/home_banners_service.dart';
import 'club_month_card.dart';

/// Карусель на главной: «Клуб месяца» + баннеры из админки
/// (UPDATES-PLAN T, 05.11.2026).
///
/// Нет баннеров → ровно как раньше: одна [ClubMonthCard], без таймера и точек.
///
/// Есть баннеры → PageView: страница 1 — клуб, дальше картинки 2:1.
/// Высота страницы = max(высота картинки 2:1 на ширине экрана минус отступы,
/// естественная высота карточки клуба). Карточку клуба меряем «за кадром»
/// (Offstage), поэтому при крупном шрифте она не обрезается, а картинка
/// тогда заполняет страницу с BoxFit.cover.
///
/// Поведение листания:
/// - автолистание каждые [_interval] (4 с) — одноразовый Timer, который
///   перезапускается после каждого действия (не periodic: так не бывает
///   двойного перелистывания сразу после свайпа);
/// - касание: таймер стоит, пока палец на карусели; после отпускания —
///   снова 4 с; любая смена страницы (рукой или автоматически) сбрасывает
///   отсчёт;
/// - зацикливание через «бесконечный» индекс: страница = индекс % N, поэтому
///   после последней страницы следующая — клуб, тем же плавным шагом вперёд,
///   без пролёта назад через все страницы; влево с клуба тоже можно;
/// - таймер стоит, пока главная не видна: поверх неё открыт другой экран
///   (TickerMode выключается у перекрытого маршрута), приложение в фоне
///   (WidgetsBindingObserver), и при dispose; animateToPage не зовём без
///   hasClients и пока идёт анимация или жест;
/// - число баннеров изменилось (pull-to-refresh) — номер текущей страницы
///   ограничивается новым числом, контроллер пересоздаётся на той же
///   странице, точки пересчитываются.
class HomeCarousel extends StatefulWidget {
  const HomeCarousel({
    super.key,
    required this.clubBook,
    required this.clubMonthLabel,
    required this.banners,
  });

  final BookModel? clubBook;
  final String? clubMonthLabel;
  final List<HomeBanner> banners;

  @override
  State<HomeCarousel> createState() => _HomeCarouselState();
}

class _HomeCarouselState extends State<HomeCarousel>
    with WidgetsBindingObserver {
  static const Duration _interval = Duration(seconds: 4);
  static const Duration _animDuration = Duration(milliseconds: 450);

  /// Стартовый «виртуальный» номер страницы в кругах по N — чтобы можно
  /// было листать и вперёд, и назад практически бесконечно.
  static const int _loopRounds = 10000;

  PageController? _controller;
  Timer? _timer;

  /// Реальный номер страницы 0..N-1 (0 — клуб).
  int _current = 0;

  /// Сколько пальцев сейчас на карусели.
  int _pointers = 0;

  bool _started = false;
  bool _tickerEnabled = true;
  bool _appResumed = true;
  bool _autoAnimating = false;

  /// Естественная высота карточки клуба (меряется за кадром).
  double? _clubHeight;

  int get _pageCount => widget.banners.length + 1;

  bool get _canAutoScroll =>
      _controller != null && _tickerEnabled && _appResumed && _pointers == 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _appResumed = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    if (_pageCount > 1) {
      _controller = _createController(_pageCount, 0);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Перекрытый другим экраном маршрут получает TickerMode = false.
    // Первый вызов — сразу после initState: запускаем отсчёт. Дальше
    // реагируем только на смену видимости (иначе любая смена зависимостей,
    // например MediaQuery, сбрасывала бы отсчёт).
    final enabled = TickerMode.of(context);
    if (!_started || enabled != _tickerEnabled) {
      _started = true;
      _tickerEnabled = enabled;
      if (enabled) {
        _restartTimer();
      } else {
        _stopTimer();
      }
    }
  }

  @override
  void didUpdateWidget(covariant HomeCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldCount = oldWidget.banners.length + 1;
    final newCount = _pageCount;
    if (oldCount == newCount) return;

    _current = math.min(_current, newCount - 1);
    final old = _controller;
    _controller = newCount > 1 ? _createController(newCount, _current) : null;
    if (newCount <= 1) _current = 0;
    // Старый контроллер ещё прикреплён к уходящему PageView — освобождаем
    // после кадра, когда PageView его отпустит.
    if (old != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    }
    _autoAnimating = false;
    _restartTimer();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appResumed = state == AppLifecycleState.resumed;
    if (_appResumed) {
      _restartTimer();
    } else {
      _stopTimer();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stopTimer();
    _controller?.dispose();
    super.dispose();
  }

  PageController _createController(int count, int realIndex) {
    return PageController(initialPage: _loopRounds * count + realIndex);
  }

  /* ------------------------------ ТАЙМЕР ------------------------------ */

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
  }

  /// Следующее автолистание — через [_interval] от «сейчас».
  void _restartTimer() {
    _stopTimer();
    if (!_canAutoScroll) return;
    _timer = Timer(_interval, _onTick);
  }

  void _onTick() {
    _timer = null;
    if (!mounted || !_canAutoScroll) return;
    final c = _controller!;
    if (!c.hasClients) {
      _restartTimer();
      return;
    }
    final pos = c.position;
    if (_autoAnimating ||
        pos.isScrollingNotifier.value ||
        !pos.hasContentDimensions) {
      _restartTimer();
      return;
    }
    final page = (c.page ?? c.initialPage.toDouble()).round();
    _autoAnimating = true;
    c
        .animateToPage(page + 1, duration: _animDuration, curve: Curves.easeInOut)
        .whenComplete(() {
      if (!mounted || !identical(c, _controller)) return;
      _autoAnimating = false;
      _restartTimer();
    });
  }

  void _onPointerDown(PointerDownEvent _) {
    _pointers++;
    _stopTimer();
  }

  void _onPointerUp(PointerEvent _) {
    _pointers = math.max(0, _pointers - 1);
    if (_pointers == 0) _restartTimer();
  }

  void _onPageChanged(int virtualIndex) {
    final real = virtualIndex % _pageCount;
    if (real != _current) {
      setState(() => _current = real);
    }
    // Ручная смена — отсчёт заново (автоматическая перезапустит таймер сама
    // по окончании анимации).
    if (!_autoAnimating) _restartTimer();
  }

  /* ------------------------------ ТАП ------------------------------ */

  void _openBanner(HomeBanner banner) {
    final action = banner.action;
    if (action.kind == HomeBannerActionKind.book && action.bookId != null) {
      context.push(Routes.book(action.bookId!));
    } else if (action.kind == HomeBannerActionKind.books) {
      context.push(
        Routes.bannerBooks,
        extra: BannerBooksArgs(title: action.listTitle, books: action.books),
      );
    }
  }

  /* ------------------------------ UI ------------------------------ */

  void _onClubMeasured(Size size) {
    if (!mounted) return;
    final h = size.height;
    if (h <= 0) return;
    if (_clubHeight == null || (_clubHeight! - h).abs() > 0.5) {
      setState(() => _clubHeight = h);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null || _pageCount <= 1) {
      return ClubMonthCard(
        book: widget.clubBook,
        monthLabel: widget.clubMonthLabel,
      );
    }

    final width = MediaQuery.sizeOf(context).width;
    final bannerHeight = (width - AppSpacing.screenPadding * 2) / 2;
    final pageHeight = math.max(bannerHeight, _clubHeight ?? bannerHeight);
    final count = _pageCount;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Замер естественной высоты карточки клуба (не рисуется, не
        // принимает касания).
        Offstage(
          child: _SizeReporter(
            onSize: _onClubMeasured,
            child: ClubMonthCard(
              book: widget.clubBook,
              monthLabel: widget.clubMonthLabel,
            ),
          ),
        ),
        Listener(
          onPointerDown: _onPointerDown,
          onPointerUp: _onPointerUp,
          onPointerCancel: _onPointerUp,
          child: SizedBox(
            height: pageHeight,
            child: PageView.builder(
              key: ValueKey<int>(count),
              controller: controller,
              // Тени карточек не обрезаются; соседние страницы всё равно за
              // краем экрана.
              clipBehavior: Clip.none,
              onPageChanged: _onPageChanged,
              itemBuilder: (context, index) {
                final real = index % count;
                if (real == 0) {
                  return ClubMonthCard(
                    book: widget.clubBook,
                    monthLabel: widget.clubMonthLabel,
                  );
                }
                final banner = widget.banners[real - 1];
                return _BannerPage(
                  banner: banner,
                  onTap: banner.action.kind == HomeBannerActionKind.none
                      ? null
                      : () => _openBanner(banner),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 10),
        _Dots(count: count, current: _current),
      ],
    );
  }
}

/// Страница-картинка карусели.
class _BannerPage extends StatelessWidget {
  const _BannerPage({required this.banner, this.onTap});

  final HomeBanner banner;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(AppSpacing.radiusCard);
    final placeholder = Container(color: AppColors.surfaceLight);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
      child: Semantics(
        image: true,
        button: onTap != null,
        label: 'Баннер',
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.surfaceLight,
              borderRadius: radius,
              boxShadow: AppColors.cardShadow,
            ),
            child: ClipRRect(
              borderRadius: radius,
              child: CachedNetworkImage(
                imageUrl: banner.imageUrl,
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
                placeholder: (_, __) => placeholder,
                errorWidget: (_, __, ___) => placeholder,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Точки-индикатор под каруселью.
class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.current});

  final int count;
  final int current;

  @override
  Widget build(BuildContext context) {
    final active = current.clamp(0, count - 1);
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(count, (i) {
        final on = i == active;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.symmetric(horizontal: 3),
          width: on ? 16 : 6,
          height: 6,
          decoration: BoxDecoration(
            color: on ? AppColors.terracotta : AppColors.border,
            borderRadius: BorderRadius.circular(3),
          ),
        );
      }),
    );
  }
}

/// Сообщает размер ребёнка после раскладки (после кадра, чтобы не звать
/// setState во время layout).
class _SizeReporter extends SingleChildRenderObjectWidget {
  const _SizeReporter({required this.onSize, required Widget super.child});

  final ValueChanged<Size> onSize;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderSizeReporter(onSize);

  @override
  void updateRenderObject(
    BuildContext context,
    covariant _RenderSizeReporter renderObject,
  ) {
    renderObject.onSize = onSize;
  }
}

class _RenderSizeReporter extends RenderProxyBox {
  _RenderSizeReporter(this.onSize);

  ValueChanged<Size> onSize;
  Size? _last;

  @override
  void performLayout() {
    super.performLayout();
    final s = size;
    if (s == _last) return;
    _last = s;
    SchedulerBinding.instance.addPostFrameCallback((_) => onSize(s));
  }
}
