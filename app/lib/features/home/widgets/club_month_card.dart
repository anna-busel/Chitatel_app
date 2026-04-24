import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/book_cover_image.dart';

/// Карточка «Клуб месяца» на главной.
/// Большой баннер с обложкой книги, названием клуба, кнопкой «Подробнее».
///
/// Если clubBook == null (в БД нет книги клуба текущего месяца) —
/// показываем нейтральный плейсхолдер-баннер с приглашением в клуб.
class ClubMonthCard extends StatelessWidget {
  const ClubMonthCard({
    super.key,
    required this.book,
    required this.monthLabel,
  });

  /// null → пока нет книги клуба (плейсхолдер-баннер)
  final BookModel? book;
  final String? monthLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
      child: InkWell(
        onTap: () => context.go(Routes.club),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Container(
          decoration: BoxDecoration(
            gradient: AppColors.coffeeGradient,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            boxShadow: AppColors.cardShadow,
          ),
          padding: const EdgeInsets.all(20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Обложка
              BookCoverImage(
                imageUrl: book?.coverImageUrl ?? '',
                gradientColors: book?.coverGradientColors ?? const ['#2D1810', '#5C3020'],
                label: book?.coverLabel ?? '',
                width: 90,
                height: 135,
              ),
              const SizedBox(width: 16),

              // Текст
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.terracotta,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'КЛУБ МЕСЯЦА',
                        style: AppTypography.badge,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      book?.title ?? 'Присоединяйтесь к клубу',
                      style: AppTypography.serifBookTitle.copyWith(
                        color: Colors.white,
                        fontSize: 20,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      book?.author.isNotEmpty == true
                          ? book!.author
                          : 'Узнайте книгу месяца',
                      style: AppTypography.caption.copyWith(
                        color: Colors.white.withValues(alpha: 0.75),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.3),
                        ),
                      ),
                      child: const Text(
                        'Подробнее →',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
