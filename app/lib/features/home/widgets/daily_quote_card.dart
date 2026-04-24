import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../services/home_service.dart';

/// Карточка «Мысль дня» на главной — цитата дня с источником.
class DailyQuoteCard extends StatelessWidget {
  const DailyQuoteCard({super.key, required this.quote});
  final DailyQuote quote;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppColors.cardBackground,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          boxShadow: AppColors.cardShadow,
          border: Border.all(color: AppColors.border, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.format_quote_rounded,
                  color: AppColors.terracotta,
                  size: 20,
                ),
                const SizedBox(width: 6),
                Text(
                  'МЫСЛЬ ДНЯ',
                  style: AppTypography.microBold.copyWith(
                    color: AppColors.terracotta,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              '«${quote.text}»',
              style: AppTypography.serifQuote,
            ),
            const SizedBox(height: 10),
            Text(
              '— ${quote.author}, «${quote.bookTitle}»',
              style: AppTypography.caption.copyWith(
                color: AppColors.textTertiary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
