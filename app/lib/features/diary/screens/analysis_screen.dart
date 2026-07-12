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
/// Цитата + три блока разбора + дисклеймер «Анализ создан ИИ и не является терапией».
/// Если анализ ещё считается (aiStatus='pending') — показываем ожидание
/// с кнопкой «Обновить».
class AnalysisScreen extends ConsumerWidget {
  const AnalysisScreen({super.key, required this.quoteId});

  final String quoteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quoteAsync = ref.watch(quoteProvider(quoteId));

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
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _Message(
                  text: 'Не удалось загрузить анализ',
                  onRetry: () => ref.invalidate(quoteProvider(quoteId)),
                ),
                data: (quote) => _Content(
                  quote: quote,
                  onRefresh: () => ref.invalidate(quoteProvider(quoteId)),
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
        const Icon(Icons.auto_awesome, size: 26, color: AppColors.purple),
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
          )
        else if (quote.isFailed)
          _Message(
            text: 'Анализ временно недоступен',
            onRetry: onRefresh,
            retryLabel: 'Повторить',
          )
        else if (quote.hasAnalysis) ...[
          AnalysisCard(
            title: 'Что эта цитата говорит о вас',
            text: quote.aiAnalysis!.resonance,
            icon: Icons.favorite_border,
          ),
          AnalysisCard(
            title: 'Паттерн',
            text: quote.aiAnalysis!.context,
            icon: Icons.timeline,
          ),
          AnalysisCard(
            title: 'Вопрос для размышления',
            text: quote.aiAnalysis!.question,
            icon: Icons.help_outline,
            accent: true,
          ),
          const SizedBox(height: 8),
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

class _Message extends StatelessWidget {
  const _Message({
    required this.text,
    required this.onRetry,
    this.retryLabel = 'Повторить',
  });

  final String text;
  final VoidCallback onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 24),
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
