import 'package:flutter/material.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

/// Зелёная кнопка запуска прослушивания (MASTER 4.12/4.14).
///
/// Была приватным `_GreenListenButton` в book_screen; в 1.0.2 вынесена сюда,
/// потому что тот же вид нужен во вкладке клуба — части разбора переехали
/// туда, и кнопка там обязана выглядеть так же, как в каталоге (тёмно-зелёная,
/// с треугольником), а не как обычная винная кнопка.
///
/// `enabled: false` — аудио ещё не залито: серый неактивный вариант.
class ListenButton extends StatelessWidget {
  const ListenButton({
    super.key,
    required this.label,
    required this.onTap,
    required this.enabled,
  });

  final String label;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    if (!enabled) {
      // Disabled-вариант: серый фон, текст «Аудио загружается».
      return SizedBox(
        width: double.infinity,
        height: 48,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.surfaceMedium,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.hourglass_empty,
                  color: AppColors.textTertiary, size: 20),
              const SizedBox(width: 8),
              Text(
                'Аудио загружается',
                style: AppTypography.button.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return SizedBox(
      width: double.infinity,
      height: 48,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppColors.freeBadge,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.play_arrow, color: Colors.white, size: 24),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: AppTypography.button.copyWith(color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
