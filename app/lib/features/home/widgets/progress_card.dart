import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';

/// Плейсхолдер-карточка «Мой прогресс» для нового юзера.
///
/// Решение из AI-CONTEXT (РЕШЕНИЯ 2.4):
/// - Реального progress API ещё нет — рендерим только плейсхолдер для нового юзера.
/// - Когда будет задача 2.7 (плеер) + progress API — карточка автоматически заполнится.
class ProgressCard extends StatelessWidget {
  const ProgressCard({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
      child: InkWell(
        onTap: () => context.go(Routes.catalog),
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  gradient: AppColors.terracottaGradient,
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: const Icon(
                  Icons.auto_stories_outlined,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Мой прогресс',
                      style: AppTypography.sectionHeader,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Начните слушать первый разбор',
                      style: AppTypography.caption,
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.arrow_forward_ios,
                color: AppColors.textTertiary,
                size: 14,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
