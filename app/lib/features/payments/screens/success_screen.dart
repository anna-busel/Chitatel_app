import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/app_button.dart';
import '../../club/providers/club_provider.dart';

class SuccessScreen extends ConsumerWidget {
  const SuccessScreen({super.key});

  void _goto(BuildContext context, WidgetRef ref, String location) {
    ref.invalidate(currentClubProvider);
    ref.invalidate(clubListProvider);
    final nav = Navigator.of(context, rootNavigator: true);
    while (nav.canPop()) {
      nav.pop();
    }
    context.go(location);
  }

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
                'Подписка активна. Слушайте разбор книги месяца, заходите в чат сообщества и сохраняйте цитаты в журнал.',
                style: AppTypography.bodyLarge.copyWith(color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
              const Spacer(),
              AppButton(
                text: 'Начать слушать',
                onPressed: () => _goto(context, ref, '/club'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => _goto(context, ref, '/'),
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
