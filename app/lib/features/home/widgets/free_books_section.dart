import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/book_cover_image.dart';

/// Секция «Бесплатные разборы» — горизонтальный скролл карточек.
class FreeBooksSection extends StatelessWidget {
  const FreeBooksSection({super.key, required this.books});
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
            'Бесплатные разборы',
            style: AppTypography.serifSectionTitle,
          ),
        ),
        const SizedBox(height: 14),
        SizedBox(
          // Высота с запасом: обложка 180 + gap 8 + title 2 строки (~40) +
          // gap 2 + author 1 строка (~18) + внутренний padding = ~258. Берём 270.
          height: 270,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenPadding,
            ),
            itemCount: books.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) => _FreeBookCard(book: books[index]),
          ),
        ),
      ],
    );
  }
}

class _FreeBookCard extends StatelessWidget {
  const _FreeBookCard({required this.book});
  final BookModel book;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 140,
      child: InkWell(
        onTap: () => context.push(Routes.book(book.id)),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                BookCoverImage(
                  imageUrl: book.coverImageUrl,
                  gradientColors: book.coverGradientColors,
                  label: book.coverLabel,
                  width: 140,
                  height: 180,
                ),
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.success,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'БЕСПЛАТНО',
                      style: AppTypography.badge,
                    ),
                  ),
                ),
              ],
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
          ],
        ),
      ),
    );
  }
}
