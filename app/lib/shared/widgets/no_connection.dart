import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/constants/app_spacing.dart';
import 'app_button.dart';

/// Экран «Нет подключения к интернету» (MASTER 4.38).
///
/// Показывается при потере соединения или первом запуске без сети.
/// Apple тестирует этот сценарий — экран ОБЯЗАТЕЛЕН.
class NoConnection extends StatelessWidget {
  const NoConnection({
    super.key,
    required this.onRetry,
    this.showOfflineButton = false,
    this.onContinueOffline,
  });

  final VoidCallback onRetry;
  final bool showOfflineButton;
  final VoidCallback? onContinueOffline;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.wifi_off_rounded,
                size: 40,
                color: AppColors.textTertiary.withOpacity(0.4),
              ),
              const SizedBox(height: 20),
              Text(
                'Нет подключения',
                style: AppTypography.screenTitle,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Проверьте интернет-соединение\nи попробуйте снова',
                style: AppTypography.body.copyWith(
                  color: AppColors.textTertiary,
                  height: 1.6,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              AppButton(
                text: 'Попробовать снова',
                onPressed: onRetry,
              ),
              if (showOfflineButton && onContinueOffline != null) ...[
                const SizedBox(height: 10),
                AppButton(
                  text: 'Продолжить офлайн',
                  onPressed: onContinueOffline,
                  variant: AppButtonVariant.outline,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
