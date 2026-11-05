import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/network/network_error.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../../club/services/club_api_service.dart';
import '../post_login_navigation.dart';
import '../providers/auth_provider.dart';
import '../services/auth_service.dart';

/// Восстановление пароля (MASTER 4.5; UPDATES-PLAN P3, 05.11.2026).
///
/// Раньше экран обещал «ссылку для сброса», но сервера под ним не было, и
/// вход его не показывал. Теперь — код на почту:
/// 1. почта → POST /api/auth/forgot-password (ответ одинаковый, есть такая
///    почта или нет — не подсказываем, кто зарегистрирован);
/// 2. 6-значный код из письма + новый пароль дважды →
///    POST /api/auth/reset-password;
/// 3. сразу входим с новым паролем (обычный login) и идём туда же, куда
///    после входа по почте (goAfterLogin).
///
/// Только для аккаунтов с входом по почте: у входа через Apple / Google
/// пароля нет — на такую почту код не придёт.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail});

  /// Почта, уже введённая на экране входа.
  final String? initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final TextEditingController _emailController;
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  final _repeatController = TextEditingController();

  bool _isLoading = false;

  /// false — шаг «почта», true — шаг «код и новый пароль».
  bool _codeSent = false;

  /// Почта, на которую ушёл код (её и шлём в reset-password).
  String _sentTo = '';

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    _repeatController.dispose();
    super.dispose();
  }

  void _showError(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: AppColors.error,
      duration: const Duration(seconds: 5),
    ));
  }

  /// Шаг 1 (и «Отправить код ещё раз»).
  Future<void> _sendCode() async {
    // Как на экране входа: iOS-клавиатура любит заглавную букву и пробел.
    final email = (_codeSent ? _sentTo : _emailController.text)
        .trim()
        .toLowerCase();
    if (email.isEmpty || !email.contains('@')) {
      _showError('Введите почту, с которой вы входите');
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ref.read(authServiceProvider).forgotPassword(email: email);
      if (!mounted) return;
      final resent = _codeSent;
      setState(() {
        _codeSent = true;
        _sentTo = email;
      });
      if (resent) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Отправили новый код'),
        ));
      }
    } catch (e) {
      if (!mounted) return;
      _showError(userMessageFor(
        e,
        fallback: 'Не удалось отправить код. Попробуйте позже',
      ));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  /// Шаг 2: код + новый пароль → сброс → вход.
  Future<void> _reset() async {
    final code = _codeController.text.trim();
    final password = _passwordController.text;
    final repeat = _repeatController.text;

    if (code.length != 6) {
      _showError('Введите 6 цифр из письма');
      return;
    }
    if (password.length < 8 || password.length > 72) {
      _showError('Пароль — от 8 до 72 символов');
      return;
    }
    if (password != repeat) {
      _showError('Пароли не совпадают');
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ref.read(authServiceProvider).resetPassword(
            email: _sentTo,
            code: code,
            newPassword: password,
          );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      _showError(_resetErrorText(e));
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Пароль изменён'),
      backgroundColor: AppColors.success,
    ));
    // Вход с новым паролем. Переход — в слушателе authProvider ниже.
    await ref
        .read(authProvider.notifier)
        .login(email: _sentTo, password: password);
    if (mounted) setState(() => _isLoading = false);
  }

  String _resetErrorText(Object e) {
    switch (ClubApiService.errorCodeFromException(e)) {
      case 'CODE_INVALID':
        return 'Неверный код. Проверьте письмо и попробуйте ещё раз';
      case 'CODE_EXPIRED':
        return 'Код устарел. Нажмите «Отправить код ещё раз»';
      case 'TOO_MANY_ATTEMPTS':
        return 'Слишком много попыток. Запросите новый код';
      case 'VALIDATION_ERROR':
        return 'Проверьте код (6 цифр) и пароль (от 8 до 72 символов)';
    }
    return userMessageFor(
      e,
      fallback: 'Не удалось сменить пароль. Попробуйте ещё раз',
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated &&
          prev?.status != AuthStatus.authenticated) {
        goAfterLogin(context, ref, next);
      }
      if (next.status == AuthStatus.error && next.errorMessage != null) {
        // Пароль уже сменён, не вошли (например, нет сети) — войти можно
        // обычным способом с новым паролем.
        _showError('Пароль изменён, но войти не получилось. '
            'Войдите с новым паролем');
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
                child: _codeSent ? _buildCodeStep() : _buildEmailStep(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmailStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Восстановление пароля', style: AppTypography.serifSectionTitle),
        const SizedBox(height: 8),
        Text(
          'Введите почту, с которой вы входите. Пришлём код для нового пароля.',
          style: AppTypography.body.copyWith(
            color: AppColors.textTertiary,
            height: 1.6,
          ),
        ),
        const SizedBox(height: 24),
        AppTextField(
          controller: _emailController,
          placeholder: 'Email',
          keyboardType: TextInputType.emailAddress,
        ),
        const SizedBox(height: 16),
        AppButton(
          text: 'Получить код',
          onPressed: _isLoading ? null : _sendCode,
          isLoading: _isLoading,
        ),
        const SizedBox(height: 16),
        Text(
          'Если вы входите через Apple или Google, пароля у вас нет — '
          'войдите той же кнопкой на экране входа.',
          style: AppTypography.small.copyWith(color: AppColors.textTertiary),
        ),
      ],
    );
  }

  Widget _buildCodeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Новый пароль', style: AppTypography.serifSectionTitle),
        const SizedBox(height: 8),
        Text(
          'Если $_sentTo есть у нас, на неё пришёл код из 6 цифр. '
          'Он действует 15 минут. Письмо может идти до 5 минут — '
          'загляните и в «Спам».',
          style: AppTypography.body.copyWith(
            color: AppColors.textTertiary,
            height: 1.6,
          ),
        ),
        const SizedBox(height: 24),
        AppTextField(
          controller: _codeController,
          placeholder: 'Код из письма',
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
        ),
        const SizedBox(height: 10),
        AppTextField(
          controller: _passwordController,
          placeholder: 'Новый пароль (от 8 символов)',
          obscureText: true,
        ),
        const SizedBox(height: 10),
        AppTextField(
          controller: _repeatController,
          placeholder: 'Повторите пароль',
          obscureText: true,
        ),
        const SizedBox(height: 16),
        AppButton(
          text: 'Сохранить и войти',
          onPressed: _isLoading ? null : _reset,
          isLoading: _isLoading,
        ),
        const SizedBox(height: 8),
        Center(
          child: TextButton(
            onPressed: _isLoading ? null : _sendCode,
            child: Text(
              'Отправить код ещё раз',
              style: AppTypography.caption.copyWith(
                color: AppColors.terracotta,
              ),
            ),
          ),
        ),
        Center(
          child: TextButton(
            onPressed: _isLoading
                ? null
                : () => setState(() {
                      _codeSent = false;
                      _codeController.clear();
                    }),
            child: Text(
              'Указать другую почту',
              style: AppTypography.caption,
            ),
          ),
        ),
      ],
    );
  }
}
