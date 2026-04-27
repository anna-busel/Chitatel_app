import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/error_view.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../providers/catalog_provider.dart';
import '../widgets/book_grid_card.dart';
import '../widgets/category_chips.dart';

/// Экран каталога. MASTER 4.10.
///
/// Структура (сверху вниз):
///   Шапка (заголовок + иконка поиска)
///   Чипы фильтров
///   Сетка книг 2×N (или Empty / Error)
///
/// Pull-to-refresh обновляет список.
class CatalogScreen extends ConsumerWidget {
  const CatalogScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(catalogProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _CatalogHeader(),
        const SizedBox(height: 4),
        const CategoryChips(),
        const SizedBox(height: 12),
        Expanded(child: _buildBody(context, ref, state)),
      ],
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, CatalogState state) {
    if (state.isLoading && state.books.isEmpty) {
      return const _CatalogShimmer();
    }
    if (state.error != null) {
      return ErrorView(
        message: state.error!,
        onRetry: () => ref.read(catalogProvider.notifier).load(),
      );
    }
    if (state.books.isEmpty) {
      return const _EmptyState();
    }
    return RefreshIndicator(
      color: AppColors.terracotta,
      onRefresh: () => ref.read(catalogProvider.notifier).load(),
      child: _CatalogGrid(books: state.books),
    );
  }
}

/// Шапка каталога — заголовок «Каталог» и иконка поиска справа.
class _CatalogHeader extends StatelessWidget {
  const _CatalogHeader();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenPadding,
        vertical: 12,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Каталог',
              style: AppTypography.serifSectionTitle,
            ),
          ),
          InkResponse(
            onTap: () => context.push(Routes.search),
            radius: AppSpacing.minTapTarget / 2,
            child: SizedBox(
              width: AppSpacing.minTapTarget,
              height: AppSpacing.minTapTarget,
              child: const Icon(
                Icons.search,
                color: AppColors.textPrimary,
                size: 24,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Сетка 2×N с книгами.
class _CatalogGrid extends StatelessWidget {
  const _CatalogGrid({required this.books});
  final List<dynamic> books;

  @override
  Widget build(BuildContext context) {
    const horizontalPadding = AppSpacing.screenPadding;
    const crossAxisSpacing = 12.0;
    const mainAxisSpacing = 20.0;
    final screenWidth = MediaQuery.of(context).size.width;
    final coverWidth =
        (screenWidth - horizontalPadding * 2 - crossAxisSpacing) / 2;
    final coverHeight = coverWidth * 1.5;
    // Высота карточки: обложка + 8 + title (2 строки ~40) + 2 + author (~18) + 6 + price (~20)
    // ~ coverHeight + 94. Берём запас 100.
    final cardHeight = coverHeight + 100;

    return GridView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(
        horizontal: horizontalPadding,
        vertical: 4,
      ).copyWith(bottom: 32),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: crossAxisSpacing,
        mainAxisSpacing: mainAxisSpacing,
        mainAxisExtent: cardHeight,
      ),
      itemCount: books.length,
      itemBuilder: (context, index) => BookGridCard(
        book: books[index],
        coverWidth: coverWidth,
      ),
    );
  }
}

/// Скелетон загрузки каталога.
class _CatalogShimmer extends StatelessWidget {
  const _CatalogShimmer();

  @override
  Widget build(BuildContext context) {
    return ShimmerLoading(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenPadding,
        ),
        child: GridView.builder(
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 12,
            mainAxisSpacing: 20,
            childAspectRatio: 2 / 3.5,
          ),
          itemCount: 6,
          itemBuilder: (_, __) => const ShimmerBlock(
            width: double.infinity,
            height: double.infinity,
          ),
        ),
      ),
    );
  }
}

/// Пустое состояние — когда у выбранного фильтра нет книг.
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.menu_book_outlined,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'В этой категории пока нет разборов',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
