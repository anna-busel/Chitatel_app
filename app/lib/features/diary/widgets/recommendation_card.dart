import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../models/weekly_report.dart';

/// Карточка рекомендованного разбора в отчёте (недельном и месячном).
///
/// Обложка (штатный BookCoverImage — он резолвит asset://book-covers/…) +
/// название/автор. Тап по карточке ведёт на экран книги (там уже «Слушать» /
/// «Купить» / «Продолжить», покупка только через Apple). bookId проставляет сервер.
class RecommendationCard extends StatelessWidget {
  const RecommendationCard({super.key, required this.recommendation});

  final Recommendation recommendation;

  @override
  Widget build(BuildContext context) {
    final rec = recommendation;

    return GestureDetector(
      onTap: rec.bookId != null && rec.bookId!.isNotEmpty
          ? () => context.push(Routes.book(rec.bookId!))
          : null,
      behavior: HitTestBehavior.opaque,
      child: Container(
        margin: const EdgeInsets.only(bottom: AppSpacing.cardGapLarge),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            BookCoverImage(
              imageUrl: rec.coverImageUrl,
              gradientColors: const ['#750009', '#9B1C24'],
              label: rec.title,
              width: 56,
              height: 78,
              borderRadius: 8,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    rec.title,
                    style: AppTypography.serifBookTitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (rec.author.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(rec.author, style: AppTypography.small),
                  ],
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Text(
                        'Открыть разбор',
                        style: AppTypography.bodyMedium.copyWith(
                          color: AppColors.terracotta,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Icon(
                        Icons.arrow_forward,
                        size: 16,
                        color: AppColors.terracotta,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
