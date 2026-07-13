import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../services/home_service.dart';

/// «Продолжить слушать» — последний начатый разбор (13.07.2026).
///
/// ЗАМЕНИЛА мёртвую карточку «Мой прогресс» из Фазы 2: та ВСЕГДА писала
/// «Начните слушать первый разбор» (данных не было вовсе) и вела в каталог.
///
/// Дизайн — сознательно КОМПАКТНАЯ СТРОКА, а не карточка с крупной обложкой:
/// на главной уже два ряда обложек (бесплатные и популярные), третий ряд
/// перегрузил бы ленту. Здесь: миниатюра 56×56, название, «Часть 2 · осталось
/// 12 мин», тонкая полоска прогресса и кнопка ▶.
///
/// Тап по строке или по ▶ → плеер, продолжает с сохранённой секунды
/// (startPart/startPosition передаются в PlayerScreen).
///
/// Если ничего не начато — виджет не рисуется (SizedBox.shrink): пустота лучше
/// мёртвой карточки. Статистика (минуты, книги, цитаты) живёт в профиле
/// («Мой прогресс»), на главной ей не место — главная зовёт слушать, а не
/// отчитывается.
class ContinueListeningCard extends StatelessWidget {
  const ContinueListeningCard({super.key, required this.item});

  final ContinueListening? item;

  @override
  Widget build(BuildContext context) {
    final data = item;
    if (data == null) return const SizedBox.shrink();

    final book = data.book;
    final partLabel = data.partTitle != null && data.partTitle!.isNotEmpty
        ? data.partTitle!
        : 'Часть ${data.currentPartNumber}';
    final left = data.minutesLeft;
    final subtitle =
        left != null ? '$partLabel · осталось $left мин' : partLabel;

    void open() {
      context.push(
        Routes.player(book.id),
        extra: {
          'startPart': data.currentPartNumber,
          'startPosition': data.positionSeconds,
        },
      );
    }

    return Padding(
      padding:
          const EdgeInsets.symmetric(horizontal: AppSpacing.screenPadding),
      child: Material(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: InkWell(
          onTap: open,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                // Миниатюра обложки.
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: BookCoverImage(
                    imageUrl: book.coverImageUrl,
                    gradientColors: book.coverGradientColors,
                    label: book.coverLabel,
                    width: 56,
                    height: 56,
                    borderRadius: 10,
                  ),
                ),
                const SizedBox(width: 12),

                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Продолжить слушать',
                        style: AppTypography.micro.copyWith(
                          color: AppColors.terracotta,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        book.title,
                        style: AppTypography.bodyMedium,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: AppTypography.caption,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      // Полоска прогресса внутри части.
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: SizedBox(
                          height: 3,
                          child: LayoutBuilder(
                            builder: (context, constraints) {
                              final w = constraints.maxWidth * data.progress;
                              return Stack(
                                children: [
                                  Container(color: AppColors.surfaceMedium),
                                  Container(
                                    width: w,
                                    color: AppColors.terracotta,
                                  ),
                                ],
                              );
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),

                // Кнопка «продолжить».
                Semantics(
                  button: true,
                  label: 'Продолжить слушать ${book.title}',
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: const BoxDecoration(
                      color: AppColors.terracotta,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.play_arrow,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
