import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../../payments/providers/product_purchase_provider.dart';
import '../../profile/providers/profile_provider.dart';
import '../providers/book_provider.dart';
import '../widgets/book_parts_list.dart';

/// Экран детальной информации о книге.
/// MASTER секции 4.12 (бесплатная), 4.13 (платная), 4.14 (купленная).
///
/// 3 варианта отображения переключаются по флагам:
/// - `book.isFree == true` → 4.12 (зелёная кнопка «Слушать бесплатно»)
/// - `book.hasAccess == true` → 4.14 (кнопка «Слушать» + прогресс).
///   hasAccess считает СЕРВЕР в GET /books/:id: куплена отдельно ИЛИ входит в
///   купленный пакет ИЛИ открыта подпиской как книга клуба в календарном окне
///   (месяц клуба + следующий месяц-архив; модель 08.07.2026) ИЛИ админ.
/// - иначе → 4.13 (цена + «Купить» + замки на частях 2-4)
///
/// onTap кнопок:
/// - «Слушать» / «Продолжить» / «Превью» → переход на /player/:bookId
///   Плеер сам определит стартовую часть и позицию из прогресса.
/// - «Купить» → StoreKit 2 покупка разбора через productPurchaseProvider.
///   После подтверждения сервером книга перезапрашивается (hasAccess → true)
///   и экран переключается на 4.14.
///
/// Если у книги нет частей с аудио (parts.isEmpty) — кнопка прослушивания
/// disabled с текстом «Аудио загружается». Apple Guideline 2.1: не открывать
/// плеер с пустым контентом.
///
/// `_listenedPartNumbers`, `_progressPercent` — заглушки (подтянутся из
/// ProgressService отдельной микро-задачей).
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

  // Доступ (куплено/подписка) теперь считает сервер — book.hasAccess
  // (GET /books/:id, 08.07.2026). listenedPartNumbers и progressPercent —
  // заглушки: будут подтягиваться из ProgressService когда BookScreen
  // начнёт это делать (отдельная микро-задача).
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
                  hasAccess: book.hasAccess,
                  progressPercent: _progressPercent,
                ),
                const SizedBox(height: 20),
                _DescriptionBlock(description: book.description),
                const SizedBox(height: 24),
                BookPartsList(
                  book: book,
                  isPurchased: book.hasAccess,
                  listenedPartNumbers: _listenedPartNumbers,
                  onPartTap: (part) => _onPartTap(context, part),
                ),
                const SizedBox(height: 28),
                _ReviewsPlaceholder(),
                const SizedBox(height: 16),
                if (!book.isFree && !book.hasAccess) _ReportLink(),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Тап по части в списке → открыть плеер с этой части.
  /// Передаём startPart явно, чтобы перезаписать прогресс сервера если он есть.
  void _onPartTap(BuildContext context, BookPart part) {
    context.push(
      Routes.player(book.id),
      extra: {
        'startPart': part.number,
        'startPosition': 0,
      },
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
      const _Badge(text: 'БЕСПЛАТНО', background: AppColors.freeBadge);

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

class _ActionSection extends ConsumerWidget {
  const _ActionSection({
    required this.book,
    required this.hasAccess,
    required this.progressPercent,
  });

  final BookModel book;

  /// Полный доступ к платной книге (считает сервер, см. BookModel.hasAccess):
  /// куплена отдельно ИЛИ входит в купленный пакет ИЛИ открыта подпиской как
  /// книга клуба в календарном окне.
  final bool hasAccess;
  final double progressPercent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Если у книги нет аудио — все варианты показывают disabled-кнопку.
    // Apple Guideline 2.1: не открывать плеер пустого контента.
    final hasAudio = book.parts.isNotEmpty;
    final productId = book.appleProductId;

    // Реакция на результат покупки ИМЕННО этого разбора. Провайдер общий на все
    // товары, поэтому сверяем productId, чтобы не среагировать на чужую покупку.
    ref.listen<ProductPurchaseState>(productPurchaseProvider, (prev, next) {
      if (productId == null || next.productId != productId) return;
      if (next.status == ProductPurchaseStatus.success) {
        ref.read(productPurchaseProvider.notifier).reset();
        // Доступ пересчитывает сервер — перезапрашиваем книгу (hasAccess → true,
        // экран переключится на «Слушать») и историю покупок («Мои покупки»).
        ref.invalidate(bookProvider(book.id));
        ref.invalidate(purchaseHistoryProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Разбор открыт'),
            duration: Duration(seconds: 2),
          ),
        );
      } else if (next.status == ProductPurchaseStatus.error) {
        final message = next.errorMessage ?? 'Покупка не завершена';
        ref.read(productPurchaseProvider.notifier).reset();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    });

    // Вариант 4.12: бесплатная
    if (book.isFree) {
      return _FreeActions(
        hasAudio: hasAudio,
        onListen: () => _onListenPressed(context),
      );
    }

    // Вариант 4.14: есть полный доступ (куплена / пакет / подписка на клуб)
    if (hasAccess) {
      return _PurchasedActions(
        hasAudio: hasAudio,
        progressPercent: progressPercent,
        onListen: () => _onListenPressed(context),
      );
    }

    // Вариант 4.13: платная без доступа
    final purchase = ref.watch(productPurchaseProvider);
    final isBuying = productId != null &&
        purchase.productId == productId &&
        (purchase.status == ProductPurchaseStatus.purchasing ||
            purchase.status == ProductPurchaseStatus.verifying);

    return _PaidActions(
      book: book,
      hasAudio: hasAudio,
      isBuying: isBuying,
      canBuy: productId != null,
      onBuy: () {
        if (productId == null) return;
        ref.read(productPurchaseProvider.notifier).buy(productId);
      },
      onPreview: () => _onListenPressed(context),
    );
  }

  /// Переход в плеер — без extra, плеер сам подтянет прогресс с сервера.
  void _onListenPressed(BuildContext context) {
    context.push(Routes.player(book.id));
  }
}

// — 4.12 бесплатная —

class _FreeActions extends StatelessWidget {
  const _FreeActions({
    required this.hasAudio,
    required this.onListen,
  });

  final bool hasAudio;
  final VoidCallback onListen;

  @override
  Widget build(BuildContext context) {
    return _GreenListenButton(
      label: 'Слушать бесплатно',
      onTap: onListen,
      enabled: hasAudio,
    );
  }
}

// — 4.13 платная (нет доступа) —
// Apple запрещает в приложении призывать покупать вне Apple IAP
// (правило 3.1.1, послабления 3.1.1(a) действуют только в US storefront).
// Поэтому здесь ТОЛЬКО IAP-кнопка и превью. Никаких ссылок на внешние сайты.

class _PaidActions extends StatelessWidget {
  const _PaidActions({
    required this.book,
    required this.hasAudio,
    required this.isBuying,
    required this.canBuy,
    required this.onBuy,
    required this.onPreview,
  });

  final BookModel book;
  final bool hasAudio;

  /// Идёт покупка/верификация — кнопка показывает спиннер и не нажимается.
  final bool isBuying;

  /// У разбора есть appleProductId — иначе покупка невозможна (кнопка неактивна).
  final bool canBuy;
  final VoidCallback onBuy;
  final VoidCallback onPreview;

  @override
  Widget build(BuildContext context) {
    final priceLabel = book.displayPriceUsd;
    final buyText =
        priceLabel != null ? 'Купить за $priceLabel' : 'Купить разбор';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppButton(
          text: buyText,
          onPressed: canBuy ? onBuy : null,
          isLoading: isBuying,
        ),
        const SizedBox(height: 10),
        // Превью доступно только если есть аудио.
        if (hasAudio)
          AppButton(
            text: 'Слушать превью (5 мин)',
            onPressed: onPreview,
            variant: AppButtonVariant.outline,
          )
        else
          _DisabledAudioHint(),
      ],
    );
  }
}

// — 4.14 есть полный доступ (куплена ИЛИ открыта подпиской на клуб) —
// Бейдж «КУПЛЕНО» убран (08.07.2026): клиент не различает покупку и подписку
// (сервер отдаёт единый hasAccess), бейдж врал бы подписчику. Подпись «У вас
// есть полный доступ» тоже убрана (02.08.2026) — кнопка «Слушать» самодостаточна.

class _PurchasedActions extends StatelessWidget {
  const _PurchasedActions({
    required this.hasAudio,
    required this.progressPercent,
    required this.onListen,
  });

  final bool hasAudio;
  final double progressPercent;
  final VoidCallback onListen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _GreenListenButton(
          label: progressPercent > 0 ? 'Продолжить' : 'Слушать',
          onTap: onListen,
          enabled: hasAudio,
        ),
        if (progressPercent > 0 && hasAudio) ...[
          const SizedBox(height: 14),
          _ProgressCard(percent: progressPercent),
        ],
      ],
    );
  }
}

// — Зелёная кнопка «Слушать» с поддержкой disabled-state —

class _GreenListenButton extends StatelessWidget {
  const _GreenListenButton({
    required this.label,
    required this.onTap,
    required this.enabled,
  });

  final String label;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (!enabled) {
      // Disabled-вариант: серый фон, текст «Аудио загружается».
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.surfaceMedium,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.hourglass_empty,
                  color: AppColors.textTertiary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Аудио загружается',
                style: AppTypography.button.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
      );
    }

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
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.play_arrow, color: Colors.white, size: 24),
                const SizedBox(width: 8),
                Text(
                  label,
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

/// Подсказка-плейсхолдер для платной книги без аудио.
class _DisabledAudioHint extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 48,
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.hourglass_empty,
              color: AppColors.textTertiary, size: 18),
          const SizedBox(width: 8),
          Text(
            'Аудио будет доступно скоро',
            style: AppTypography.caption.copyWith(
              color: AppColors.textTertiary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
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
    // Описание под кнопкой действия, без заголовка «О разборе», тем же шрифтом
    // что в пакете (bodyMedium, вторичный цвет) — единый вид разбора и пакета.
    return Text(
      description,
      style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary),
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
