import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../models/quote.dart';
import '../providers/diary_provider.dart';
import '../widgets/quote_card.dart';
import '../widgets/quote_sheet.dart';

/// Дневник (MASTER 4.24).
///
/// Пустое состояние → «Начните с первой цитаты».
/// Активное → статистика (цитат · анализов · дней подряд), кнопки отчётов,
/// лента цитат (новые сверху), FAB «новая цитата».
///
/// ⚠️ 24.07.2026 — АВТО-ОПРОС ЛЕНТЫ ПОКА ИДЁТ АНАЛИЗ. Раньше карточка свежей
/// цитаты висела на «Анализируем…», пока не сделаешь pull-to-refresh: лента
/// (quotesProvider) не перезапрашивалась сама. Теперь, пока хотя бы одна цитата
/// в статусе pending, экран каждые 4 сек тихо перезапрашивает ленту (до ~80 сек)
/// — разбор появляется без ручного обновления. `skipLoadingOnReload: true`
/// держит уже загруженный список во время перезапроса (без мигания спиннером).
class DiaryScreen extends ConsumerStatefulWidget {
  const DiaryScreen({super.key});

  @override
  ConsumerState<DiaryScreen> createState() => _DiaryScreenState();
}

class _DiaryScreenState extends ConsumerState<DiaryScreen> {
  Timer? _timer;
  int _attempts = 0;

  // ~80 секунд опроса — обычно разбор готов за несколько секунд.
  static const int _maxAttempts = 20;
  static const Duration _interval = Duration(seconds: 4);

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Держим таймер опроса включённым, пока в ленте есть цитата в статусе
  /// pending. Как только все разобраны (или анализ выключен) — гасим таймер.
  void _syncPolling(bool anyPending) {
    if (anyPending) {
      if (_timer == null && _attempts < _maxAttempts) {
        _timer = Timer.periodic(_interval, (t) {
          _attempts += 1;
          ref.invalidate(quotesProvider);
          if (_attempts >= _maxAttempts) {
            t.cancel();
            _timer = null;
          }
        });
      }
    } else {
      _timer?.cancel();
      _timer = null;
      // Сбрасываем счётчик, чтобы новая цитата снова могла запустить опрос.
      _attempts = 0;
    }
  }

  Future<void> _openQuoteSheet(BuildContext context) async {
    await showQuoteSheet(context);
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    QuoteModel quote,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Удалить цитату?'),
        content: const Text('Цитата и её анализ будут удалены.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ref.read(diaryActionsProvider).deleteQuote(quote.id);
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось удалить цитату')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // Реагируем на изменения ленты: запустить/остановить авто-опрос.
    ref.listen(quotesProvider, (_, next) {
      next.whenData(
        (quotes) => _syncPolling(quotes.any((q) => q.isAnalyzing)),
      );
    });

    final quotesAsync = ref.watch(quotesProvider);
    final reportAsync = ref.watch(latestReportProvider);
    final monthlyReportAsync = ref.watch(latestMonthlyReportProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: FloatingActionButton(
        backgroundColor: AppColors.terracotta,
        onPressed: () => _openQuoteSheet(context),
        child: const Icon(Icons.edit_outlined, color: Colors.white),
      ),
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              backLabel: 'Профиль',
              onBack: () => context.pop(),
              title: 'Мой дневник',
            ),
            Expanded(
              child: quotesAsync.when(
                skipLoadingOnReload: true,
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _ErrorState(
                  onRetry: () => ref.invalidate(quotesProvider),
                ),
                data: (quotes) {
                  final stats = calculateDiaryStats(quotes);
                  final hasReport = reportAsync.valueOrNull != null;
                  final hasMonthly = monthlyReportAsync.valueOrNull != null;

                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(quotesProvider);
                      ref.invalidate(latestReportProvider);
                      ref.invalidate(latestMonthlyReportProvider);
                    },
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screenPadding,
                        8,
                        AppSpacing.screenPadding,
                        96,
                      ),
                      children: [
                        if (quotes.isEmpty)
                          const _EmptyState()
                        else ...[
                          _StatsRow(stats: stats),
                          if (hasReport) ...[
                            const SizedBox(height: 12),
                            _ReportButton(
                              title: 'Еженедельный отчёт',
                              icon: Icons.insights_outlined,
                              onTap: () => context.push(Routes.weeklyReport),
                            ),
                          ],
                          if (hasMonthly) ...[
                            const SizedBox(height: 12),
                            _ReportButton(
                              title: 'Ежемесячный отчёт',
                              icon: Icons.calendar_month_outlined,
                              onTap: () => context.push(Routes.monthlyReport),
                            ),
                          ],
                          const SizedBox(height: 16),
                          for (final quote in quotes)
                            QuoteCard(
                              quote: quote,
                              // Готовый анализ и «не удался» → экран анализа
                              // (там повтор). Пока считают — тапать нечего.
                              onTapAnalysis:
                                  (quote.hasAnalysis || quote.isFailed)
                                      ? () =>
                                          context.push(Routes.analysis(quote.id))
                                      : null,
                              onDelete: () => _confirmDelete(context, ref, quote),
                            ),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Статистика дневника: цитат · анализов · дней подряд.
class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.stats});

  final DiaryStats stats;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          _StatItem(value: '${stats.quotesCount}', label: 'цитат'),
          _StatItem(value: '${stats.analysesCount}', label: 'анализов'),
          _StatItem(value: '${stats.streakDays}', label: 'дней подряд'),
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

/// Кнопка отчёта (показывается только если соответствующий отчёт есть).
class _ReportButton extends StatelessWidget {
  const _ReportButton({
    required this.title,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          border: Border.all(color: AppColors.terracotta.withValues(alpha: 0.3)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.terracotta),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: AppTypography.bodyMedium.copyWith(color: AppColors.terracotta),
              ),
            ),
            const Icon(Icons.chevron_right, size: 18, color: AppColors.terracotta),
          ],
        ),
      ),
    );
  }
}

/// Пустое состояние дневника.
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 80),
      child: Column(
        children: [
          const Icon(Icons.menu_book_outlined, size: 40, color: AppColors.textMetadata),
          const SizedBox(height: 16),
          Text(
            'Начните с первой цитаты',
            style: AppTypography.serifSectionTitle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Сохраняйте мысли, которые откликнулись, — '
            'и возвращайтесь к ним, когда захотите.',
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Не удалось загрузить дневник',
            style: AppTypography.bodyMedium,
          ),
          const SizedBox(height: 12),
          TextButton(onPressed: onRetry, child: const Text('Повторить')),
        ],
      ),
    );
  }
}
