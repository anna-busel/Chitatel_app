import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/book_cover_image.dart';

/// Карточка книги в сетке каталога.
/// Тап → экран книги (Routes.book).
///
/// Структура: обложка (соотношение 2:3) + название + автор + статус/цена.
/// Нижняя строка: «Бесплатно» / «Куплено» (тёмно-зелёный) либо цена (винный).
/// Без рейтинга и длительности — этих данных в БД пока нет.
class BookGridCard extends StatelessWidget {
  const BookGridCard({
    super.key,
    required this.book,
    required this.coverWidth,
  });

  final BookModel book;
  final double coverWidth;

  @override
  Widget build(BuildContext context) {
    final coverHeight = coverWidth * 1.5; // соотношение 2:3
    final price = book.displayPriceUsd;
    // «Куплено» показываем только для платных купленных (у бесплатных свой бейдж).
    final showBought = !book.isFree && book.isOwned;

    return InkWell(
      onTap: () => context.push(Routes.book(book.id)),
      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              BookCoverImage(
                imageUrl: book.coverImageUrl,
                gradientColors: book.coverGradientColors,
                label: book.coverLabel,
                width: coverWidth,
                height: coverHeight,
              ),
              if (book.isFree)
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.freeBadge,
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
          // Автор скрыт, если пустой (у биографий автора нет — просьба Анны).
          if (book.author.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              book.author,
              style: AppTypography.caption,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 6),
          if (book.isFree)
            Text(
              'Бесплатно',
              style: AppTypography.bodyBold.copyWith(
                color: AppColors.freeBadge,
              ),
            )
          else if (showBought)
            Text(
              'Куплено',
              style: AppTypography.bodyBold.copyWith(
                color: AppColors.freeBadge,
              ),
            )
          else if (price != null)
            Text(
              price,
              style: AppTypography.bodyBold.copyWith(
                color: AppColors.terracotta,
              ),
            ),
        ],
      ),
    );
  }
}
