import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/network/network_error.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/app_text_field.dart';
import '../../../shared/widgets/app_top_bar.dart';
import '../../auth/services/auth_service.dart';
import '../../club/services/club_api_service.dart';

/// Смена пароля (UPDATES-PLAN P4, 05.11.2026).
///
/// Профиль → «Сменить пароль». Пункт виден только при входе по почте
/// (authProvider == 'email'): у входа через Apple / Google пароля нет.
/// POST /api/auth/change-password { currentPassword, newPassword }.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _repeatController = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _repeatController.dispose();
    super.dispose();
  }

  void _showError(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(text),
      backgroundColor: AppColors.error,
    ));
  }

  Future<void> _save() async {
    final current = _currentController.text;
    final next = _newController.text;
    final repeat = _repeatController.text;

    if (current.isEmpty) {
      _showError('Введите текущий пароль');
      return;
    }
    if (next.length < 8 || next.length > 72) {
      _showError('Новый пароль — от 8 до 72 символов');
      return;
    }
    if (next != repeat) {
      _showError('Пароли не совпадают');
      return;
    }
    if (next == current) {
      _showError('Новый пароль совпадает с текущим');
      return;
    }

    setState(() => _isSaving = true);
    try {
      await ref.read(authServiceProvider).changePassword(
            currentPassword: current,
            newPassword: next,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Пароль изменён'),
        backgroundColor: AppColors.success,
      ));
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      _showError(switch (ClubApiService.errorCodeFromException(e)) {
        'WRONG_PASSWORD' => 'Текущий пароль введён неверно',
        'NOT_EMAIL_ACCOUNT' =>
          'Вы входите через Apple или Google — пароля у этого аккаунта нет',
        'VALIDATION_ERROR' => 'Новый пароль — от 8 до 72 символов',
        _ => userMessageFor(
            e,
            fallback: 'Не удалось сменить пароль. Попробуйте ещё раз',
          ),
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppTopBar(backLabel: 'Профиль', onBack: () => context.pop()),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenPadding,
                  8,
                  AppSpacing.screenPadding,
                  32,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Сменить пароль',
                      style: AppTypography.serifSectionTitle,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Новый пароль — от 8 символов. Дальше входите с ним '
                      'на всех устройствах.',
                      style: AppTypography.body.copyWith(
                        color: AppColors.textTertiary,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                    AppTextField(
                      controller: _currentController,
                      placeholder: 'Текущий пароль',
                      obscureText: true,
                    ),
                    const SizedBox(height: 10),
                    AppTextField(
                      controller: _newController,
                      placeholder: 'Новый пароль',
                      obscureText: true,
                    ),
                    const SizedBox(height: 10),
                    AppTextField(
                      controller: _repeatController,
                      placeholder: 'Повторите новый пароль',
                      obscureText: true,
                    ),
                    const SizedBox(height: 16),
                    AppButton(
                      text: 'Сохранить',
                      isLoading: _isSaving,
                      onPressed: _isSaving ? null : _save,
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
