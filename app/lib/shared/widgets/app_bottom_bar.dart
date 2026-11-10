import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/constants/app_sizes.dart';

/// Нижняя навигация приложения ЧИТАТЕЛЬ.
/// Источник: MASTER.md секция 4.47, прототип
///
/// 4 вкладки: Главная, Каталог, Клуб, Профиль.
/// Активный таб: винный. Неактивный: #1A1A1A с opacity 0.35.
/// Верхняя линия — холодный серый (coldGray).
class AppBottomBar extends StatelessWidget {
  const AppBottomBar({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.clubHasUnread = false,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  /// V4 (1.0.5): маленькая красная точка на «Клубе» — в чатах клубов есть
  /// непрочитанные (clubUnreadProvider.total > 0). Без числа.
  final bool clubHasUnread;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(
          top: BorderSide(color: AppColors.coldGray, width: 1),
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
            showDot: clubHasUnread,
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
    this.showDot = false,
  });

  final int index;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  isActive ? activeIcon : icon,
                  size: 24,
                  color: isActive
                      ? AppColors.terracotta
                      : AppColors.textPrimary.withOpacity(0.35),
                ),
                if (showDot)
                  Positioned(
                    top: -1,
                    right: -3,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: AppColors.error,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: AppColors.background,
                          width: 1.2,
                        ),
                      ),
                    ),
                  ),
              ],
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
