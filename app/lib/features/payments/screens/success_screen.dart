import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/app_button.dart';
import '../../club/providers/club_provider.dart';

/// Экран успешной покупки подписки (MASTER 4.29).
/// Показывается после подтверждения чека сервером.
///
/// ⚠️ После покупки сбрасываем кэш клуба (currentClubProvider): до покупки
/// провайдер мог закэшировать 403 SUBSCRIPTION_REQUIRED (юзер был без
/// подписки → paywall). Без invalidate переход в клуб показал бы старый
/// закэшированный paywall, хотя подписка уже активна. invalidate заставляет
/// клуб перезапросить доступ у сервера — теперь вернётся активный доступ.
class SuccessScreen extends ConsumerWidget {
  const SuccessScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenPadding),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 88,
                height: 88,
                decoration: const BoxDecoration(
                  color: AppColors.success,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_rounded, color: Colors.white, size: 48),
              ),
              const SizedBox(height: 24),
              Text(
                'Добро пожаловать в клуб!',
                style: AppTypography.screenTitle,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'Подписка активна. Слушайте разбор книги месяца, заходите '
                'в чат сообщества и сохраняйте цитаты в журнал.',
                style: AppTypography.bodyLarge.copyWith(color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              AppButton(
                text: 'Начать слушать',
                onPressed: () {
                  // Сбросить кэш клуба, чтобы он перезапросил доступ с новой
                  // подпиской (иначе покажется старый закэшированный paywall).
                  ref.invalidate(currentClubProvider);
                  ref.invalidate(clubListProvider);
                  context.go('/club');
                },
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () {
                  ref.invalidate(currentClubProvider);
                  ref.invalidate(clubListProvider);
                  context.go('/');
                },
                child: Text(
                  'На главную',
                  style: AppTypography.bodyMedium.copyWith(color: AppColors.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
