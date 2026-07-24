import 'package:flutter/material.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/quote.dart';

/// Карточка цитаты в ленте дневника (4.24).
///
/// Показывает текст, автора/книгу, дату и статус ИИ-разбора:
///   ready   → «Анализ от Анны →» (тап открывает экран 4.25)
///   pending → «Анализируем…»
///   failed  → «Анализ временно недоступен»
///   skipped → ничего (ИИ выключен)
///
/// ⚠️ 24.07.2026 — акцент строки разбора переведён с фиолетового
/// (AppColors.purple) на брендовый винный (AppColors.terracotta).
class QuoteCard extends StatelessWidget {
  const QuoteCard({
    super.key,
    required this.quote,
    this.onTapAnalysis,
    this.onDelete,
  });

  final QuoteModel quote;
  final VoidCallback? onTapAnalysis;
  final VoidCallback? onDelete;

  String _formatDate(DateTime date) {
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
    ];
    final d = date.toLocal();
    return '${d.day} ${months[d.month - 1]}';
  }

  String get _source {
    final parts = <String>[];
    if ((quote.author ?? '').isNotEmpty) parts.add(quote.author!);
    if ((quote.bookTitle ?? '').isNotEmpty) parts.add('«${quote.bookTitle}»');
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.cardGapLarge),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(quote.text, style: AppTypography.serifQuote),
              ),
              if (onDelete != null)
                GestureDetector(
                  onTap: onDelete,
                  behavior: HitTestBehavior.opaque,
                  child: const SizedBox(
                    width: AppSpacing.minTapTarget,
                    height: AppSpacing.minTapTarget,
                    child: Icon(
                      Icons.delete_outline,
                      size: 20,
                      color: AppColors.textMetadata,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              if (_source.isNotEmpty)
                Expanded(
                  child: Text(
                    _source,
                    style: AppTypography.small,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                )
              else
                const Spacer(),
              Text(_formatDate(quote.createdAt), style: AppTypography.micro),
            ],
          ),
          if (quote.aiStatus != 'skipped') ...[
            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 12),
            _AiStatusRow(quote: quote, onTapAnalysis: onTapAnalysis),
          ],
        ],
      ),
    );
  }
}

class _AiStatusRow extends StatelessWidget {
  const _AiStatusRow({required this.quote, this.onTapAnalysis});

  final QuoteModel quote;
  final VoidCallback? onTapAnalysis;

  @override
  Widget build(BuildContext context) {
    if (quote.isAnalyzing) {
      return Row(
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.terracotta,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'Анализируем…',
            style: AppTypography.captionMedium
                .copyWith(color: AppColors.terracotta),
          ),
        ],
      );
    }

    if (quote.isFailed) {
      return Text(
        'Анализ временно недоступен',
        style: AppTypography.caption.copyWith(color: AppColors.textTertiary),
      );
    }

    if (quote.hasAnalysis) {
      return GestureDetector(
        onTap: onTapAnalysis,
        behavior: HitTestBehavior.opaque,
        child: Row(
          children: [
            const Icon(Icons.auto_awesome,
                size: 16, color: AppColors.terracotta),
            const SizedBox(width: 8),
            Text(
              'Анализ от Анны',
              style: AppTypography.bodyMedium
                  .copyWith(color: AppColors.terracotta),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.arrow_forward,
              size: 14,
              color: AppColors.terracotta,
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}
