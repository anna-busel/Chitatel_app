import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/onboarding_provider.dart';

/// Онбординг, экран 1 — имя (задача 6.3).
///
/// Поле предзаполнено именем от Apple/Google. Если провайдер имя не отдал,
/// сервер подставил заглушку «Пользователь» — её показываем как пустое поле,
/// чтобы человек ввёл настоящее. Настоящее имя важно не только для профиля:
/// без него ИИ-анализ цитат обращается безлично (на «вы»).
///
/// Имя обязательно — одна кнопка «Далее», без «Пропустить».
class NameScreen extends ConsumerStatefulWidget {
  const NameScreen({super.key});

  @override
  ConsumerState<NameScreen> createState() => _NameScreenState();
}

class _NameScreenState extends ConsumerState<NameScreen> {
  late final TextEditingController _controller;
  bool _isSaving = false;

  // Заглушка, которую сервер ставит, когда провайдер не прислал имя.
  static const String _placeholder = 'Пользователь';

  @override
  void initState() {
    super.initState();
    final rawName = ref.read(authProvider).user?['name']?.toString() ?? '';
    final initial = rawName == _placeholder ? '' : rawName;
    _controller = TextEditingController(text: initial);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _next() async {
    final name = _controller.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите имя')),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      await ref.read(onboardingControllerProvider).saveName(name);
      if (!mounted) return;
      context.go(Routes.survey);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить имя. Попробуйте позже')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.authScreenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 12),
                      const Icon(
                        Icons.person_outline,
                        size: 32,
                        color: AppColors.terracotta,
                      ),
                      const SizedBox(height: 16),
                      Text('Как вас зовут?',
                          style: AppTypography.serifHeadline),
                      const SizedBox(height: 12),
                      Text(
                        'Так к вам будут обращаться в приложении и в разборах ваших цитат.',
                        style: AppTypography.bodyLarge.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 24),
                      TextField(
                        controller: _controller,
                        textCapitalization: TextCapitalization.words,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _isSaving ? null : _next(),
                        style: AppTypography.inputText.copyWith(fontSize: 16),
                        decoration: InputDecoration(
                          hintText: 'Имя',
                          hintStyle: AppTypography.inputPlaceholder,
                          filled: true,
                          fillColor: AppColors.cardBackground,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          enabledBorder: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(AppSpacing.radiusInput),
                            borderSide:
                                const BorderSide(color: AppColors.border),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(AppSpacing.radiusInput),
                            borderSide: const BorderSide(
                                color: AppColors.terracotta, width: 1.5),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              AppButton(
                text: 'Далее',
                isLoading: _isSaving,
                onPressed: _isSaving ? null : _next,
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
