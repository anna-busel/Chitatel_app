import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/plural.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../../../shared/widgets/error_view.dart';
import '../../auth/providers/auth_provider.dart';
import '../../club/services/block_service.dart';
import '../providers/book_provider.dart';
import '../providers/reviews_provider.dart';
import '../widgets/review_sheet.dart';
import '../widgets/reviews_section.dart';

/// «Все отзывы» о разборе (UPDATES-PLAN C3, 05.11.2026).
///
/// Тот же reviewsProvider, что у секции на экране книги: список
/// продолжается с уже загруженного, следующие страницы — при прокрутке
/// к концу.
class ReviewsScreen extends ConsumerStatefulWidget {
  const ReviewsScreen({super.key, required this.bookId});

  final String bookId;

  @override
  ConsumerState<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends ConsumerState<ReviewsScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 300) {
      ref.read(reviewsProvider(widget.bookId).notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(reviewsProvider(widget.bookId));
    final book = ref.watch(bookProvider(widget.bookId)).valueOrNull;
    final isAuthed =
        ref.watch(authProvider).status == AuthStatus.authenticated;
    final blocked =
        isAuthed ? ref.watch(blockedIdsProvider) : const <String>{};
    final canWrite =
        isAuthed && book != null && (book.isFree || book.hasAccess);

    final mine = state.myReview;
    final others = state.items
        .where((r) => !r.isMine && !blocked.contains(r.author.id))
        .toList(growable: false);

    Widget body;
    if (!state.isLoaded && state.error != null) {
      body = Center(
        child: ErrorView(
          title: 'Не удалось загрузить отзывы',
          message: 'Проверьте соединение и попробуйте снова',
          onRetry: () =>
              ref.read(reviewsProvider(widget.bookId).notifier).refresh(),
        ),
      );
    } else if (!state.isLoaded) {
      body = const Center(child: CircularProgressIndicator());
    } else {
      body = RefreshIndicator(
        color: AppColors.terracotta,
        onRefresh: () =>
            ref.read(reviewsProvider(widget.bookId).notifier).refresh(),
        child: ListView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenPadding,
            8,
            AppSpacing.screenPadding,
            32,
          ),
          children: [
            if (book != null) ...[
              Text(book.title, style: AppTypography.serifSectionTitle),
              const SizedBox(height: 6),
            ],
            if (state.reviewCount > 0)
              Row(
                children: [
                  const Icon(Icons.star_rounded,
                      size: 18, color: AppColors.gold),
                  const SizedBox(width: 4),
                  Text(
                    state.rating.toStringAsFixed(1),
                    style: AppTypography.captionMedium.copyWith(
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${state.reviewCount} '
                    '${plural(state.reviewCount, 'отзыв', 'отзыва', 'отзывов')}',
                    style: AppTypography.caption,
                  ),
                ],
              ),
            const SizedBox(height: 16),
            if (canWrite && mine == null) ...[
              AppButton(
                text: 'Оставить отзыв',
                variant: AppButtonVariant.outline,
                onPressed: () =>
                    showReviewSheet(context, bookId: widget.bookId),
              ),
              const SizedBox(height: 12),
            ],
            if (mine != null) ...[
              ReviewTile(
                bookId: widget.bookId,
                review: mine,
                highlightMine: true,
              ),
              const SizedBox(height: 8),
            ],
            for (final r in others) ...[
              ReviewTile(bookId: widget.bookId, review: r),
              const SizedBox(height: 8),
            ],
            if (mine == null && others.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 24),
                child: Center(
                  child: Text(
                    'Отзывов пока нет',
                    style: AppTypography.caption,
                  ),
                ),
              ),
            if (state.isLoadingMore)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
              ),
          ],
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppTopBar(
              backLabel: 'Назад',
              title: 'Отзывы',
              onBack: () => context.canPop()
                  ? context.pop()
                  : context.go('/catalog'),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}
