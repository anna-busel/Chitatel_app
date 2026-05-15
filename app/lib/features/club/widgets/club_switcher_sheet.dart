import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/club_summary.dart';
import '../providers/club_provider.dart';

/// Bottom sheet переключателя клубов. Открывается по тапу на шапку клуба.
///
/// Структура:
/// - Заголовок «Клубы»
/// - Группы (если есть): ТЕКУЩИЙ → БУДУЩИЕ → АРХИВ
/// - В каждой строке: название клуба «Клуб <месяца> · <автор>» + бейдж статуса
/// - Текущий выбранный — подсветка terracotta + галочка
///
/// При тапе на клуб — Navigator.pop возвращает id или спец-значение '__current__'
/// (для строки «Сейчас идёт» — чтобы вызвать /current вместо /club/:id).
class ClubSwitcherSheet extends ConsumerWidget {
  const ClubSwitcherSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listAsync = ref.watch(clubListProvider);
    final selectedId = ref.watch(selectedClubIdProvider);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      builder: (ctx, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              // — Drag handle —
              Container(
                margin: const EdgeInsets.only(top: 8, bottom: 4),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // — Заголовок —
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
                child: Row(
                  children: [
                    Text('Клубы', style: AppTypography.serifSectionTitle),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppColors.textTertiary),
                      onPressed: () => Navigator.of(ctx).pop(),
                    ),
                  ],
                ),
              ),

              // — Список —
              Expanded(
                child: listAsync.when(
                  data: (list) => _ClubList(
                    list: list,
                    selectedId: selectedId,
                    scrollController: scrollController,
                  ),
                  loading: () => const Center(
                    child: CircularProgressIndicator(
                      color: AppColors.terracotta,
                      strokeWidth: 2.5,
                    ),
                  ),
                  error: (_, __) => Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: AppColors.textTertiary,
                          size: 32,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Не удалось загрузить список клубов',
                          style: AppTypography.caption,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () => ref.invalidate(clubListProvider),
                          child: Text(
                            'Повторить',
                            style: AppTypography.bodyMedium.copyWith(
                              color: AppColors.terracotta,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ClubList extends StatelessWidget {
  const _ClubList({
    required this.list,
    required this.selectedId,
    required this.scrollController,
  });

  final ClubListResult list;
  final String? selectedId;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    // Сборка плоского списка с заголовками-разделителями для секций.
    final items = <_SheetItem>[];

    if (list.current.isNotEmpty) {
      items.add(const _SheetItem.section('ТЕКУЩИЙ'));
      for (final c in list.current) {
        items.add(_SheetItem.club(c));
      }
    }
    if (list.future.isNotEmpty) {
      items.add(const _SheetItem.section('БУДУЩИЕ'));
      for (final c in list.future) {
        items.add(_SheetItem.club(c));
      }
    }
    if (list.archive.isNotEmpty) {
      items.add(const _SheetItem.section('АРХИВ'));
      for (final c in list.archive) {
        items.add(_SheetItem.club(c));
      }
    }

    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Пока нет доступных клубов',
          style: AppTypography.caption,
          textAlign: TextAlign.center,
        ),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: items.length,
      itemBuilder: (ctx, i) {
        final item = items[i];
        if (item.isSection) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
            child: Text(
              item.sectionTitle!,
              style: AppTypography.microBold.copyWith(
                color: AppColors.textTertiary,
                letterSpacing: 1.2,
              ),
            ),
          );
        }

        final club = item.club!;
        // Текущий клуб (из current) при selectedId == null считаем выбранным —
        // это поведение «по умолчанию», когда юзер ещё ничего не переключал.
        final isSelected = (selectedId == null &&
                club.relation == ClubRelation.current) ||
            (selectedId == club.id);

        return _ClubRow(
          club: club,
          isSelected: isSelected,
          onTap: () {
            // Если выбран текущий клуб — возвращаем спец-значение,
            // чтобы провайдер использовал /current вместо /:id.
            // Это нужно чтобы при возвращении к «текущему» не было лишних
            // зависимостей от конкретного id.
            final result = club.relation == ClubRelation.current
                ? '__current__'
                : club.id;
            Navigator.of(ctx).pop(result);
          },
        );
      },
    );
  }
}

class _ClubRow extends StatelessWidget {
  const _ClubRow({
    required this.club,
    required this.isSelected,
    required this.onTap,
  });

  final ClubSummary club;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.fromLTRB(20, 2, 20, 2),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: isSelected
                ? AppColors.terracotta.withOpacity(0.08)
                : AppColors.cardBackground,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? AppColors.terracotta : AppColors.border,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _clubLabel(club),
                      style: AppTypography.bodyMedium.copyWith(
                        color: isSelected
                            ? AppColors.terracotta
                            : AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      club.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption,
                    ),
                    const SizedBox(height: 4),
                    _StatusBadge(club: club),
                  ],
                ),
              ),
              if (isSelected) ...[
                const SizedBox(width: 8),
                const Icon(
                  Icons.check_circle,
                  color: AppColors.terracotta,
                  size: 22,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _clubLabel(ClubSummary c) {
    const months = <int, String>{
      1: 'января',
      2: 'февраля',
      3: 'марта',
      4: 'апреля',
      5: 'мая',
      6: 'июня',
      7: 'июля',
      8: 'августа',
      9: 'сентября',
      10: 'октября',
      11: 'ноября',
      12: 'декабря',
    };
    final m = months[c.month] ?? 'месяца';
    return 'Клуб $m ${c.year}';
  }
}

/// Бейдж статуса клуба — компактный лейбл под названием.
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.club});
  final ClubSummary club;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();

    String label;
    Color color;

    switch (club.relation) {
      case ClubRelation.current:
        label = 'Идёт сейчас';
        color = AppColors.success;
        break;
      case ClubRelation.future:
        final days = club.startsAt.difference(now).inDays;
        if (days <= 0) {
          label = 'Скоро откроется';
        } else if (days == 1) {
          label = 'Откроется завтра';
        } else {
          label = 'Откроется через $days ${_dayWord(days)}';
        }
        color = AppColors.terracotta;
        break;
      case ClubRelation.archive:
        // Если в архивном окне — пишем «архив до DD.MM», иначе просто «архив».
        if (club.archiveUntilDate.isAfter(now)) {
          final dd = club.archiveUntilDate.day.toString().padLeft(2, '0');
          final mm = club.archiveUntilDate.month.toString().padLeft(2, '0');
          label = 'Архив до $dd.$mm';
        } else {
          label = 'Архив';
        }
        color = AppColors.textTertiary;
        break;
      case ClubRelation.unknown:
        label = '';
        color = AppColors.textTertiary;
        break;
    }

    if (label.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: AppTypography.micro.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  String _dayWord(int days) {
    final mod10 = days % 10;
    final mod100 = days % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'дней';
    if (mod10 == 1) return 'день';
    if (mod10 >= 2 && mod10 <= 4) return 'дня';
    return 'дней';
  }
}

/// Внутренняя модель элемента списка — либо section-заголовок, либо строка клуба.
class _SheetItem {
  const _SheetItem.section(this.sectionTitle) : club = null;
  const _SheetItem.club(this.club) : sectionTitle = null;

  final String? sectionTitle;
  final ClubSummary? club;

  bool get isSection => sectionTitle != null;
}
