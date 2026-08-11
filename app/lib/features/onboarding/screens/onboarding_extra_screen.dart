import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';
import '../providers/onboarding_provider.dart';

/// Онбординг, экран «Страна / город / рассылка» (задача 6.3) — необязательный.
///
/// Страна и город нужны, чтобы профиль не был пустым (те же поля редактируются
/// в профиле). Почта для рассылки — отдельно от аккаунтной: при Apple «Скрыть
/// email» настоящей почты у нас нет, поэтому спрашиваем явно и только с
/// галочкой согласия. Всё можно пропустить.
class OnboardingExtraScreen extends ConsumerStatefulWidget {
  const OnboardingExtraScreen({super.key});

  @override
  ConsumerState<OnboardingExtraScreen> createState() =>
      _OnboardingExtraScreenState();
}

class _OnboardingExtraScreenState extends ConsumerState<OnboardingExtraScreen> {
  final _countryCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  bool _marketingConsent = false;
  bool _isSaving = false;

  @override
  void dispose() {
    _countryCtrl.dispose();
    _cityCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  // Простая проверка email — сервер валидирует строго, тут отсекаем очевидное.
  bool _looksLikeEmail(String v) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v);

  Future<void> _save() async {
    final country = _countryCtrl.text.trim();
    final city = _cityCtrl.text.trim();
    final email = _emailCtrl.text.trim();

    // Галочка стоит, но почты нет — не пускаем дальше молча.
    if (_marketingConsent && email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Укажите почту для рассылки или снимите галочку')),
      );
      return;
    }
    if (_marketingConsent && !_looksLikeEmail(email)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Проверьте адрес почты')),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      // Почту шлём только вместе с согласием.
      await ref.read(onboardingControllerProvider).saveExtra(
            country: country.isEmpty ? null : country,
            city: city.isEmpty ? null : city,
            marketingEmail:
                _marketingConsent && email.isNotEmpty ? email : null,
            marketingConsent: _marketingConsent,
          );
      if (!mounted) return;
      context.go(Routes.aiConsent);
    } catch (_) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось сохранить. Попробуйте позже')),
      );
    }
  }

  void _skip() {
    context.go(Routes.aiConsent);
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
              const Icon(Icons.public, size: 32, color: AppColors.terracotta),
              const SizedBox(height: 16),
              Text('Немного о вас', style: AppTypography.serifHeadline),
              const SizedBox(height: 12),
              Text(
                'Необязательно — можно заполнить позже в профиле.',
                style: AppTypography.bodyLarge.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 24),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('Страна'),
                      _field(_countryCtrl, 'Например, Грузия'),
                      const SizedBox(height: 16),
                      _label('Город'),
                      _field(_cityCtrl, 'Например, Тбилиси'),
                      const SizedBox(height: 24),
                      _label('Почта для рассылки'),
                      const SizedBox(height: 2),
                      Text(
                        'Новости и анонсы вне приложения. Можно оставить пустым.',
                        style: AppTypography.caption,
                      ),
                      const SizedBox(height: 8),
                      _field(
                        _emailCtrl,
                        'email@example.com',
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 12),
                      _consentRow(),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              AppButton(
                text: 'Далее',
                isLoading: _isSaving,
                onPressed: _isSaving ? null : _save,
              ),
              const SizedBox(height: 12),
              Center(
                child: GestureDetector(
                  onTap: _isSaving ? null : _skip,
                  behavior: HitTestBehavior.opaque,
                  child: SizedBox(
                    height: AppSpacing.minTapTarget,
                    child: Center(
                      child: Text(
                        'Пропустить',
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

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: AppTypography.bodyMedium),
      );

  Widget _field(
    TextEditingController controller,
    String hint, {
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      textCapitalization: keyboardType == TextInputType.emailAddress
          ? TextCapitalization.none
          : TextCapitalization.words,
      style: AppTypography.inputText.copyWith(fontSize: 16),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppTypography.inputPlaceholder,
        filled: true,
        fillColor: AppColors.cardBackground,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
          borderSide: const BorderSide(color: AppColors.terracotta, width: 1.5),
        ),
      ),
    );
  }

  Widget _consentRow() {
    return GestureDetector(
      onTap: () => setState(() => _marketingConsent = !_marketingConsent),
      behavior: HitTestBehavior.opaque,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              color: _marketingConsent ? AppColors.terracotta : Colors.white,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: _marketingConsent
                    ? AppColors.terracotta
                    : AppColors.textMetadata,
                width: 2,
              ),
            ),
            child: _marketingConsent
                ? const Icon(Icons.check, size: 14, color: Colors.white)
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Хочу получать новости и рассылку на эту почту',
              style: AppTypography.small.copyWith(
                color: AppColors.textSecondary,
                height: 1.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
