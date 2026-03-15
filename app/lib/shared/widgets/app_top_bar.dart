import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_spacing.dart';

/// AppBar с кнопкой «Назад» в стиле ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 5.4 (Back)
///
/// Стрелка ← (терракота) + текст (14px, терракота, weight 500).
/// minHeight: 44px (Apple HIG tap target).
class AppTopBar extends StatelessWidget {
  const AppTopBar({
    super.key,
    this.backLabel = 'Назад',
    this.onBack,
    this.title,
    this.actions,
  });

  final String backLabel;
  final VoidCallback? onBack;
  final String? title;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenPadding,
      ),
      child: SizedBox(
        height: AppSpacing.minTapTarget,
        child: Row(
          children: [
            if (onBack != null)
              GestureDetector(
                onTap: onBack,
                behavior: HitTestBehavior.opaque,
                child: SizedBox(
                  height: AppSpacing.minTapTarget,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.arrow_back_ios_new,
                        size: 20,
                        color: AppColors.terracotta,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        backLabel,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: AppColors.terracotta,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (title != null) ...[
              const Spacer(),
              Text(
                title!,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
              const Spacer(),
            ] else
              const Spacer(),
            if (actions != null) ...actions!,
          ],
        ),
      ),
    );
  }
}
