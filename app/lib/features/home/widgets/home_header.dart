import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../auth/providers/auth_provider.dart';
import '../../profile/providers/profile_provider.dart';

/// Шапка главного экрана.
///
/// Структура: [аватар] [ЧИТАТЕЛЬ (лого, центр)] [балансир]
///
/// ⚠️ 12.07.2026 (Фаза 6): в кружке слева теперь ФОТО ПРОФИЛЯ, если оно
/// загружено (раньше всегда был безликий человечек, хотя аватар уже был).
/// У гостя (без аккаунта) профиль НЕ запрашивается — показываем иконку:
/// иначе при каждом открытии главной уходил бы заведомо неуспешный запрос.
///
/// ⚠️ КОЛОКОЛЬЧИК УБРАН (A6): он вёл на экран «Уведомления» (лента пушей, 4.30),
/// которого не существует. Вернём в волне 6Б вместе с push. Настройки
/// уведомлений доступны: Профиль → Уведомления. Справа оставлен пустой блок
/// той же ширины — чтобы логотип остался ровно по центру.
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
