import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/error_view.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// «Мой прогресс» (экран 4.45, задача 6.2).
///
/// Статистика ЗА ВСЁ ВРЕМЯ (решение 12.07.2026): минуты прослушивания, начатые
/// и дослушанные разборы, число цитат. Недельной динамики нет осознанно — база
/// хранит только суммарное время по книге, посуточной истории не существует,
/// а рисовать график из воздуха честнее не показывать вовсе.
class MyProgressScreen extends ConsumerWidget {
  const MyProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(progressStatsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Мой прогресс', style: AppTypography.screenTitle),
      ),
      body: SafeArea(
        child: statsAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: AppColors.terracotta,
              strokeWidth: 2.5,
            ),
          ),
          error: (_, __) => ErrorView(
            message: 'Не удалось загрузить статистику',
            onRetry: () => ref.invalidate(progressStatsProvider),
          ),
          data: (stats) => _Body(stats: stats),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.stats});
  final ProgressStats stats;

  String get _timeLabel {
    final total = stats.totalMinutes;
    if (total < 60) return '$total мин';
    final hours = total ~/ 60;
    final minutes = total % 60;
    if (minutes == 0) return '$hours ч';
    return '$hours ч $minutes мин';
  }

  String get _lastLabel {
    final last = stats.lastListenedAt;
    if (last == null) return 'Вы ещё не начали слушать';
    final l = last.toLocal();
    final dd = l.day.toString().padLeft(2, '0');
    final mm = l.month.toString().padLeft(2, '0');
    return 'Последний раз слушали $dd.$mm.${l.year}';
  }

  @override
  Widget build(BuildContext context) {
    final empty = stats.totalMinutes == 0 &&
        stats.booksStarted == 0 &&
        stats.quotesCount == 0;

    if (empty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.insights_outlined,
                size: 48,
                color: AppColors.textTertiary,
              ),
              const SizedBox(height: 12),
              Text(
                'Пока пусто',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Включите первый разбор — и здесь появится ваша статистика',
                style: AppTypography.caption,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      children: [
        _BigStat(value: _timeLabel, label: 'всего прослушано'),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _SmallStat(
                value: '${stats.booksStarted}',
                label: 'разборов начато',
                icon: Icons.play_circle_outline,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _SmallStat(
                value: '${stats.booksCompleted}',
                label: 'дослушано',
                icon: Icons.check_circle_outline,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _SmallStat(
          value: '${stats.quotesCount}',
          label: 'цитат в дневнике',
          icon: Icons.format_quote,
        ),
        const SizedBox(height: 20),
        Text(
          _lastLabel,
          style: AppTypography.caption,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _BigStat extends StatelessWidget {
  const _BigStat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 28),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: AppTypography.serifSectionTitle.copyWith(
              color: AppColors.terracotta,
              fontSize: 32,
            ),
          ),
          const SizedBox(height: 4),
          Text(label, style: AppTypography.caption),
        ],
      ),
    );
  }
}

class _SmallStat extends StatelessWidget {
  const _SmallStat({
    required this.value,
    required this.label,
    required this.icon,
  });
  final String value;
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.terracotta),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: AppTypography.sectionHeader),
                Text(label, style: AppTypography.caption),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
