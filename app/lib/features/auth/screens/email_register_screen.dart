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

/// Экран регистрации (MASTER 4.4).
///
/// Поля: имя, email, пароль, повторите пароль.
/// Подсказка: «Пароль минимум 8 символов».
class EmailRegisterScreen extends ConsumerStatefulWidget {
  const EmailRegisterScreen({super.key});

  @override
  ConsumerState<EmailRegisterScreen> createState() =>
      _EmailRegisterScreenState();
}

class _EmailRegisterScreenState extends ConsumerState<EmailRegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _register() {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmController.text;

    if (name.isEmpty || email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заполните все поля')),
      );
      return;
    }
    if (password.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Пароль минимум 8 символов')),
      );
      return;
    }
    if (password != confirm) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Пароли не совпадают')),
      );
      return;
    }

    ref.read(authProvider.notifier).register(
          email: email,
          password: password,
          name: name,
        );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final isLoading = authState.status == AuthStatus.loading;

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        context.go(Routes.survey);
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
                    Text('Регистрация', style: AppTypography.serifSectionTitle),
                    const SizedBox(height: 4),
                    Text(
                      'Создайте аккаунт по email',
                      style: AppTypography.caption,
                    ),
                    const SizedBox(height: 24),
                    AppTextField(
                      controller: _nameController,
                      placeholder: 'Имя',
                    ),
                    const SizedBox(height: 10),
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
                    const SizedBox(height: 10),
                    AppTextField(
                      controller: _confirmController,
                      placeholder: 'Повторите пароль',
                      obscureText: true,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Пароль минимум 8 символов, буквы и цифры',
                      style: AppTypography.micro.copyWith(
                        color: AppColors.textTertiary,
                      ),
                    ),
                    const SizedBox(height: 16),
                    AppButton(
                      text: 'Создать аккаунт',
                      onPressed: isLoading ? null : _register,
                      isLoading: isLoading,
                    ),
                    const SizedBox(height: 16),
                    Center(
                      child: GestureDetector(
                        onTap: () => context.pop(),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text.rich(
                            TextSpan(
                              style: AppTypography.caption,
                              children: [
                                const TextSpan(text: 'Уже есть аккаунт? '),
                                TextSpan(
                                  text: 'Войти',
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
