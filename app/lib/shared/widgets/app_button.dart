import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/constants/app_sizes.dart';

/// Варианты кнопок.
enum AppButtonVariant { primary, outline, danger }

/// Основная кнопка приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 5.4 (Btn)
///
/// Высота: ~46px, скругление: 14px, шрифт: 17px weight 700.
/// Варианты: primary (терракота), outline (прозрачный + рамка), danger (красный).
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.isLoading = false,
    this.isExpanded = true,
  });

  final String text;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final bool isLoading;
  final bool isExpanded;

  @override
  Widget build(BuildContext context) {
    final bool isOutline = variant == AppButtonVariant.outline;
    final bool isDanger = variant == AppButtonVariant.danger;

    final Color bgColor = isOutline
        ? Colors.transparent
        : isDanger
            ? AppColors.error
            : AppColors.terracotta;

    final Color textColor = isOutline ? AppColors.terracotta : Colors.white;

    final List<BoxShadow> shadow = isOutline
        ? []
        : isDanger
            ? AppColors.dangerButtonShadow
            : AppColors.buttonShadow;

    return SizedBox(
      width: isExpanded ? double.infinity : null,
      height: AppSizes.buttonHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          border: isOutline
              ? Border.all(color: AppColors.terracotta, width: 1.5)
              : null,
          boxShadow: onPressed != null ? shadow : [],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: isLoading ? null : onPressed,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            child: Center(
              child: isLoading
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: textColor,
                      ),
                    )
                  : Text(
                      text,
                      style: AppTypography.button.copyWith(color: textColor),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
