import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/utils/part_labels.dart';
import '../../../shared/widgets/book_cover_image.dart';
import '../../player/providers/player_provider.dart';
import '../services/home_service.dart';

/// «Продолжить слушать» — последний начатый разбор (13.07.2026).
///
/// ЗАМЕНИЛА мёртвую карточку «Мой прогресс» из Фазы 2: та ВСЕГДА писала
/// «Начните слушать первый разбор» (данных не было вовсе) и вела в каталог.
///
/// Дизайн — сознательно КОМПАКТНАЯ СТРОКА: миниатюра 56×56, название,
/// «Часть 2 · осталось 12 мин», тонкая полоска прогресса и кнопка ▶.
///
/// ⚠️ 24.07.2026 — СИНХРОНИЗАЦИЯ С ПЛЕЕРОМ ПЕРЕДЕЛАНА. Раньше карточка жила
/// только на серверных данных прогресса, а сервер пишет прогресс с задержкой —
/// поэтому при смене части в плеере карточка отставала (висела на 1й части).
/// Прошлый фикс дёргал invalidate(homeProvider) на каждую смену части, но это
/// перерисовывало весь экран в шиммер («не прогружается сразу»). Теперь:
/// если играет ИМЕННО эта книга — часть/позицию/прогресс берём ЖИВЫМИ из
/// плеера (ref.watch), карточка обновляется мгновенно и без перезагрузки.
/// Плеер не активен / играет другая книга → показываем серверные данные.
///
/// Тап → плеер, продолжает с сохранённой (или живой) секунды.
class ContinueListeningCard extends ConsumerWidget {
  const ContinueListeningCard({super.key, required this.item});

  final ContinueListening? item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = item;
    if (data == null) return const SizedBox.shrink();

    final book = data.book;

    // Живое состояние плеера, если играет эта же книга.
    final player = ref.watch(playerUiStateProvider).valueOrNull;
    final bool live =
        player != null && player.hasContent && player.book?.id == book.id;

    final int partNumber = live ? player.partNumber : data.currentPartNumber;
    final int positionSeconds =
        live ? player.position.inSeconds : data.positionSeconds;

    final double progress;
    final int? minutesLeft;
    if (live) {
      progress = player.progress;
      final durSec = player.duration.inSeconds;
      if (durSec > 0) {
        final leftSec = durSec - player.position.inSeconds;
        minutesLeft = leftSec > 0 ? (leftSec / 60).ceil() : 0;
      } else {
        minutesLeft = null;
      }
    } else {
      progress = data.progress;
      minutesLeft = data.minutesLeft;
    }

    // Подпись части. 1.0.2: считаем по частям книги общим хелпером — иначе на
    // приветствии клубного разбора («Приветствие» первой частью) здесь стояло
    // «Часть 1», а в плеере — «Приветствие от Анны». Серверный partTitle
    // оставляем запасным вариантом: он корректен только для серверной части
    // (не для той, что играет прямо сейчас).
    final parts = book.parts
        .map((p) => (number: p.number, title: p.title))
        .toList(growable: false);
    final partLabelText = parts.isNotEmpty
        ? partLabelInBook(number: partNumber, parts: parts)
        : ((!live && data.partTitle != null && data.partTitle!.isNotEmpty)
            ? data.partTitle!
            : 'Часть $partNumber');
    final subtitle = minutesLeft != null
        ? '$partLabelText · осталось $minutesLeft мин'
        : partLabelText;

    void open() {
      context.push(
        Routes.player(book.id),
        extra: {
          'startPart': partNumber,
          'startPosition': positionSeconds,
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
                              final w = constraints.maxWidth * progress;
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
