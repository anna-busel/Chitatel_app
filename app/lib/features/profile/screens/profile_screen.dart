import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/ai_consent_modal.dart';
import '../../../shared/widgets/error_view.dart';
import '../../auth/providers/auth_provider.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// Профиль (экран 4.27, задача 6.2).
///
/// Заменяет временную заглушку из Фазы 5 (там была одна кнопка «Мой дневник»).
///
/// Состав:
/// - шапка: аватар + имя + почта, тап → редактирование (4.46);
/// - карточка подписки: статус и дата, тап → управление (4.33) либо paywall;
/// - тумблер «ИИ-анализ» (4.27): включение показывает модалку согласия (4.42) —
///   без явного согласия ни одна цитата не уходит в OpenAI (Apple 5.1.2(i));
/// - меню: Мой дневник, Мой прогресс, Мои покупки, Уведомления,
///   Заблокированные (A1), Поддержка;
/// - выход и удаление аккаунта (4.34, Apple 5.1.1(v)).
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: profileAsync.when(
        loading: () => const Center(
          child: CircularProgressIndicator(
            color: AppColors.terracotta,
            strokeWidth: 2.5,
          ),
        ),
        error: (_, __) => ErrorView(
          message: 'Не удалось загрузить профиль',
          onRetry: () => ref.read(profileProvider.notifier).load(),
        ),
        data: (profile) => _ProfileBody(profile: profile),
      ),
    );
  }
}

class _ProfileBody extends ConsumerWidget {
  const _ProfileBody({required this.profile});
  final UserProfile profile;

  Future<void> _toggleAi(BuildContext context, WidgetRef ref, bool value) async {
    // Включение — только после явного согласия (модалка 4.42).
    if (value) {
      final agreed = await showAiConsentModal(context);
      if (agreed != true) return;
    }

    try {
      await ref.read(profileProvider.notifier).setAiConsent(value);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          value
              ? 'ИИ-анализ включён — новые цитаты будут разбираться'
              : 'ИИ-анализ выключен. Цитаты сохраняются без разбора',
        ),
        backgroundColor: AppColors.textPrimary,
      ));
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось изменить настройку'),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.background,
        title: Text('Выйти из аккаунта?', style: AppTypography.sectionHeader),
        content: Text(
          'Ваши цитаты и прогресс сохранятся — они привязаны к аккаунту.',
          style: AppTypography.body,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Отмена',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.terracotta),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Выйти'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(authProvider.notifier).logout();
    if (!context.mounted) return;
    context.go(Routes.login);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      color: AppColors.terracotta,
      onRefresh: () => ref.read(profileProvider.notifier).load(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenPadding,
          16,
          AppSpacing.screenPadding,
          32,
        ),
        children: [
          // — Шапка: аватар + имя —
          _ProfileHeader(
            profile: profile,
            onTap: () => context.push(Routes.editProfile),
          ),
          const SizedBox(height: 20),

          // — Подписка —
          _SubscriptionCard(
            profile: profile,
            onTap: () => context.push(
              profile.hasSubscription ? Routes.manageSub : Routes.paywall,
            ),
          ),
          const SizedBox(height: 20),

          // — Тумблер ИИ-анализа (4.27) —
          _AiToggleCard(
            value: profile.aiConsent,
            onChanged: (v) => _toggleAi(context, ref, v),
          ),
          const SizedBox(height: 20),

          // — Меню —
          _MenuGroup(
            items: [
              _MenuItem(
                icon: Icons.menu_book_outlined,
                title: 'Мой дневник',
                onTap: () => context.push(Routes.diary),
              ),
              _MenuItem(
                icon: Icons.insights_outlined,
                title: 'Мой прогресс',
                onTap: () => context.push(Routes.myProgress),
              ),
              _MenuItem(
                icon: Icons.receipt_long_outlined,
                title: 'Мои покупки',
                onTap: () => context.push(Routes.myPurchases),
              ),
              _MenuItem(
                icon: Icons.notifications_none,
                title: 'Уведомления',
                onTap: () => context.push(Routes.notificationSettings),
              ),
              _MenuItem(
                icon: Icons.block_outlined,
                title: 'Заблокированные',
                onTap: () => context.push(Routes.blockedUsers),
              ),
              _MenuItem(
                icon: Icons.help_outline,
                title: 'Поддержка',
                onTap: () => context.push(Routes.support),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // — Выход —
          Center(
            child: TextButton(
              onPressed: () => _logout(context, ref),
              child: Text(
                'Выйти из аккаунта',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ),

          // — Удаление аккаунта (Apple 5.1.1(v)) —
          Center(
            child: TextButton(
              onPressed: () => context.push(Routes.deleteAccount),
              child: Text(
                'Удалить аккаунт',
                style: AppTypography.caption.copyWith(color: AppColors.error),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Аватар + имя + почта. Тап — редактирование профиля.
class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.profile, required this.onTap});
  final UserProfile profile;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasAvatar =
        profile.avatarUrl != null && profile.avatarUrl!.isNotEmpty;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              ClipOval(
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: hasAvatar
                      ? CachedNetworkImage(
                          imageUrl: profile.avatarUrl!,
                          fit: BoxFit.cover,
                          errorWidget: (_, __, ___) =>
                              _AvatarFallback(name: profile.name),
                        )
                      : _AvatarFallback(name: profile.name),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profile.name,
                      style: AppTypography.serifSectionTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      profile.email ?? 'Вход через ${profile.authProvider}',
                      style: AppTypography.caption,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right,
                color: AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final letter = name.isNotEmpty ? name.characters.first.toUpperCase() : '?';
    return Container(
      color: AppColors.surfaceMedium,
      alignment: Alignment.center,
      child: Text(letter, style: AppTypography.serifSectionTitle),
    );
  }
}

/// Карточка подписки: статус + дата следующего списания / окончания.
class _SubscriptionCard extends StatelessWidget {
  const _SubscriptionCard({required this.profile, required this.onTap});
  final UserProfile profile;
  final VoidCallback onTap;

  String get _title {
    if (profile.hasSubscription) {
      return profile.subscriptionPlan == 'season'
          ? 'Сезонная подписка'
          : 'Подписка на клуб';
    }
    if (profile.subscriptionStatus == 'expired') return 'Подписка закончилась';
    return 'Вы не в клубе';
  }

  String get _subtitle {
    final until = profile.subscriptionExpiresAt;
    if (profile.hasSubscription && until != null) {
      final dd = until.day.toString().padLeft(2, '0');
      final mm = until.month.toString().padLeft(2, '0');
      return 'Действует до $dd.$mm.${until.year}';
    }
    if (profile.subscriptionStatus == 'expired') {
      return 'Вернуться в клуб — одно касание';
    }
    return 'Разборы, чат с Анной и участницами';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.cardBackground,
      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.auto_stories_outlined,
                color: AppColors.terracotta,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_title, style: AppTypography.sectionHeader),
                    const SizedBox(height: 2),
                    Text(
                      _subtitle,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

/// Тумблер «ИИ-анализ цитат».
class _AiToggleCard extends StatelessWidget {
  const _AiToggleCard({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: SwitchListTile.adaptive(
        value: value,
        activeColor: AppColors.terracotta,
        title: Text('ИИ-анализ цитат', style: AppTypography.bodyMedium),
        subtitle: Text(
          value
              ? 'Цитаты разбираются через OpenAI. Можно выключить в любой момент'
              : 'Включите, чтобы получать разбор цитат и недельные отчёты',
          style: AppTypography.caption,
        ),
        onChanged: onChanged,
      ),
    );
  }
}

class _MenuItem {
  const _MenuItem({
    required this.icon,
    required this.title,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final VoidCallback onTap;
}

class _MenuGroup extends StatelessWidget {
  const _MenuGroup({required this.items});
  final List<_MenuItem> items;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            ListTile(
              leading: Icon(items[i].icon, color: AppColors.terracotta, size: 22),
              title: Text(items[i].title, style: AppTypography.body),
              trailing: const Icon(
                Icons.chevron_right,
                size: 20,
                color: AppColors.textSecondary,
              ),
              onTap: items[i].onTap,
            ),
            if (i != items.length - 1)
              const Divider(height: 1, indent: 56, endIndent: 8),
          ],
        ],
      ),
    );
  }
}
