import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../models/weekly_report.dart';
import '../providers/diary_provider.dart';
import '../widgets/analysis_card.dart';
import '../widgets/quote_card.dart';

/// Еженедельный отчёт (MASTER 4.26).
///
/// Показывает последний отчёт: неделя, статистика, тема недели, наблюдение,
/// ваши цитаты и рекомендация разбора (если ИИ подобрал книгу из каталога).
///
/// Минуты прослушивания пока не показываем — сервер их не считает
/// (недельная статистика прослушивания — задача 6.2).
class WeeklyReportScreen extends ConsumerWidget {
  const WeeklyReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(latestReportProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              backLabel: 'Дневник',
              onBack: () => context.pop(),
              title: 'Еженедельный отчёт',
            ),
            Expanded(
              child: reportAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _Message(
                  text: 'Не удалось загрузить отчёт',
                  onRetry: () => ref.invalidate(latestReportProvider),
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

  final WeeklyReportModel report;

  String _formatRange(DateTime start, DateTime end) {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    final s = start.toLocal();
    final e = end.toLocal();
    if (s.month == e.month) {
      return '${s.day}–${e.day} ${months[e.month - 1]}';
    }
    return '${s.day} ${months[s.month - 1]} – ${e.day} ${months[e.month - 1]}';
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
          'Неделя ${report.weekNumber} · ${_formatRange(report.startDate, report.endDate)}',
          style: AppTypography.serifSectionTitle,
        ),
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
              _StatItem(value: '${report.stats.quotesCount}', label: 'цитат'),
              _StatItem(value: '${report.stats.analysesCount}', label: 'анализов'),
            ],
          ),
        ),
        const SizedBox(height: 16),

        AnalysisCard(
          title: 'Главная тема недели',
          text: report.weekTheme,
          icon: Icons.auto_awesome,
        ),
        AnalysisCard(
          title: 'Что это может значить',
          text: report.insight,
          icon: Icons.lightbulb_outline,
        ),

        if (report.quotes.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'ВАШИ ЦИТАТЫ',
            style: AppTypography.microBold.copyWith(letterSpacing: 0.8),
          ),
          const SizedBox(height: 10),
          for (final quote in report.quotes) QuoteCard(quote: quote),
        ],

        if (report.recommendation != null)
          _RecommendationCard(recommendation: report.recommendation!),

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

/// Рекомендация разбора. Кнопка ведёт на экран книги —
/// там уже «Слушать» / «Купить» / «Продолжить» (покупка только через Apple).
class _RecommendationCard extends StatelessWidget {
  const _RecommendationCard({required this.recommendation});

  final Recommendation recommendation;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'РЕКОМЕНДАЦИЯ',
            style: AppTypography.microBold.copyWith(letterSpacing: 0.8),
          ),
          const SizedBox(height: 10),
          Text(recommendation.title, style: AppTypography.serifBookTitle),
          if (recommendation.author.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(recommendation.author, style: AppTypography.small),
          ],
          if (recommendation.why.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(recommendation.why, style: AppTypography.body),
          ],
          const SizedBox(height: 14),
          GestureDetector(
            onTap: () => context.push(Routes.book(recommendation.bookId!)),
            behavior: HitTestBehavior.opaque,
            child: SizedBox(
              height: AppSpacing.minTapTarget,
              child: Row(
                children: [
                  Text(
                    'Открыть разбор',
                    style: AppTypography.bodyMedium.copyWith(
                      color: AppColors.terracotta,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.arrow_forward,
                    size: 16,
                    color: AppColors.terracotta,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
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
            'Отчёт приходит по воскресеньям, если за неделю сохранено '
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
