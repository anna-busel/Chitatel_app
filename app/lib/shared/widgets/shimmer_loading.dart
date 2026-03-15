import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_spacing.dart';

/// Скелетон загрузки (shimmer animation).
/// Источник: MASTER.md секции 4.39, 5.4
///
/// Серые мерцающие блоки, имитирующие карточки и текст.
/// Используется при первой загрузке данных.
class ShimmerLoading extends StatelessWidget {
  const ShimmerLoading({
    super.key,
    required this.child,
  });

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.surfaceMedium,
      highlightColor: AppColors.border,
      child: child,
    );
  }
}

/// Прямоугольный блок-заглушка для shimmer.
class ShimmerBlock extends StatelessWidget {
  const ShimmerBlock({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius,
  });

  final double width;
  final double height;
  final double? borderRadius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surfaceMedium,
        borderRadius: BorderRadius.circular(
          borderRadius ?? AppSpacing.radiusCard,
        ),
      ),
    );
  }
}

/// Готовый shimmer-скелетон для главной страницы.
class HomeShimmer extends StatelessWidget {
  const HomeShimmer({super.key});

  @override
  Widget build(BuildContext context) {
    return ShimmerLoading(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenPadding,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ShimmerBlock(width: double.infinity, height: 150),
            const SizedBox(height: 16),
            const ShimmerBlock(width: double.infinity, height: 100),
            const SizedBox(height: 16),
            const ShimmerBlock(width: 140, height: 18),
            const SizedBox(height: 12),
            Row(
              children: const [
                Expanded(child: ShimmerBlock(width: 140, height: 130)),
                SizedBox(width: 10),
                Expanded(child: ShimmerBlock(width: 140, height: 130)),
              ],
            ),
            const SizedBox(height: 16),
            const ShimmerBlock(width: double.infinity, height: 64),
          ],
        ),
      ),
    );
  }
}
