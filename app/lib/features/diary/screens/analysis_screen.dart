import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../models/quote.dart';
import '../providers/diary_provider.dart';
import '../widgets/analysis_card.dart';

/// Экран анализа цитаты (MASTER 4.25).
///
/// Цитата + разбор ИИ (insights) + чипы категории/тем + дисклеймер
/// «Анализ создан ИИ и не является терапией». Пока разбор считается
/// (aiStatus='pending') — экран сам опрашивает сервер каждые 3 сек
/// (до ~36 сек), поэтому результат появляется без ручного обновления.
///
/// ⚠️ 24.07.2026 — `skipLoadingOnReload: true`: во время авто-опроса экран
/// держит уже показанное содержимое (цитату + «Анализируем…»), а не мигает
/// полноэкранным спиннером на каждый перезапрос.
class AnalysisScreen extends ConsumerStatefulWidget {
  const AnalysisScreen({super.key, required this.quoteId});

  final String quoteId;

  @override
  ConsumerState<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends ConsumerState<AnalysisScreen> {
  Timer? _timer;
  int _attempts = 0;

  // ~36 секунд опроса — обычно разбор готов за несколько секунд.
  static const int _maxAttempts = 12;
  static const Duration _interval = Duration(seconds: 3);

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Держим таймер опроса включённым, пока статус 'pending'.
  void _syncPolling(bool isPending) {
    if (isPending) {
      if (_timer == null && _attempts < _maxAttempts) {
        _timer = Timer.periodic(_interval, (t) {
          _attempts += 1;
          ref.invalidate(quoteProvider(widget.quoteId));
          if (_attempts >= _maxAttempts) {
            t.cancel();
            _timer = null;
          }
        });
      }
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Реагируем на смену статуса: запустить/остановить авто-опрос.
    ref.listen(quoteProvider(widget.quoteId), (_, next) {
      next.whenData((q) => _syncPolling(q.isAnalyzing));
    });

    final quoteAsync = ref.watch(quoteProvider(widget.quoteId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            AppTopBar(
              backLabel: 'Дневник',
              onBack: () => context.pop(),
              title: 'Анализ цитаты',
            ),
            Expanded(
              child: quoteAsync.when(
                // Держим уже показанный экран во время авто-опроса — иначе
                // каждые 3с мелькал бы полноэкранный спиннер.
                skipLoadingOnReload: true,
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _Message(
                  text: 'Не удалось загрузить анализ',
                  onRetry: () => ref.invalidate(quoteProvider(widget.quoteId)),
                ),
                data: (quote) => _Content(
                  quote: quote,
                  onRefresh: () => ref.invalidate(quoteProvider(widget.quoteId)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.quote, required this.onRefresh});

  final QuoteModel quote;
  final VoidCallback onRefresh;

  String get _source {
    final parts = <String>[];
    if ((quote.author ?? '').isNotEmpty) parts.add(quote.author!);
    if ((quote.bookTitle ?? '').isNotEmpty) parts.add('«${quote.bookTitle}»');
    return parts.join(' · ');
  }

  List<String> _chips(AiAnalysis a) {
    final chips = <String>[];
    final cat = a.category.trim();
    // «ДРУГОЕ» — служебная категория-предохранитель, пользователю не показываем.
    if (cat.isNotEmpty && cat.toUpperCase() != 'ДРУГОЕ') chips.add(cat);
    for (final t in a.themes) {
      if (t.trim().isNotEmpty) chips.add(t.trim());
    }
    return chips;
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
        const Icon(Icons.auto_awesome, size: 26, color: AppColors.terracotta),
        const SizedBox(height: 14),

        // Сама цитата
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(quote.text, style: AppTypography.serifQuote),
              if (_source.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_source, style: AppTypography.small),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        if (quote.isAnalyzing)
          _Message(
            text: 'Анализируем цитату…\nОбычно это занимает несколько секунд.',
            onRetry: onRefresh,
            retryLabel: 'Обновить',
            showSpinner: true,
          )
        else if (quote.isFailed)
          _Message(
            text: 'Анализ временно недоступен',
            onRetry: onRefresh,
            retryLabel: 'Повторить',
          )
        else if (quote.hasAnalysis) ...[
          AnalysisCard(
            title: 'Разбор',
            text: quote.aiAnalysis!.insights,
            icon: Icons.auto_awesome,
            accent: true,
          ),
          if (_chips(quote.aiAnalysis!).isNotEmpty) ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final chip in _chips(quote.aiAnalysis!)) _Chip(label: chip),
              ],
            ),
            const SizedBox(height: 14),
          ],
          Text(
            'Анализ создан ИИ и не является терапией',
            style: AppTypography.micro,
            textAlign: TextAlign.center,
          ),
        ] else
          Text(
            'ИИ-анализ для этой цитаты выключен',
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
            textAlign: TextAlign.center,
          ),
      ],
    );
  }
}

/// Чип категории/темы под разбором.
class _Chip extends StatelessWidget {
  const _Chip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surfaceLight,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
      ),
      // Единый стиль тегов: # + строчными, чтобы категория (в базе КАПСОМ)
      // и темы выглядели одинаково.
      child: Text('#${label.toLowerCase()}', style: AppTypography.small),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.text,
    required this.onRetry,
    this.retryLabel = 'Повторить',
    this.showSpinner = false,
  });

  final String text;
  final VoidCallback onRetry;
  final String retryLabel;
  final bool showSpinner;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 24),
        if (showSpinner) ...[
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.5,
              color: AppColors.terracotta,
            ),
          ),
          const SizedBox(height: 14),
        ],
        Text(
          text,
          style: AppTypography.body.copyWith(color: AppColors.textSecondary),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        TextButton(onPressed: onRetry, child: Text(retryLabel)),
      ],
    );
  }
}
