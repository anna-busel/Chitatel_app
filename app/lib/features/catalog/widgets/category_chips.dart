import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/constants/book_categories.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../providers/catalog_provider.dart';

/// Горизонтальная лента чипов-фильтров каталога.
///
/// Состав: [Все] [Бесплатные] [Пакеты] [14 категорий Анны].
/// Один активный чип в любой момент времени (radio-поведение).
///
/// ВАЖНО (13.05.2026): label чипа = `BookCategories.labelFor(category)`
/// (sentence case для UI), но фильтрация — по исходному значению (КАПС из БД).
/// Это нужно потому что `book.categories` в БД хранится капсом, и точное
/// совпадение строк требуется для CategoryFilter.
class CategoryChips extends ConsumerWidget {
  const CategoryChips({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(catalogProvider.select((s) => s.filter));
    final notifier = ref.read(catalogProvider.notifier);

    final items = <_ChipItem>[
      _ChipItem(
        label: 'Все',
        isActive: filter is AllBooksFilter,
        onTap: () => notifier.setFilter(const AllBooksFilter()),
      ),
      _ChipItem(
        label: 'Бесплатные',
        isActive: filter is FreeOnlyFilter,
        onTap: () => notifier.setFilter(const FreeOnlyFilter()),
      ),
      _ChipItem(
        label: 'Пакеты',
        isActive: filter is PackagesFilter,
        onTap: () => notifier.setFilter(const PackagesFilter()),
      ),
      ...BookCategories.all.map((category) {
        final isActive =
            filter is CategoryFilter && filter.category == category;
        return _ChipItem(
          label: BookCategories.labelFor(category),
          isActive: isActive,
          onTap: () => notifier.setFilter(CategoryFilter(category)),
        );
      }),
    ];

    return SizedBox(
      height: 38,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenPadding,
        ),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) => _Chip(item: items[index]),
      ),
    );
  }
}

class _ChipItem {
  const _ChipItem({
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final String label;
  final bool isActive;
  final VoidCallback onTap;
}

class _Chip extends StatelessWidget {
  const _Chip({required this.item});
  final _ChipItem item;

  @override
  Widget build(BuildContext context) {
    final activeBg = AppColors.terracotta;
    final inactiveBg = AppColors.cardBackground;
    final activeText = Colors.white;
    final inactiveText = AppColors.textPrimary;
    final borderColor = item.isActive ? activeBg : AppColors.border;

    return InkWell(
      onTap: item.onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusChip),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: item.isActive ? activeBg : inactiveBg,
          borderRadius: BorderRadius.circular(AppSpacing.radiusChip),
          border: Border.all(color: borderColor, width: 1),
        ),
        alignment: Alignment.center,
        child: Text(
          item.label,
          style: AppTypography.bodyMedium.copyWith(
            color: item.isActive ? activeText : inactiveText,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
