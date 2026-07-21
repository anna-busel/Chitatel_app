import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../auth/providers/auth_provider.dart';
import '../../notifications/providers/notification_provider.dart';
import '../../profile/providers/profile_provider.dart';

/// Шапка главного экрана.
///
/// Структура: [аватар] [ЧИТАТЕЛЬ (лого, центр)] [колокольчик]
///
/// ⚠️ 12.07.2026 (Фаза 6): в кружке слева теперь ФОТО ПРОФИЛЯ, если оно
/// загружено. У гостя (без аккаунта) профиль НЕ запрашивается.
///
/// КОЛОКОЛЬЧИК (задача 6.1, заход 2): возвращён — ведёт на ленту 4.30,
/// красная точка при непрочитанных. У гостя — прежний пустой балансир
/// (логотип остаётся по центру).
class HomeHeader extends ConsumerWidget {
  const HomeHeader({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAuthenticated =
        ref.watch(authProvider).status == AuthStatus.authenticated;

    // Профиль тянем только для авторизованных.
    final String? avatarUrl = isAuthenticated
        ? ref.watch(profileProvider).maybeWhen(
              data: (p) => p.avatarUrl,
              orElse: () => null,
            )
        : null;

    final hasAvatar = avatarUrl != null && avatarUrl.isNotEmpty;

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
            child: ClipOval(
              child: SizedBox(
                width: AppSpacing.minTapTarget,
                height: AppSpacing.minTapTarget,
                child: hasAvatar
                    ? CachedNetworkImage(
                        imageUrl: avatarUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => const _AvatarFallback(),
                        placeholder: (_, __) => const _AvatarFallback(),
                      )
                    : const _AvatarFallback(),
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

          // Колокольчик (только для авторизованных) / балансир у гостя.
          if (isAuthenticated)
            const _NotificationBell()
          else
            const SizedBox(
              width: AppSpacing.minTapTarget,
              height: AppSpacing.minTapTarget,
            ),
        ],
      ),
    );
  }
}

/// Колокольчик с красной точкой при наличии непрочитанных.
class _NotificationBell extends ConsumerWidget {
  const _NotificationBell();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(notificationsProvider).maybeWhen(
          data: (d) => d.unreadCount,
          orElse: () => 0,
        );

    return InkResponse(
      onTap: () => context.push(Routes.notifications),
      radius: AppSpacing.minTapTarget / 2,
      child: SizedBox(
        width: AppSpacing.minTapTarget,
        height: AppSpacing.minTapTarget,
        child: Stack(
          alignment: Alignment.center,
          children: [
            const Icon(
              Icons.notifications_none,
              color: AppColors.textPrimary,
              size: 24,
            ),
            if (unread > 0)
              Positioned(
                top: 11,
                right: 11,
                child: Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(
                    color: AppColors.error,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.background, width: 1.5),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Кружок с иконкой — когда фото нет (гость или аватар не загружен).
class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
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
    );
  }
}
