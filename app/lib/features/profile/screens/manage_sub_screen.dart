import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/app_button.dart';
import '../../../shared/widgets/error_view.dart';
import '../../payments/providers/purchase_provider.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// Магазин текущей платформы. На уровне файла, потому что нужны и экрану,
/// и виджету _Body ниже (задача E3 ANDROID-PLAN).
bool get _isAndroid => defaultTargetPlatform == TargetPlatform.android;

/// Название магазина для кнопки и подписей.
String get _storeName => _isAndroid ? 'Google Play' : 'App Store';

/// Управление подпиской (экран 4.33, задача 6.2).
///
/// Показываем: текущий тариф, дату следующего списания / окончания, кнопку
/// «Восстановить покупки» и объяснение, как отменить.
///
/// ⚠️ Отмена подписки делается ТОЛЬКО в системных настройках магазина —
/// приложение не может отменить её за пользователя. Ведём в системный экран
/// управления подписками: у Apple — apps.apple.com/account/subscriptions,
/// у Google — play.google.com/store/account/subscriptions.
///
/// ⚠️ Никаких упоминаний сайта и внешней оплаты (Guideline 3.1.1 у Apple и
/// такое же правило у Google) — только магазин своей платформы.
///
/// 09.09.2026 (задача E3 ANDROID-PLAN): ссылка и тексты выбираются по
/// платформе. На iOS всё осталось дословно как было.
class ManageSubScreen extends ConsumerWidget {
  const ManageSubScreen({super.key});

  Future<void> _openStoreSubscriptions(BuildContext context) async {
    final uri = Uri.parse(
      _isAndroid
          ? 'https://play.google.com/store/account/subscriptions'
          : 'https://apps.apple.com/account/subscriptions',
    );
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          _isAndroid
              ? 'Откройте Google Play → ваш профиль → Платежи и подписки'
              : 'Откройте Настройки iPhone → ваш Apple ID → Подписки',
        ),
        backgroundColor: AppColors.textPrimary,
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);

    // P3: обратная связь по «Восстановить покупки» (раньше кнопка молчала).
    ref.listen<PaywallState>(purchaseProvider, (prev, next) {
      // Если сверху открыт paywall — тосты показывает он, не дублируем.
      if (ModalRoute.of(context)?.isCurrent == false) return;
      if (prev?.status == next.status &&
          next.infoMessage == null &&
          next.errorMessage == null) {
        return;
      }
      String? text;
      if (next.infoMessage != null) {
        text = next.infoMessage;
      } else if (next.status == PaywallStatus.error &&
          prev?.status != PaywallStatus.error) {
        text = next.errorMessage ?? 'Не удалось восстановить покупки';
      } else if (next.status == PaywallStatus.restored &&
          prev?.status != PaywallStatus.restored) {
        text = 'Покупки восстановлены';
        // Подписка вернулась — перечитываем профиль, чтобы экран обновился.
        ref.read(profileProvider.notifier).load();
      }
      if (text != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(text),
          backgroundColor: AppColors.textPrimary,
        ));
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Подписка', style: AppTypography.screenTitle),
      ),
      body: SafeArea(
        child: profileAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: AppColors.terracotta,
              strokeWidth: 2.5,
            ),
          ),
          error: (_, __) => ErrorView(
            message: 'Не удалось загрузить подписку',
            onRetry: () => ref.read(profileProvider.notifier).load(),
          ),
          data: (profile) => _Body(
            profile: profile,
            onManage: () => _openStoreSubscriptions(context),
            onRestore: () => ref.read(purchaseProvider.notifier).restore(),
            onSubscribe: () => context.push(Routes.paywall),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.profile,
    required this.onManage,
    required this.onRestore,
    required this.onSubscribe,
  });

  final UserProfile profile;
  final VoidCallback onManage;
  final VoidCallback onRestore;
  final VoidCallback onSubscribe;

  String get _planTitle {
    if (!profile.hasSubscription) {
      return profile.subscriptionStatus == 'expired'
          ? 'Подписка закончилась'
          : 'Подписки нет';
    }
    return profile.subscriptionPlan == 'season'
        ? 'Сезон · 3 месяца'
        : 'Месяц';
  }

  String get _dateLine {
    final until = profile.subscriptionExpiresAt;
    if (until == null) return 'Дата не определена';
    final dd = until.day.toString().padLeft(2, '0');
    final mm = until.month.toString().padLeft(2, '0');
    final date = '$dd.$mm.${until.year}';
    return profile.hasSubscription
        ? 'Следующее списание — $date'
        : 'Действовала до $date';
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_planTitle, style: AppTypography.serifSectionTitle),
              const SizedBox(height: 6),
              Text(
                profile.hasSubscription || profile.subscriptionExpiresAt != null
                    ? _dateLine
                    : 'Клуб открывается по подписке',
                style: AppTypography.caption,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        if (profile.hasSubscription) ...[
          AppButton(
            text: 'Управлять подпиской в $_storeName',
            onPressed: onManage,
          ),
          const SizedBox(height: 10),
          Text(
            'Отмена подписки делается только в настройках $_storeName. После '
            'отмены доступ сохраняется до конца оплаченного периода — клуб не '
            'закроется в тот же день.',
            style: AppTypography.caption,
          ),
        ] else ...[
          AppButton(
            text: 'Вступить в клуб',
            onPressed: onSubscribe,
          ),
          const SizedBox(height: 10),
          Text(
            _isAndroid
                ? 'Если вы уже оформляли подписку с этим аккаунтом Google, '
                    'восстановите покупки — доступ вернётся.'
                : 'Если вы уже оформляли подписку с этим Apple ID, восстановите '
                    'покупки — доступ вернётся.',
            style: AppTypography.caption,
          ),
        ],

        const SizedBox(height: 20),
        Center(
          child: TextButton(
            onPressed: onRestore,
            child: Text(
              'Восстановить покупки',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.terracotta,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
