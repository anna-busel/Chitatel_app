import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../providers/player_provider.dart';

/// Шторка таймера сна (MASTER 4.19, прототип v4.2).
///
/// Цвета — точный матч прототипа (строка 1075):
/// - background: AppColors.darkCoffee (#1A0E08)
/// - текст: белый
/// - drag-handle: rgba(255,255,255,0.2)
/// - кнопки: rgba(255,255,255,0.08)
/// - акцент: terracotta
///
/// 5 опций: 15 / 30 / 45 / 60 мин / Конец части.
/// Если таймер уже активен — показывается счётчик и кнопка «Отменить».
class SleepTimerSheet extends ConsumerWidget {
  const SleepTimerSheet({super.key});

  /// Список опций таймера в минутах. Используется в _TimerOptions.
  static const List<int> minutesOptions = [15, 30, 45, 60];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final handler = ref.read(audioHandlerProvider);
    final remainingAsync = ref.watch(sleepTimerRemainingProvider);

    return SafeArea(
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.darkCoffee,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _DragHandle(),
            const SizedBox(height: 16),
            const Text(
              'Таймер сна',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 20),

            // Если таймер активен — счётчик + «Отменить»
            remainingAsync.when(
              data: (remaining) {
                final isActive =
                    remaining != null || handler.sleepUntilEndOfPart;
                if (isActive) {
                  return _ActiveTimerCard(
                    remaining: remaining,
                    isEndOfPart: handler.sleepUntilEndOfPart,
                    onCancel: () {
                      handler.cancelSleepTimer();
                      Navigator.of(context).pop();
                    },
                  );
                }
                return _TimerOptions(
                  onMinutesSelected: (m) {
                    handler.setSleepTimer(Duration(minutes: m));
                    Navigator.of(context).pop();
                  },
                  onEndOfPartSelected: () {
                    handler.setSleepUntilEndOfPart();
                    Navigator.of(context).pop();
                  },
                );
              },
              loading: () => _TimerOptions(
                onMinutesSelected: (m) {
                  handler.setSleepTimer(Duration(minutes: m));
                  Navigator.of(context).pop();
                },
                onEndOfPartSelected: () {
                  handler.setSleepUntilEndOfPart();
                  Navigator.of(context).pop();
                },
              ),
              error: (_, __) => _TimerOptions(
                onMinutesSelected: (m) {
                  handler.setSleepTimer(Duration(minutes: m));
                  Navigator.of(context).pop();
                },
                onEndOfPartSelected: () {
                  handler.setSleepUntilEndOfPart();
                  Navigator.of(context).pop();
                },
              ),
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
          color: Colors.white.withOpacity(0.2),
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

class _ActiveTimerCard extends StatelessWidget {
  const _ActiveTimerCard({
    required this.remaining,
    required this.isEndOfPart,
    required this.onCancel,
  });

  final Duration? remaining;
  final bool isEndOfPart;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final label = isEndOfPart
        ? 'До конца текущей части'
        : 'Осталось ${_formatRemaining(remaining ?? Duration.zero)}';

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.08),
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          ),
          child: Column(
            children: [
              const Icon(Icons.bedtime_outlined,
                  size: 28, color: AppColors.terracotta),
              const SizedBox(height: 8),
              Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 48,
          child: Semantics(
            label: 'Отменить таймер сна',
            button: true,
            child: Material(
              color: AppColors.terracotta,
              borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
              child: InkWell(
                onTap: onCancel,
                borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
                child: Center(
                  child: Text(
                    'Отменить',
                    style: AppTypography.button.copyWith(color: Colors.white),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  String _formatRemaining(Duration d) {
    if (d.inHours > 0) {
      final m = d.inMinutes.remainder(60);
      return '${d.inHours} ч $m мин';
    }
    if (d.inMinutes > 0) {
      return '${d.inMinutes} мин';
    }
    return '${d.inSeconds} сек';
  }
}

class _TimerOptions extends StatelessWidget {
  const _TimerOptions({
    required this.onMinutesSelected,
    required this.onEndOfPartSelected,
  });

  final ValueChanged<int> onMinutesSelected;
  final VoidCallback onEndOfPartSelected;

  @override
  Widget build(BuildContext context) {
    final opts = SleepTimerSheet.minutesOptions;
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: _TimerButton(
                label: '${opts[0]} мин',
                onTap: () => onMinutesSelected(opts[0]),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _TimerButton(
                label: '${opts[1]} мин',
                onTap: () => onMinutesSelected(opts[1]),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _TimerButton(
                label: '${opts[2]} мин',
                onTap: () => onMinutesSelected(opts[2]),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _TimerButton(
                label: '${opts[3]} мин',
                onTap: () => onMinutesSelected(opts[3]),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _TimerButton(
          label: 'Конец части',
          onTap: onEndOfPartSelected,
          isFullWidth: true,
        ),
      ],
    );
  }
}

class _TimerButton extends StatelessWidget {
  const _TimerButton({
    required this.label,
    required this.onTap,
    this.isFullWidth = false,
  });

  final String label;
  final VoidCallback onTap;
  final bool isFullWidth;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Таймер сна: $label',
      button: true,
      child: Material(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
          child: Container(
            width: isFullWidth ? double.infinity : null,
            height: 56,
            alignment: Alignment.center,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
