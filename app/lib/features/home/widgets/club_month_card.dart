import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/models/book_model.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../club/providers/club_provider.dart';

/// Карточка «Клуб месяца» на главной.
/// Баннер с обложкой книги, названием клуба, кнопкой «Подробнее».
///
/// ⚠️ 21.07.2026 — РЕДИЗАЙН ПОД БРЕНД: был тёмный кофейный градиент —
/// теперь бежевая карточка, чёрный текст, винный бейдж «КЛУБ МЕСЯЦА»,
/// кнопка «Подробнее» — винным по белому.
///
/// Если clubBook == null (в БД нет книги клуба текущего месяца) —
/// показываем нейтральный плейсхолдер-баннер с приглашением в клуб.
///
/// ⚠️ 1.0.2 (01.09.2026): тап — это явный выбор ТЕКУЩЕГО клуба. Раньше карточка
/// просто открывала вкладку, а там подписчицу прошлого месяца встречал её
/// архив (M1), и «Подробнее» про новый клуб выглядело как «ничего не
/// произошло». Теперь перед переходом сбрасываем выбранный клуб на текущий и
/// помечаем выбор ручным (clubManualCurrentProvider): без доступа вкладка
/// покажет пейвол нового клуба с шапкой-переключателем, с доступом — сам клуб.
class ClubMonthCard extends ConsumerWidget {
  const ClubMonthCard({
    super.key,
    required this.book,
    required this.monthLabel,
  });

  /// null → пока нет книги клуба (плейсхолдер-баннер)
  final BookModel? book;
  final String? monthLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
      child: InkWell(
        onTap: () {
          ref.read(clubManualCurrentProvider.notifier).state = true;
          ref.read(clubArchiveFallbackProvider.notifier).state = null;
          ref.read(selectedClubIdProvider.notifier).state = null;
          context.go(Routes.club);
        },
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.beige,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            boxShadow: AppColors.cardShadow,
          ),
          padding: const EdgeInsets.all(20),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Обложка
              BookCoverImage(
                imageUrl: book?.coverImageUrl ?? '',
                gradientColors: book?.coverGradientColors ?? const ['#2D1810', '#5C3020'],
                label: book?.coverLabel ?? '',
                width: 90,
                height: 135,
              ),
              const SizedBox(width: 16),

              // Текст
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.terracotta,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'КЛУБ МЕСЯЦА',
                        style: AppTypography.badge,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      book?.title ?? 'Присоединяйтесь к клубу',
                      style: AppTypography.serifBookTitle.copyWith(
                        color: AppColors.textPrimary,
                        fontSize: 20,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      book?.author.isNotEmpty == true
                          ? book!.author
                          : 'Узнайте книгу месяца',
                      style: AppTypography.caption.copyWith(
                        color: AppColors.textSecondary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.cardBackground,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text(
                        'Подробнее →',
                        style: TextStyle(
                          color: AppColors.terracotta,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
