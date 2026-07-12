import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../shared/widgets/error_view.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// Настройки уведомлений (экран 4.31, задача 6.2).
///
/// Тумблеры сохраняются на сервере (User.pushSettings). Сам отправитель push
/// (задача 6.1, волна 6Б) обязан читать эти флаги перед отправкой — экран
/// сделан заранее, чтобы настройки уже существовали к моменту, когда push
/// включат, и чтобы юзер мог их выставить до первого уведомления.
class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  static const List<_Setting> _settings = [
    _Setting(
      key: 'dailyQuote',
      title: 'Мысль дня',
      subtitle: 'Короткая цитата с идеей на день',
    ),
    _Setting(
      key: 'newAudio',
      title: 'Новый аудиоразбор',
      subtitle: 'Когда выходит новая часть разбора',
    ),
    _Setting(
      key: 'aiReady',
      title: 'Разбор цитаты готов',
      subtitle: 'Когда ИИ закончил анализ вашей цитаты',
    ),
    _Setting(
      key: 'weeklyReport',
      title: 'Недельный отчёт',
      subtitle: 'Итоги вашей недели по воскресеньям',
    ),
    _Setting(
      key: 'chatMessages',
      title: 'Ответы в клубе',
      subtitle: 'Ответ на ваше сообщение или вопрос',
    ),
    _Setting(
      key: 'reminders',
      title: 'Напоминания',
      subtitle: 'Мягкое напоминание записать цитату',
    ),
  ];

  Future<void> _toggle(
    BuildContext context,
    WidgetRef ref,
    String key,
    bool value,
  ) async {
    try {
      await ref
          .read(profileProvider.notifier)
          .updatePushSettings({key: value});
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось сохранить настройку'),
        backgroundColor: AppColors.error,
      ));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('Уведомления', style: AppTypography.screenTitle),
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
            message: 'Не удалось загрузить настройки',
            onRetry: () => ref.read(profileProvider.notifier).load(),
          ),
          data: (profile) => _Body(
            profile: profile,
            onToggle: (key, value) => _toggle(context, ref, key, value),
          ),
        ),
      ),
    );
  }
}

class _Setting {
  const _Setting({
    required this.key,
    required this.title,
    required this.subtitle,
  });
  final String key;
  final String title;
  final String subtitle;
}

class _Body extends StatelessWidget {
  const _Body({required this.profile, required this.onToggle});
  final UserProfile profile;
  final void Function(String key, bool value) onToggle;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenPadding),
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              for (var i = 0;
                  i < NotificationSettingsScreen._settings.length;
                  i++) ...[
                SwitchListTile.adaptive(
                  value:
                      profile.pushSettings[
                              NotificationSettingsScreen._settings[i].key] ??
                          true,
                  activeColor: AppColors.terracotta,
                  title: Text(
                    NotificationSettingsScreen._settings[i].title,
                    style: AppTypography.body,
                  ),
                  subtitle: Text(
                    NotificationSettingsScreen._settings[i].subtitle,
                    style: AppTypography.caption,
                  ),
                  onChanged: (v) => onToggle(
                    NotificationSettingsScreen._settings[i].key,
                    v,
                  ),
                ),
                if (i != NotificationSettingsScreen._settings.length - 1)
                  const Divider(height: 1, indent: 16, endIndent: 16),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Полностью отключить уведомления от приложения можно в Настройках '
          'iPhone → Уведомления → ЧИТАТЕЛЬ.',
          style: AppTypography.caption,
        ),
      ],
    );
  }
}
