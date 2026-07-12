import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../features/diary/providers/ai_consent_provider.dart';
import 'app_button.dart';

/// Модальное окно «ИИ-анализ» (MASTER 4.42).
///
/// Показывается при первом сохранении цитаты, если согласие ещё не дано.
/// Возвращает true — юзер включил ИИ-анализ, false — «Не сейчас».
///
/// 🔴 Apple 5.1.2(i): до явного согласия ни одна цитата не уходит в OpenAI.
Future<bool> showAiConsentModal(BuildContext context) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _AiConsentModal(),
  );
  return result ?? false;
}

class _AiConsentModal extends ConsumerStatefulWidget {
  const _AiConsentModal();

  @override
  ConsumerState<_AiConsentModal> createState() => _AiConsentModalState();
}

class _AiConsentModalState extends ConsumerState<_AiConsentModal> {
  bool _isSaving = false;

  Future<void> _enable() async {
    setState(() => _isSaving = true);
    try {
      await ref.read(aiConsentProvider.notifier).setConsent(true);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось включить. Попробуйте позже')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: AppSpacing.screenPadding,
        right: AppSpacing.screenPadding,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Icon(Icons.auto_awesome, size: 28, color: AppColors.purple),
          const SizedBox(height: 12),
          Text('ИИ-анализ цитат', style: AppTypography.serifSectionTitle),
          const SizedBox(height: 10),
          Text(
            'Когда вы сохраняете цитату, ИИ подготовит персональный разбор: '
            'почему она откликнулась, как связана с идеями книги и какой вопрос '
            'стоит себе задать. Цитаты обрабатываются OpenAI API и не используются '
            'для обучения моделей. Отключить можно в любой момент в профиле.',
            style: AppTypography.body.copyWith(color: AppColors.textSecondary),
          ),
          const SizedBox(height: 20),
          AppButton(
            text: 'Разрешить анализ',
            isLoading: _isSaving,
            onPressed: _isSaving ? null : _enable,
          ),
          const SizedBox(height: 12),
          Center(
            child: GestureDetector(
              onTap: _isSaving ? null : () => Navigator.of(context).pop(false),
              behavior: HitTestBehavior.opaque,
              child: SizedBox(
                height: AppSpacing.minTapTarget,
                child: Center(
                  child: Text(
                    'Не сейчас',
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
    );
  }
}
