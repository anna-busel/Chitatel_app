import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../models/monthly_report.dart';
import '../models/report_summary.dart';
import '../providers/diary_provider.dart';
import '../widgets/analysis_card.dart';
import '../widgets/recommendation_card.dart';

/// Ежемесячный отчёт (MASTER 4.26).
///
/// Показывает месячный отчёт: месяц, статистика (цитат · авторов · недель),
/// глубокое письмо Анны за месяц (insights) и рекомендованные разборы.
///
/// ⚠️ 27.07.2026 — АРХИВ/ПЕРЕКЛЮЧАТЕЛЬ. По умолчанию открывается последний
/// месячный отчёт, заголовок с месяцем кликабелен (когда отчётов больше одного):
/// тап открывает список всех месяцев → выбор переключает отчёт на месте.
class MonthlyReportScreen extends ConsumerWidget {
  const MonthlyReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(currentMonthlyReportProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              backLabel: 'Дневник',
              // Экран может быть открыт из пуша без стека — тогда уходим
              // на главную, чтобы не остаться в тупике без выхода.
              onBack: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go(Routes.home);
                }
              },
              title: 'Ежемесячный отчёт',
            ),
            Expanded(
              child: reportAsync.when(
                skipLoadingOnReload: true,
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _Message(
                  text: 'Не удалось загрузить отчёт',
                  onRetry: () => ref.invalidate(currentMonthlyReportProvider),
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

const _monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

String _formatMonth(int month, int year) {
  if (month < 1 || month > 12) return '$year';
  return '${_monthNames[month - 1]} $year';
}

class _Content extends StatelessWidget {
  const _Content({required this.report});

  final MonthlyReportModel report;

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
        _MonthPeriodSelector(report: report),
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

/// Заголовок-переключатель месяца. Если месячных отчётов больше одного —
/// кликабелен и открывает список всех месяцев.
class _MonthPeriodSelector extends ConsumerWidget {
  const _MonthPeriodSelector({required this.report});

  final MonthlyReportModel report;

  void _openPicker(
    BuildContext context,
    WidgetRef ref,
    List<MonthlyReportSummary> list,
  ) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.cardBackground,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
              child: Text('Все месячные отчёты', style: AppTypography.bodyMedium),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final s = list[i];
                  final selected =
                      s.month == report.month && s.year == report.year;
                  return ListTile(
                    title: Text(
                      _formatMonth(s.month, s.year),
                      style: AppTypography.body,
                    ),
                    subtitle: Text(
                      '${s.quotesCount} цитат',
                      style: AppTypography.caption,
                    ),
                    trailing: selected
                        ? const Icon(Icons.check,
                            color: AppColors.terracotta, size: 20)
                        : null,
                    onTap: () {
                      ref.read(selectedMonthProvider.notifier).state =
                          (month: s.month, year: s.year);
                      Navigator.of(ctx).pop();
                    },
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(monthlyReportListProvider).valueOrNull ?? const [];
    final hasArchive = list.length > 1;

    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: Text(
            _formatMonth(report.month, report.year),
            style: AppTypography.serifSectionTitle,
          ),
        ),
        if (hasArchive) ...[
          const SizedBox(width: 6),
          const Icon(Icons.expand_more, size: 22, color: AppColors.terracotta),
        ],
      ],
    );

    if (!hasArchive) return content;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openPicker(context, ref, list),
      child: content,
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
