import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_sizes.dart';

/// Нижняя навигация приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 4.47, прототип
///
/// 4 вкладки: Главная, Каталог, Клуб, Профиль.
/// Активный таб: терракота. Неактивный: #1A1A1A с opacity 0.35.
class AppBottomBar extends StatelessWidget {
  const AppBottomBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(
          top: BorderSide(color: Color(0xFFECEAE5), width: 1),
        ),
      ),
      padding: const EdgeInsets.only(
        top: 8,
        bottom: AppSizes.tabBarPaddingBottom,
      ),
      child: Row(
        children: [
          _TabItem(
            index: 0,
            icon: Icons.home_outlined,
            activeIcon: Icons.home,
            label: 'Главная',
            isActive: currentIndex == 0,
            onTap: () => onTap(0),
          ),
          _TabItem(
            index: 1,
            icon: Icons.search,
            activeIcon: Icons.search,
            label: 'Каталог',
            isActive: currentIndex == 1,
            onTap: () => onTap(1),
          ),
          _TabItem(
            index: 2,
            icon: Icons.menu_book_outlined,
            activeIcon: Icons.menu_book,
            label: 'Клуб',
            isActive: currentIndex == 2,
            onTap: () => onTap(2),
          ),
          _TabItem(
            index: 3,
            icon: Icons.person_outline,
            activeIcon: Icons.person,
            label: 'Профиль',
            isActive: currentIndex == 3,
            onTap: () => onTap(3),
          ),
        ],
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  const _TabItem({
    required this.index,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final int index;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isActive ? activeIcon : icon,
              size: 24,
              color: isActive
                  ? AppColors.terracotta
                  : AppColors.textPrimary.withOpacity(0.35),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive
                    ? AppColors.terracotta
                    : AppColors.textPrimary.withOpacity(0.4),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
