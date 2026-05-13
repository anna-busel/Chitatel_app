import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../providers/player_provider.dart';

/// Шторка выбора скорости воспроизведения (MASTER 4.18).
///
/// 5 вариантов: 0.75× / 1.0× / 1.25× / 1.5× / 2.0×.
/// Выбранная — заливка терракотой, остальные — surface light.
///
/// Скорость сохраняется между сессиями (через playerSpeedProvider →
/// SharedPreferences). Стандарт как у Apple Books, Audible.
///
/// Открывать через:
/// ```
/// showModalBottomSheet(
///   context: context,
///   backgroundColor: Colors.transparent,
///   useRootNavigator: true,
///   builder: (_) => const SpeedSheet(),
/// );
/// ```
class SpeedSheet extends ConsumerWidget {
  const SpeedSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentSpeed = ref.watch(playerSpeedProvider);

    return SafeArea(
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.background,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _DragHandle(),
            const SizedBox(height: 16),
            Text(
              'Скорость',
              style: AppTypography.serifSectionTitle,
            ),
            const SizedBox(height: 20),
            // 5 кнопок скорости в строку
            Row(
              children: [
                for (final speed in kPlayerSpeeds) ...[
                  Expanded(
                    child: _SpeedButton(
                      speed: speed,
                      isSelected: currentSpeed == speed,
                      onTap: () async {
                        await ref
                            .read(playerSpeedProvider.notifier)
                            .setSpeed(speed);
                        if (context.mounted) Navigator.of(context).pop();
                      },
                    ),
                  ),
                  if (speed != kPlayerSpeeds.last) const SizedBox(width: 8),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DragHandle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 36,
        height: 4,
        decoration: BoxDecoration(
          color: AppColors.border,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _SpeedButton extends StatelessWidget {
  const _SpeedButton({
    required this.speed,
    required this.isSelected,
    required this.onTap,
  });

  final double speed;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final label = _formatSpeed(speed);

    return Semantics(
      label: 'Скорость $label, ${isSelected ? "выбрана" : "не выбрана"}',
      button: true,
      selected: isSelected,
      child: Material(
        color: isSelected ? AppColors.terracotta : AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          child: Container(
            height: 56,
            alignment: Alignment.center,
            child: Text(
              label,
              style: AppTypography.button.copyWith(
                color: isSelected ? Colors.white : AppColors.textPrimary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// 1.0 → "1×", 1.25 → "1.25×", 0.75 → "0.75×", 2.0 → "2×".
  String _formatSpeed(double speed) {
    if (speed == speed.toInt()) {
      return '${speed.toInt()}×';
    }
    return '$speed×';
  }
}
