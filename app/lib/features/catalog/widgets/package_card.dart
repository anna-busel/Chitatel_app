import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/models/package_model.dart';
import '../../../shared/widgets/book_cover_image.dart';

/// Карточка пакета в сетке каталога (фильтр «Пакеты»).
/// Тап → экран пакета (Routes.package).
class PackageCard extends StatelessWidget {
  const PackageCard({
    super.key,
    required this.package,
    required this.coverWidth,
  });

  final PackageModel package;
  final double coverWidth;

  @override
  Widget build(BuildContext context) {
    final coverHeight = coverWidth * 1.5; // соотношение 2:3
    final price = package.displayPriceUsd;

    return InkWell(
      onTap: () => context.push(Routes.package(package.id)),
      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              BookCoverImage(
                imageUrl: package.coverImageUrl,
                gradientColors: package.coverGradientColors,
                label: package.coverLabel,
                width: coverWidth,
                height: coverHeight,
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
                    color: AppColors.terracotta,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'ПАКЕТ',
                    style: AppTypography.badge,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            package.title,
            style: AppTypography.bodyMedium,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            '${package.bookCount} ${razborWord(package.bookCount)}',
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
    );
  }
}

/// Склонение слова «разбор» по числу: 1 разбор, 2 разбора, 5 разборов.
String razborWord(int n) {
  final mod10 = n % 10;
  final mod100 = n % 100;
  if (mod10 == 1 && mod100 != 11) return 'разбор';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'разбора';
  return 'разборов';
}
