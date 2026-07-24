import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../models/monthly_report.dart';
import '../providers/diary_provider.dart';
import '../widgets/analysis_card.dart';
import '../widgets/recommendation_card.dart';

/// Ежемесячный отчёт (MASTER 4.26).
///
/// Показывает последний месячный отчёт: месяц, статистика (цитат · авторов ·
/// недель), глубокое письмо Анны за месяц (insights) и рекомендованные разборы.
class MonthlyReportScreen extends ConsumerWidget {
  const MonthlyReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(latestMonthlyReportProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              backLabel: 'Дневник',
              onBack: () => context.pop(),
              title: 'Ежемесячный отчёт',
            ),
            Expanded(
              child: reportAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _Message(
                  text: 'Не удалось загрузить отчёт',
                  onRetry: () => ref.invalidate(latestMonthlyReportProvider),
                ),
                data: (report) {
                  if (report == null) {
                    return const _EmptyReport();
                  }
                  return _Content(report: report);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.report});

  final MonthlyReportModel report;

  String _formatMonth(int month, int year) {
    const months = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
    ];
    if (month < 1 || month > 12) return '$year';
    return '${months[month - 1]} $year';
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenPadding,
        8,
        AppSpacing.screenPadding,
        32,
      ),
      children: [
        Text(
          _formatMonth(report.month, report.year),
          style: AppTypography.serifSectionTitle,
        ),
        const SizedBox(height: 14),

        // Статистика месяца
        Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              _StatItem(value: '${report.stats.quotesCount}', label: 'цитат'),
              _StatItem(value: '${report.stats.uniqueAuthors}', label: 'авторов'),
              _StatItem(value: '${report.stats.weeksActive}', label: 'недель'),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Глубокое письмо Анны
        AnalysisCard(
          title: 'Разбор месяца',
          text: report.insights,
          icon: Icons.auto_awesome,
          accent: true,
        ),

        if (report.recommendations.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'РЕКОМЕНДАЦИИ',
            style: AppTypography.microBold.copyWith(letterSpacing: 0.8),
          ),
          const SizedBox(height: 10),
          for (final rec in report.recommendations)
            RecommendationCard(recommendation: rec),
        ],

        const SizedBox(height: 8),
        Text(
          'Отчёт создан ИИ и не является терапией',
          style: AppTypography.micro,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: AppTypography.screenTitle),
          const SizedBox(height: 2),
          Text(label, style: AppTypography.small),
        ],
      ),
    );
  }
}

class _EmptyReport extends StatelessWidget {
  const _EmptyReport();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.calendar_month_outlined, size: 40, color: AppColors.textMetadata),
          const SizedBox(height: 16),
          Text('Отчёта пока нет', style: AppTypography.serifSectionTitle),
          const SizedBox(height: 8),
          Text(
            'Месячный отчёт приходит 1-го числа, если за месяц сохранено '
            'не меньше трёх цитат и включён ИИ-анализ.',
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, required this.onRetry});

  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(text, style: AppTypography.bodyMedium),
          const SizedBox(height: 12),
          TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}
