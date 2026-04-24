import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/book_cover_image.dart';

/// Секция «Популярные» — горизонтальный скролл платных книг с ценами.
/// Показывается только если список непустой (для гостя бэкенд вернёт []).
class PopularBooksSection extends StatelessWidget {
  const PopularBooksSection({super.key, required this.books});
  final List<BookModel> books;

  @override
  Widget build(BuildContext context) {
    if (books.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenPadding,
          ),
          child: Text(
            'Популярные',
            style: AppTypography.serifSectionTitle,
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          height: 270,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenPadding,
            ),
            itemCount: books.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) => _PopularBookCard(book: books[index]),
          ),
        ),
      ],
    );
  }
}

class _PopularBookCard extends StatelessWidget {
  const _PopularBookCard({required this.book});
  final BookModel book;

  @override
  Widget build(BuildContext context) {
    final price = book.displayPriceUsd;

    return SizedBox(
      width: 140,
      child: InkWell(
        onTap: () => context.push(Routes.bookDetails(book.id)),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BookCoverImage(
              imageUrl: book.coverImageUrl,
              gradientColors: book.coverGradientColors,
              label: book.coverLabel,
              width: 140,
              height: 180,
            ),
            const SizedBox(height: 8),
            Text(
              book.title,
              style: AppTypography.bodyMedium,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              book.author,
              style: AppTypography.caption,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            if (price != null)
              Text(
                price,
                style: AppTypography.bodyBold.copyWith(
                  color: AppColors.terracotta,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
