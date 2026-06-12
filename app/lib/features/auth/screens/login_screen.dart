import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../providers/auth_provider.dart';

/// Экран входа (MASTER 4.2).
///
/// 3 кнопки: Apple (чёрная, первая), Google (белая), Email (серая).
/// Чекбокс GDPR. Кнопка «Пропустить».
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _gdprChecked = false;

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        if (next.isNewUser) {
          context.go(Routes.survey);
        } else {
          context.go(Routes.home);
        }
      }
      if (next.status == AuthStatus.error && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: AppColors.error,
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.authScreenPadding,
          ),
          child: Column(
            children: [
              const Spacer(),

              // Логотип
              Text(
                'ЧИТАТЕЛЬ',
                style: AppTypography.serifLogo.copyWith(
                  fontSize: 28,
                  letterSpacing: 5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Войдите чтобы начать',
                style: AppTypography.body.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
              const SizedBox(height: 36),

              // Apple Sign In — первая кнопка (Apple требует)
              _SocialButton(
                label: 'Sign in with Apple',
                backgroundColor: Colors.black,
                textColor: Colors.white,
                icon: const Icon(Icons.apple, color: Colors.white, size: 20),
                enabled: _gdprChecked,
                loading: authState.status == AuthStatus.loading,
                onPressed: () {
                  ref.read(authProvider.notifier).signInWithApple();
                },
              ),
              const SizedBox(height: 10),

              // Google Sign In
              _SocialButton(
                label: 'Google',
                backgroundColor: Colors.white,
                textColor: AppColors.textPrimary,
                border: true,
                icon: Image.network(
                  'https://developers.google.com/identity/images/g-logo.png',
                  width: 18,
                  height: 18,
                  errorBuilder: (_, __, ___) => const Icon(
                    Icons.g_mobiledata,
                    size: 20,
                    color: AppColors.textPrimary,
                  ),
                ),
                enabled: _gdprChecked,
                loading: authState.status == AuthStatus.loading,
                onPressed: () {
                  ref.read(authProvider.notifier).signInWithGoogle();
                },
              ),
              const SizedBox(height: 10),

              // Email
              _SocialButton(
                label: 'Email и пароль',
                backgroundColor: AppColors.surfaceLight,
                textColor: AppColors.textPrimary,
                enabled: _gdprChecked,
                onPressed: () => context.push(Routes.emailLogin),
              ),
              const SizedBox(height: 8),

              // Забыли пароль
              GestureDetector(
                onTap: () => context.push(Routes.forgotPassword),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Забыли пароль?',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.terracotta,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // GDPR чекбокс
              GestureDetector(
                onTap: () => setState(() => _gdprChecked = !_gdprChecked),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 22,
                      height: 22,
                      margin: const EdgeInsets.only(top: 1),
                      decoration: BoxDecoration(
                        color: _gdprChecked ? AppColors.terracotta : Colors.white,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: _gdprChecked
                              ? AppColors.terracotta
                              : AppColors.textMetadata,
                          width: 2,
                        ),
                      ),
                      child: _gdprChecked
                          ? const Icon(Icons.check, size: 14, color: Colors.white)
                          : null,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          style: AppTypography.small.copyWith(
                            color: AppColors.textSecondary,
                            height: 1.5,
                          ),
                          children: [
                            const TextSpan(
                              text: 'Я согласна на обработку персональных данных и принимаю ',
                            ),
                            TextSpan(
                              text: 'Условия',
                              style: TextStyle(color: AppColors.terracotta),
                            ),
                            const TextSpan(text: ' и '),
                            TextSpan(
                              text: 'Политику конфиденциальности',
                              style: TextStyle(color: AppColors.terracotta),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const Spacer(),

              // Пропустить
              GestureDetector(
                onTap: () async {
                  ref.read(authProvider.notifier).enterAsGuest();
                  final prefs = await SharedPreferences.getInstance();
                  await prefs.setBool('onboarding_seen', true);
                  if (context.mounted) context.go(Routes.home);
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                    'Пропустить',
                    style: AppTypography.body.copyWith(
                      color: AppColors.textTertiary,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кнопка социального входа.
class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.label,
    required this.backgroundColor,
    required this.textColor,
    required this.onPressed,
    this.icon,
    this.border = false,
    this.enabled = true,
    this.loading = false,
  });

  final String label;
  final Color backgroundColor;
  final Color textColor;
  final VoidCallback onPressed;
  final Widget? icon;
  final bool border;
  final bool enabled;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled && !loading ? onPressed : null,
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 200),
        opacity: enabled ? 1.0 : 0.4,
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: backgroundColor,
            borderRadius: BorderRadius.circular(AppSpacing.radiusButton),
            border: border
                ? Border.all(color: const Color(0xFFE0E0E0))
                : null,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                icon!,
                const SizedBox(width: 8),
              ],
              if (loading)
                SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: textColor,
                  ),
                )
              else
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: textColor,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
