import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import 'app_button.dart';

/// Экран ошибки с кнопкой retry.
/// Источник: MASTER.md секция 5.4 (Empty), 11.4
///
/// Используется когда данные не загрузились.
class ErrorView extends StatelessWidget {
  const ErrorView({
    super.key,
    this.icon,
    this.title = 'Что-то пошло не так',
    this.message = 'Попробуйте ещё раз',
    this.retryText = 'Попробовать снова',
    this.onRetry,
  });

  final Widget? icon;
  final String title;
  final String message;
  final String retryText;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Opacity(
                opacity: 0.7,
                child: icon,
              ),
              const SizedBox(height: 16),
            ],
            Text(
              title,
              style: AppTypography.sectionHeader,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              message,
              style: AppTypography.body.copyWith(
                color: AppColors.textTertiary,
              ),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              SizedBox(
                width: 220,
                child: AppButton(
                  text: retryText,
                  onPressed: onRetry,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
