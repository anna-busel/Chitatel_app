import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/router/routes.dart';
import '../../../core/services/push_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/app_button.dart';

/// Разрешение на push (MASTER 4.8) — шаг онбординга после согласия на ИИ.
///
/// «Не сейчас» — валидный выбор; включить уведомления можно позже в настройках
/// (Профиль → Уведомления) и в системных настройках iPhone.
class PushPermissionScreen extends ConsumerStatefulWidget {
  const PushPermissionScreen({super.key});

  @override
  ConsumerState<PushPermissionScreen> createState() =>
      _PushPermissionScreenState();
}

class _PushPermissionScreenState extends ConsumerState<PushPermissionScreen> {
  bool _isBusy = false;

  static const List<String> _points = [
    'Новые аудиоразборы',
    'Готов ИИ-анализ вашей цитаты',
    'Ответы Анны в чате и Q&A',
    'Еженедельный отчёт',
  ];

  Future<void> _allow() async {
    setState(() => _isBusy = true);
    // Системный диалог iOS. Результат не блокирует переход — экран в любом
    // случае ведёт дальше, разрешение можно поменять позже.
    await ref.read(pushServiceProvider).requestPermissionAndRegister();
    if (!mounted) return;
    context.go(Routes.home);
  }

  void _skip() {
    context.go(Routes.home);
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
              const Icon(
                Icons.notifications_none,
                size: 32,
                color: AppColors.terracotta,
              ),
              const SizedBox(height: 16),
              Text('Не пропустите важное', style: AppTypography.serifHeadline),
              const SizedBox(height: 12),
              Text(
                'Только полезное — никакого спама.',
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
                text: 'Разрешить уведомления',
                isLoading: _isBusy,
                onPressed: _isBusy ? null : _allow,
              ),
              const SizedBox(height: 12),
              Center(
                child: GestureDetector(
                  onTap: _isBusy ? null : _skip,
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
        ),
      ),
    );
  }
}
