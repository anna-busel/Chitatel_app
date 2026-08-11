import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/services/push_service.dart';
import '../../../shared/widgets/error_view.dart';
import '../providers/profile_provider.dart';
import '../services/profile_service.dart';

/// Статус разрешения на уведомления (задача 6.1, умная кнопка). autoDispose —
/// перечитывается при каждом открытии экрана. 'unknown' (канал недоступен / не
/// iOS) трактуем как «можно показать запрос» — безопасный дефолт.
final _pushStatusProvider = FutureProvider.autoDispose<String>((ref) async {
  return ref.read(pushServiceProvider).getPermissionStatus();
});

/// Настройки уведомлений (экран 4.31, задача 6.2).
///
/// Тумблеры сохраняются на сервере (User.pushSettings). Отправитель push
/// (push.service) читает эти флаги перед отправкой. «Отчёты» гейтит недельный
/// и месячный отчёты; «Новости» — анонсы сезона и новинки клуба.
///
/// В футере — действие «Запросить разрешение на этом устройстве», показываемое
/// по статусу разрешения (задача 6.1, умная кнопка): если разрешено — прячем;
/// отказано — ведём в Настройки iPhone; не спрашивали — показываем запрос.
/// Нужно для тех, кто нажал «Не сейчас» на онбординге (4.8) или вошёл мимо:
/// пока приложение ни разу не запросило разрешение, iOS даже не показывает
/// раздел уведомлений приложения в Настройках, и пуши не приходят.
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
      key: 'reports',
      title: 'Отчёты',
      subtitle: 'Недельные и месячные итоги ваших цитат',
    ),
    _Setting(
      key: 'news',
      title: 'Новости',
      subtitle: 'Анонсы сезонов и новинки клуба',
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

  Future<void> _enablePush(BuildContext context, WidgetRef ref) async {
    final granted =
        await ref.read(pushServiceProvider).requestPermissionAndRegister();
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(
        granted
            ? 'Уведомления включены на этом устройстве'
            : 'Разрешение не выдано. Включите в Настройках iPhone → ЧИТАТЕЛЬ → Уведомления.',
      ),
    ));
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
            permissionStatus:
                ref.watch(_pushStatusProvider).asData?.value ?? 'unknown',
            onToggle: (key, value) => _toggle(context, ref, key, value),
            onEnablePush: () => _enablePush(context, ref),
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
  const _Body({
    required this.profile,
    required this.permissionStatus,
    required this.onToggle,
    required this.onEnablePush,
  });
  final UserProfile profile;
  final String permissionStatus;
  final void Function(String key, bool value) onToggle;
  final VoidCallback onEnablePush;

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
        _footer(),
      ],
    );
  }

  /// Футер по статусу разрешения (задача 6.1, умная кнопка):
  /// - разрешено → ничего (не выпячиваем);
  /// - отказано → подсказка вести в Настройки iPhone (кнопка-запрос бесполезна,
  ///   iOS второй раз диалог не покажет);
  /// - не спрашивали / статус неизвестен → кнопка запроса + подсказка.
  Widget _footer() {
    if (permissionStatus == 'authorized' || permissionStatus == 'provisional') {
      return const SizedBox.shrink();
    }
    final denied = permissionStatus == 'denied';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),
        Text(
          'Уведомления не приходят?',
          style: AppTypography.captionMedium
              .copyWith(color: AppColors.textSecondary),
        ),
        const SizedBox(height: 4),
        if (!denied)
          GestureDetector(
            onTap: onEnablePush,
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                'Запросить разрешение на этом устройстве',
                style: AppTypography.bodyMedium
                    .copyWith(color: AppColors.terracotta),
              ),
            ),
          ),
        Text(
          denied
              ? 'Разрешение выключено. Включите: Настройки iPhone → Уведомления → ЧИТАТЕЛЬ.'
              : 'Либо включите вручную: Настройки iPhone → Уведомления → ЧИТАТЕЛЬ.',
          style: AppTypography.caption,
        ),
      ],
    );
  }
}
