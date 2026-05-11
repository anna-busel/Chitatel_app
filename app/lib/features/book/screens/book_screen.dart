import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../providers/book_provider.dart';
import '../widgets/book_parts_list.dart';

/// Экран детальной информации о книге.
/// MASTER секции 4.12 (бесплатная), 4.13 (платная), 4.14 (купленная).
///
/// 3 варианта отображения переключаются по флагам:
/// - `book.isFree == true` → 4.12 (зелёная кнопка «Слушать бесплатно»)
/// - `isPurchased == true` → 4.14 (кнопка «Слушать» + прогресс)
/// - иначе → 4.13 (цена + «Купить» + замки на частях 2-4)
///
/// onTap кнопок «Слушать» и «Купить» сейчас — SnackBar-заглушки.
/// Реальная логика:
/// - «Слушать» → задача 2.7 (Flutter — аудиоплеер)
/// - «Купить» → задача 3.2 (Flutter — StoreKit 2 покупки)
/// - `isPurchased`, `listenedPartNumbers`, `progressPercent` сейчас захардкожены —
///   реальное состояние появится в Фазе 3 (для покупки) и после 2.7 (для прогресса).
class BookScreen extends ConsumerWidget {
  const BookScreen({super.key, required this.bookId});

  final String bookId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bookAsync = ref.watch(bookProvider(bookId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: bookAsync.when(
          data: (book) => _BookContent(book: book),
          loading: () => const _BookShimmer(),
          error: (err, _) => Center(
            child: ErrorView(
              title: 'Не удалось загрузить разбор',
              message: 'Проверьте соединение и попробуйте снова',
              onRetry: () => ref.invalidate(bookProvider(bookId)),
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── BODY ───────────────────────────

class _BookContent extends StatelessWidget {
  const _BookContent({required this.book});

  final BookModel book;

  // TODO задача 3.2 (Фаза 3): получить реальное состояние из purchaseProvider.
  // TODO после 2.7: получить прослушанные части и прогресс из progressProvider.
  static const bool _isPurchased = false;
  static const Set<int> _listenedPartNumbers = <int>{};
  static const double _progressPercent = 0.0;

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(child: _TopBar()),
        SliverToBoxAdapter(child: _CoverSection(book: book)),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenPadding,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                _TitleBlock(book: book),
                const SizedBox(height: 14),
                _MetaRow(book: book),
                const SizedBox(height: 20),
                _ActionSection(
                  book: book,
                  isPurchased: _isPurchased,
                  progressPercent: _progressPercent,
                ),
                const SizedBox(height: 24),
                BookPartsList(
                  book: book,
                  isPurchased: _isPurchased,
                  listenedPartNumbers: _listenedPartNumbers,
                  onPartTap: (part) => _onPartTap(context, part),
                ),
                const SizedBox(height: 28),
                _DescriptionBlock(description: book.description),
                const SizedBox(height: 28),
                _ReviewsPlaceholder(),
                const SizedBox(height: 16),
                if (!book.isFree && !_isPurchased) _ReportLink(),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _onPartTap(BuildContext context, BookPart part) {
    // TODO задача 2.7: context.push(Routes.player(book.id)) с указанием part.number
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Аудиоплеер появится в задаче 2.7 (часть ${part.number})'),
        duration: const Duration(seconds: 2),
      ),
    );
  }
}

// ─────────────────────────── TOP BAR ───────────────────────────

class _TopBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: 8,
        vertical: 4,
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => _onBackPressed(context),
            icon: const Icon(
              Icons.arrow_back_ios_new,
              size: 20,
              color: AppColors.terracotta,
            ),
            tooltip: 'Назад',
            constraints: const BoxConstraints(
              minWidth: AppSpacing.minTapTarget,
              minHeight: AppSpacing.minTapTarget,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            'Назад',
            style: AppTypography.bodyMedium.copyWith(
              color: AppColors.terracotta,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  void _onBackPressed(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/catalog');
    }
  }
}

// ─────────────────────────── COVER ───────────────────────────

/// Секция обложки книги.
///
/// Обложки у Анны — вертикальные (стандартная пропорция книги ~2:3).
/// Решение: показываем обложку по центру на основном фоне приложения
/// без баннера-фона (никаких чёрных/тёмных полей вокруг).
/// Лёгкая тень даёт ощущение «карточки на полке» — как в Apple Books, Spotify.
///
/// Если coverImageUrl пустой — BookCoverImage сам покажет fallback (градиент + label).
class _CoverSection extends StatelessWidget {
  const _CoverSection({required this.book});

  final BookModel book;

  static const double _coverWidth = 180;
  static const double _coverHeight = 258; // пропорция ~10:14, близко к 2:3

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(
        left: AppSpacing.screenPadding,
        right: AppSpacing.screenPadding,
        top: 8,
        bottom: 4,
      ),
      child: Center(
        child: SizedBox(
          width: _coverWidth,
          height: _coverHeight,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.18),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: BookCoverImage(
                  imageUrl: book.coverImageUrl,
                  gradientColors: book.coverGradientColors,
                  label: book.coverLabel,
                  width: _coverWidth,
                  height: _coverHeight,
                  borderRadius: 12,
                ),
              ),
              if (book.isFree)
                Positioned(
                  top: 8,
                  left: 8,
                  child: _Badge.free(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── BADGE ───────────────────────────

class _Badge extends StatelessWidget {
  const _Badge({
    required this.text,
    required this.background,
  });

  factory _Badge.free() =>
      const _Badge(text: 'БЕСПЛАТНО', background: AppColors.success);

  factory _Badge.purchased() =>
      const _Badge(text: 'КУПЛЕНО', background: AppColors.terracotta);

  final String text;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(text, style: AppTypography.badge),
    );
  }
}

// ─────────────────────────── TITLE ───────────────────────────

class _TitleBlock extends StatelessWidget {
  const _TitleBlock({required this.book});

  final BookModel book;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(book.title, style: AppTypography.serifBookTitle),
        const SizedBox(height: 4),
        Text(
          book.author,
          style: AppTypography.body.copyWith(color: AppColors.textSecondary),
        ),
      ],
    );
  }
}

// ─────────────────────────── META (рейтинг + длительность) ───────────────────────────

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.book});

  final BookModel book;

  @override
  Widget build(BuildContext context) {
    final hasRating = book.rating > 0;
    final hasDuration = book.durationTotal > 0;
    if (!hasRating && !hasDuration) return const SizedBox.shrink();

    return Row(
      children: [
        if (hasRating) ...[
          const Icon(Icons.star_rounded, size: 18, color: AppColors.gold),
          const SizedBox(width: 4),
          Text(
            book.rating.toStringAsFixed(1),
            style: AppTypography.captionMedium.copyWith(
              color: AppColors.textPrimary,
            ),
          ),
          if (book.reviewCount > 0) ...[
            const SizedBox(width: 4),
            Text(
              '(${book.reviewCount})',
              style: AppTypography.caption,
            ),
          ],
        ],
        if (hasRating && hasDuration) ...[
          const SizedBox(width: 12),
          Container(
            width: 3,
            height: 3,
            decoration: const BoxDecoration(
              color: AppColors.textTertiary,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
        ],
        if (hasDuration)
          Text(book.displayDuration, style: AppTypography.caption),
      ],
    );
  }
}

// ─────────────────────────── ACTIONS (3 варианта) ───────────────────────────

class _ActionSection extends StatelessWidget {
  const _ActionSection({
    required this.book,
    required this.isPurchased,
    required this.progressPercent,
  });

  final BookModel book;
  final bool isPurchased;
  final double progressPercent;

  @override
  Widget build(BuildContext context) {
    // Вариант 4.12: бесплатная
    if (book.isFree) {
      return _FreeActions(onListen: () => _onListenPressed(context));
    }

    // Вариант 4.14: купленная
    if (isPurchased) {
      return _PurchasedActions(
        progressPercent: progressPercent,
        onListen: () => _onListenPressed(context),
      );
    }

    // Вариант 4.13: платная не купленная
    return _PaidActions(
      book: book,
      onBuy: () => _onBuyPressed(context),
      onPreview: () => _onListenPressed(context),
      onBuyOnSite: book.purchaseUrl.isEmpty
          ? null
          : () => _openPurchaseUrl(context, book.purchaseUrl),
    );
  }

  // TODO задача 2.7: context.push(Routes.player(book.id))
  void _onListenPressed(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Аудиоплеер появится в задаче 2.7'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  // TODO задача 3.2: запуск StoreKit 2 покупки через purchase_provider
  void _onBuyPressed(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Покупка через Apple появится в Фазе 3'),
        duration: Duration(seconds: 2),
      ),
    );
  }

  Future<void> _openPurchaseUrl(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Не удалось открыть ссылку'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }
}

// — 4.12 бесплатная —

class _FreeActions extends StatelessWidget {
  const _FreeActions({required this.onListen});

  final VoidCallback onListen;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.successLight,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onListen,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.play_arrow, color: Colors.white, size: 24),
                const SizedBox(width: 8),
                Text(
                  'Слушать бесплатно',
                  style: AppTypography.button.copyWith(color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// — 4.13 платная (не куплена) —

class _PaidActions extends StatelessWidget {
  const _PaidActions({
    required this.book,
    required this.onBuy,
    required this.onPreview,
    required this.onBuyOnSite,
  });

  final BookModel book;
  final VoidCallback onBuy;
  final VoidCallback onPreview;
  final VoidCallback? onBuyOnSite;

  @override
  Widget build(BuildContext context) {
    final priceLabel = book.displayPriceUsd;
    final buyText =
        priceLabel != null ? 'Купить за $priceLabel' : 'Купить разбор';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppButton(text: buyText, onPressed: onBuy),
        const SizedBox(height: 10),
        AppButton(
          text: 'Слушать превью (5 мин)',
          onPressed: onPreview,
          variant: AppButtonVariant.outline,
        ),
        if (onBuyOnSite != null) ...[
          const SizedBox(height: 10),
          // Apple Guideline 3.1.1(a): вторая кнопка-ссылка на внешний сайт.
          // Намеренно компактнее основной кнопки.
          Center(
            child: InkWell(
              onTap: onBuyOnSite,
              borderRadius: BorderRadius.circular(8),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: Text(
                  'Купить на сайте автора →',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.textSecondary,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

// — 4.14 купленная (с прогрессом) —

class _PurchasedActions extends StatelessWidget {
  const _PurchasedActions({
    required this.progressPercent,
    required this.onListen,
  });

  final double progressPercent;
  final VoidCallback onListen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            _Badge.purchased(),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'У вас есть полный доступ',
                style: AppTypography.caption,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.successLight,
              borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onListen,
                borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.play_arrow, color: Colors.white, size: 24),
                    const SizedBox(width: 8),
                    Text(
                      progressPercent > 0 ? 'Продолжить' : 'Слушать',
                      style: AppTypography.button.copyWith(color: Colors.white),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (progressPercent > 0) ...[
          const SizedBox(height: 14),
          _ProgressCard(percent: progressPercent),
        ],
      ],
    );
  }
}

// — Карточка прогресса в купленной книге —

class _ProgressCard extends StatelessWidget {
  const _ProgressCard({required this.percent});

  /// Значение 0..1 (например 0.54 = 54%).
  final double percent;

  @override
  Widget build(BuildContext context) {
    final clamped = percent.clamp(0.0, 1.0).toDouble();
    final percentText = '${(clamped * 100).round()}%';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        boxShadow: AppColors.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Ваш прогресс', style: AppTypography.captionMedium),
              Text(
                percentText,
                style: AppTypography.bodyBold.copyWith(
                  color: AppColors.successLight,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: clamped,
              minHeight: 6,
              backgroundColor: AppColors.surfaceMedium,
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppColors.successLight,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── DESCRIPTION ───────────────────────────

class _DescriptionBlock extends StatelessWidget {
  const _DescriptionBlock({required this.description});

  final String description;

  @override
  Widget build(BuildContext context) {
    if (description.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('О разборе', style: AppTypography.sectionHeader),
        const SizedBox(height: 10),
        Text(description, style: AppTypography.body),
      ],
    );
  }
}

// ─────────────────────────── REVIEWS (post-MVP placeholder) ───────────────────────────

class _ReviewsPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Отзывы — post-MVP по STEP-BY-STEP. Здесь только заголовок и подпись.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Отзывы', style: AppTypography.sectionHeader),
        const SizedBox(height: 8),
        Text(
          'Отзывы появятся позже',
          style: AppTypography.caption,
        ),
      ],
    );
  }
}

// ─────────────────────────── REPORT LINK (footer) ───────────────────────────

class _ReportLink extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: TextButton.icon(
        onPressed: () {
          // Экран жалоб — задача 4.5 (Фаза 4). Пока заглушка.
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Жалобы появятся в задаче 4.5'),
              duration: Duration(seconds: 2),
            ),
          );
        },
        icon: const Icon(Icons.flag_outlined, size: 16),
        label: const Text('Пожаловаться на контент'),
        style: TextButton.styleFrom(
          foregroundColor: AppColors.textTertiary,
          textStyle: AppTypography.caption,
        ),
      ),
    );
  }
}

// ─────────────────────────── SHIMMER ───────────────────────────

class _BookShimmer extends StatelessWidget {
  const _BookShimmer();

  @override
  Widget build(BuildContext context) {
    return ShimmerLoading(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenPadding,
          vertical: 16,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: ShimmerBlock(width: 180, height: 258, borderRadius: 12),
            ),
            const SizedBox(height: 20),
            const ShimmerBlock(width: 260, height: 24),
            const SizedBox(height: 8),
            const ShimmerBlock(width: 160, height: 16),
            const SizedBox(height: 20),
            const ShimmerBlock(width: double.infinity, height: 48),
            const SizedBox(height: 24),
            const ShimmerBlock(width: 140, height: 18),
            const SizedBox(height: 12),
            const ShimmerBlock(width: double.infinity, height: 64),
            const SizedBox(height: 8),
            const ShimmerBlock(width: double.infinity, height: 64),
            const SizedBox(height: 8),
            const ShimmerBlock(width: double.infinity, height: 64),
          ],
        ),
      ),
    );
  }
}
