import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';

/// Шапка главного экрана.
///
/// Структура: [аватар] [ЧИТАТЕЛЬ (лого, центр)]
///
/// ⚠️ 12.07.2026 (Фаза 6, A6): КОЛОКОЛЬЧИК УБРАН. Он вёл на экран «Уведомления»
/// (лента пушей, 4.30), которого не существует — маршрут был заглушкой
/// «Экран в разработке». Пуши и лента появятся в волне 6Б (задача 6.1), тогда
/// же вернём колокольчик. Настройки уведомлений при этом доступны: Профиль →
/// Уведомления.
/// Справа оставлен пустой блок той же ширины — чтобы логотип остался ровно
/// по центру, а не съехал.
///
/// Рисуется внутри HomeScreen (решение в AI-CONTEXT: шапки на разных
/// табах отличаются, общий виджет не делаем).
class HomeHeader extends StatelessWidget {
  const HomeHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenPadding,
        vertical: 12,
      ),
      child: Row(
        children: [
          // Аватар → профиль
          InkResponse(
            onTap: () => context.go(Routes.profile),
            radius: AppSpacing.minTapTarget / 2,
            child: Container(
              width: AppSpacing.minTapTarget,
              height: AppSpacing.minTapTarget,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: AppColors.terracottaGradient,
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.person_outline,
                color: Colors.white,
                size: 22,
              ),
            ),
          ),

          // Логотип по центру
          Expanded(
            child: Center(
              child: Text(
                'ЧИТАТЕЛЬ',
                style: AppTypography.serifLogo,
              ),
            ),
          ),

          // Балансир вместо колокольчика — держит логотип по центру.
          const SizedBox(
            width: AppSpacing.minTapTarget,
            height: AppSpacing.minTapTarget,
          ),
        ],
      ),
    );
  }
}
