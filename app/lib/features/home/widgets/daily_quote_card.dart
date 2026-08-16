import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../auth/providers/auth_provider.dart';
import '../../diary/widgets/quote_sheet.dart';
import '../services/home_service.dart';

/// Карточка «Мысль дня» на главной — цитата дня с источником.
///
/// Кнопка «В дневник» (задача 5.3) открывает шторку «Новая цитата» (4.17)
/// с предзаполненными текстом, автором и книгой — их можно отредактировать
/// перед сохранением.
class DailyQuoteCard extends ConsumerWidget {
  const DailyQuoteCard({super.key, required this.quote});
  final DailyQuote quote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              // Мысль дня может быть фразой Анны без книги-источника (bookTitle
              // пустой) — тогда показываем только автора, без пустых «».
              quote.bookTitle.isEmpty
                  ? '— ${quote.author}'
                  : '— ${quote.author}, «${quote.bookTitle}»',
              style: AppTypography.caption.copyWith(
                color: AppColors.textTertiary,
              ),
            ),
            const SizedBox(height: 14),
            _ToDiaryButton(
              onTap: () {
                // M11: гость — дневника нет, ведём на вход.
                if (ref.read(authProvider).status != AuthStatus.authenticated) {
                  context.push(Routes.login);
                  return;
                }
                showQuoteSheet(
                  context,
                  text: quote.text,
                  author: quote.author,
                  bookTitle: quote.bookTitle,
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Кнопка «В дневник» (прототип v4.2 — карточка «Мысль дня»).
class _ToDiaryButton extends StatelessWidget {
  const _ToDiaryButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: double.infinity,
          height: AppSpacing.minTapTarget,
          decoration: BoxDecoration(
            color: AppColors.surfaceLight,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.edit_outlined,
                size: 16,
                color: AppColors.textPrimary,
              ),
              const SizedBox(width: 8),
              Text('В дневник', style: AppTypography.bodyMedium),
            ],
          ),
        ),
      ),
    );
  }
}
