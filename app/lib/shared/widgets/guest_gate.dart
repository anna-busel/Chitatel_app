import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/router/routes.dart';
import '../../features/auth/providers/auth_provider.dart';

/// Гейт для зон, требующих аккаунт, в гостевом режиме (задача 1.8, Apple 5.1.1(v)).
///
/// Бесплатный контент (главная, каталог, поиск, плеер бесплатных книг) доступен
/// гостю без регистрации. Зоны, которым нужен аккаунт (Клуб, Профиль и пр.),
/// показывают гостю мягкое приглашение войти — это НЕ тупик: к бесплатному
/// контенту всегда можно вернуться через нижнюю навигацию.
///
/// Авторизованному пользователю отдаёт [child] без изменений.
class GuestGate extends ConsumerWidget {
  const GuestGate({
    super.key,
    required this.title,
    required this.message,
    required this.child,
  });

  /// Короткий заголовок зоны, напр. «Клуб».
  final String title;

  /// Поясняющий текст, напр. «Войдите, чтобы присоединиться к клубу».
  final String message;

  /// Реальный экран для авторизованного пользователя.
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(authProvider).status;

    // Авторизован — показываем реальный экран.
    if (status == AuthStatus.authenticated) return child;

    // Пока состояние определяется (старт приложения, checkAuth) — лоадер, чтобы
    // авторизованный пользователь не увидел приглашение войти на один кадр.
    if (status == AuthStatus.initial || status == AuthStatus.loading) {
      return Container(
        color: AppColors.background,
        child: const Center(
          child: CircularProgressIndicator(
            color: AppColors.terracotta,
            strokeWidth: 2.5,
          ),
        ),
      );
    }

    // Гость (или ошибка авторизации) — мягкое приглашение войти.
    return _GuestPrompt(title: title, message: message);
  }
}

class _GuestPrompt extends StatelessWidget {
  const _GuestPrompt({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.background,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.lock_outline,
                size: 40,
                color: AppColors.textTertiary,
              ),
              const SizedBox(height: 16),
              Text(
                title,
                style: AppTypography.serifSectionTitle,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                message,
                style: AppTypography.body.copyWith(
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              GestureDetector(
                onTap: () => context.push(Routes.login),
                child: Container(
                  height: 48,
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.terracotta,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
                  ),
                  child: const Text(
                    'Войти или зарегистрироваться',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
