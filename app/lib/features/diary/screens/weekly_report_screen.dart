import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/utils/plural.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../models/report_summary.dart';
import '../models/weekly_report.dart';
import '../providers/diary_provider.dart';
import '../widgets/analysis_card.dart';
import '../widgets/quote_card.dart';
import '../widgets/recommendation_card.dart';

/// Еженедельный отчёт (MASTER 4.26).
///
/// Показывает отчёт: неделя, статистика (цитат · авторов · дней), личное письмо
/// Анны (insights), рекомендованные разборы (карточки с обложкой) и ваши цитаты.
///
/// ⚠️ 27.07.2026 — АРХИВ/ПЕРЕКЛЮЧАТЕЛЬ. По умолчанию открывается последний отчёт,
/// но заголовок с датой кликабелен (когда отчётов больше одного): тап открывает
/// список всех недель → выбор переключает отчёт на месте (selectedWeekProvider).
/// Свежий отчёт по-прежнему открывается сразу из дневника.
class WeeklyReportScreen extends ConsumerWidget {
  const WeeklyReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(currentWeeklyReportProvider);

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
              title: 'Еженедельный отчёт',
            ),
            Expanded(
              child: reportAsync.when(
                skipLoadingOnReload: true,
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _Message(
                  text: 'Не удалось загрузить отчёт',
                  onRetry: () => ref.invalidate(currentWeeklyReportProvider),
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

const _months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String _formatRange(DateTime start, DateTime end) {
  final s = start.toLocal();
  final e = end.toLocal();
  if (s.month == e.month) {
    return '${s.day}–${e.day} ${_months[e.month - 1]}';
  }
  return '${s.day} ${_months[s.month - 1]} – ${e.day} ${_months[e.month - 1]}';
}

class _Content extends StatelessWidget {
  const _Content({required this.report});

  final WeeklyReportModel report;

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
        _WeekPeriodSelector(report: report),
        const SizedBox(height: 14),

        // Статистика недели
        Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              _StatItem(
                value: '${report.stats.quotesCount}',
                label: plural(
                    report.stats.quotesCount, 'цитата', 'цитаты', 'цитат'),
              ),
              _StatItem(
                value: '${report.stats.uniqueAuthors}',
                label: plural(
                    report.stats.uniqueAuthors, 'автор', 'автора', 'авторов'),
              ),
              _StatItem(
                value: '${report.stats.activeDays}',
                label: plural(report.stats.activeDays, 'день', 'дня', 'дней'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Личное письмо Анны
        AnalysisCard(
          title: 'Разбор недели',
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

        if (report.quotes.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'ВАШИ ЦИТАТЫ',
            style: AppTypography.microBold.copyWith(letterSpacing: 0.8),
          ),
          const SizedBox(height: 10),
          for (final quote in report.quotes) QuoteCard(quote: quote),
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

/// Заголовок-переключатель периода. Если недельных отчётов больше одного —
/// кликабелен и открывает список всех недель.
class _WeekPeriodSelector extends ConsumerWidget {
  const _WeekPeriodSelector({required this.report});

  final WeeklyReportModel report;

  void _openPicker(
    BuildContext context,
    WidgetRef ref,
    List<WeeklyReportSummary> list,
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
              child: Text('Все недельные отчёты', style: AppTypography.bodyMedium),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final s = list[i];
                  final selected =
                      s.weekNumber == report.weekNumber && s.year == report.year;
                  return ListTile(
                    title: Text(
                      'Неделя ${s.weekNumber} · ${_formatRange(s.startDate, s.endDate)}',
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
                      ref.read(selectedWeekProvider.notifier).state =
                          (week: s.weekNumber, year: s.year);
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
    final list = ref.watch(weeklyReportListProvider).valueOrNull ?? const [];
    final hasArchive = list.length > 1;

    final label =
        'Неделя ${report.weekNumber} · ${_formatRange(report.startDate, report.endDate)}';

    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(child: Text(label, style: AppTypography.serifSectionTitle)),
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
          const Icon(Icons.insights_outlined, size: 40, color: AppColors.textMetadata),
          const SizedBox(height: 16),
          Text('Отчёта пока нет', style: AppTypography.serifSectionTitle),
          const SizedBox(height: 8),
          Text(
            'Отчёт приходит по понедельникам, если за неделю сохранено '
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
