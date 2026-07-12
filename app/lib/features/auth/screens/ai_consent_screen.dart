import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../../diary/providers/ai_consent_provider.dart';

/// Согласие на ИИ (MASTER 4.7) — шаг онбординга после опроса.
///
/// 🔴 Apple 5.1.2(i): без явного согласия ни одна цитата не уходит в OpenAI.
/// «Пока без ИИ» — тоже валидный выбор, включить можно позже в профиле.
class AiConsentScreen extends ConsumerStatefulWidget {
  const AiConsentScreen({super.key});

  @override
  ConsumerState<AiConsentScreen> createState() => _AiConsentScreenState();
}

class _AiConsentScreenState extends ConsumerState<AiConsentScreen> {
  bool _isSaving = false;

  static const List<String> _points = [
    'Цитаты обрабатываются OpenAI API',
    'Данные не используются для обучения моделей',
    'Результаты хранятся на наших серверах',
    'Удаляются вместе с аккаунтом или по запросу',
    'Анализ — это не терапия и не диагноз',
    'Отключить можно в настройках',
  ];

  Future<void> _setConsent(bool consent) async {
    setState(() => _isSaving = true);
    try {
      await ref.read(aiConsentProvider.notifier).setConsent(consent);
      if (!mounted) return;
      context.go(Routes.pushConsent);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить выбор. Попробуйте позже')),
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
              const SizedBox(height: 12),
              const Icon(Icons.auto_awesome, size: 32, color: AppColors.purple),
              const SizedBox(height: 16),
              Text('ИИ-анализ ваших цитат', style: AppTypography.serifHeadline),
              const SizedBox(height: 12),
              Text(
                'Когда вы сохраняете цитату, наш ИИ подготовит персональный '
                'психологический анализ.',
                style: AppTypography.bodyLarge.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.cardBackground,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final point in _points)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.check,
                              size: 16,
                              color: AppColors.success,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(point, style: AppTypography.body),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const Spacer(),
              AppButton(
                text: 'Согласна, включить ИИ-анализ',
                isLoading: _isSaving,
                onPressed: _isSaving ? null : () => _setConsent(true),
              ),
              const SizedBox(height: 12),
              Center(
                child: GestureDetector(
                  onTap: _isSaving ? null : () => _setConsent(false),
                  behavior: HitTestBehavior.opaque,
                  child: SizedBox(
                    height: AppSpacing.minTapTarget,
                    child: Center(
                      child: Text(
                        'Пока без ИИ',
                        style: AppTypography.bodyMedium.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
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
