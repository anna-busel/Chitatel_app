import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../providers/auth_provider.dart';

/// Экран Email-входа (MASTER 4.3).
///
/// Заголовок «Вход», email, пароль, кнопка «Войти».
/// Ссылки: «Забыли пароль?», «Нет аккаунта? Зарегистрироваться».
class EmailLoginScreen extends ConsumerStatefulWidget {
  const EmailLoginScreen({super.key});

  @override
  ConsumerState<EmailLoginScreen> createState() => _EmailLoginScreenState();
}

class _EmailLoginScreenState extends ConsumerState<EmailLoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _login() {
    // Email — всегда lowercase + trim. iOS-клавиатура может подсунуть
    // заглавную первую букву, пробел в конце автозамены, и т.д.
    final email = _emailController.text.trim().toLowerCase();
    final password = _passwordController.text;

    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заполните все поля')),
      );
      return;
    }

    ref.read(authProvider.notifier).login(email: email, password: password);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final isLoading = authState.status == AuthStatus.loading;

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        context.go(Routes.home);
      }
      if (next.status == AuthStatus.error && next.errorMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(next.errorMessage!),
            backgroundColor: AppColors.error,
            duration: const Duration(seconds: 6),
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppTopBar(backLabel: 'Назад', onBack: () => context.pop()),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.authScreenPadding,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Вход', style: AppTypography.serifSectionTitle),
                    const SizedBox(height: 4),
                    Text(
                      'Войдите в свой аккаунт',
                      style: AppTypography.caption,
                    ),
                    const SizedBox(height: 24),
                    AppTextField(
                      controller: _emailController,
                      placeholder: 'Email',
                      keyboardType: TextInputType.emailAddress,
                    ),
                    const SizedBox(height: 10),
                    AppTextField(
                      controller: _passwordController,
                      placeholder: 'Пароль',
                      obscureText: true,
                    ),
                    const SizedBox(height: 16),
                    AppButton(
                      text: 'Войти',
                      onPressed: isLoading ? null : _login,
                      isLoading: isLoading,
                    ),
                    const SizedBox(height: 12),
                    // P2: ссылка «Забыли пароль?» временно скрыта — серверного
                    // endpoint сброса пароля нет. Экран forgot_password и
                    // Routes.forgotPassword оставлены; вернуть после реализации.
                    Center(
                      child: GestureDetector(
                        onTap: () => context.push(Routes.register),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text.rich(
                            TextSpan(
                              style: AppTypography.caption,
                              children: [
                                const TextSpan(text: 'Нет аккаунта? '),
                                TextSpan(
                                  text: 'Зарегистрироваться',
                                  style: TextStyle(
                                    color: AppColors.terracotta,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
