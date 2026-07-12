import 'package:flutter/material.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Один блок ИИ-разбора: заголовок секции + текст (экраны 4.25 и 4.26).
///
/// Используется для секций «Что эта цитата говорит о вас», «Паттерн»,
/// «Вопрос для размышления», «Главная тема недели» и т.д.
class AnalysisCard extends StatelessWidget {
  const AnalysisCard({
    super.key,
    required this.title,
    required this.text,
    this.icon,
    this.accent = false,
  });

  final String title;
  final String text;
  final IconData? icon;

  /// accent=true — фиолетовая рамка (для «Вопроса для размышления»).
  final bool accent;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.cardGapLarge),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: accent ? AppColors.surfaceLight : AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(
          color: accent ? AppColors.purple.withValues(alpha: 0.35) : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: AppColors.purple),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  style: AppTypography.microBold.copyWith(
                    color: AppColors.textTertiary,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(text, style: AppTypography.bodyLarge),
        ],
      ),
    );
  }
}
