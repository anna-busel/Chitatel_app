import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/constants/app_spacing.dart';
import '../../core/network/network_error.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../features/profile/providers/profile_provider.dart';
import 'app_button.dart';

/// Правила сообщества перед первой публикацией (UPDATES-PLAN A3, 05.11.2026).
///
/// Google UGC policy и Apple 1.2: до того как человек впервые опубликует
/// что-то видимое другим (отзыв, позже фото, «о себе»), он принимает правила.
/// Отметка — User.ugcRulesAcceptedAt на сервере (POST /api/profile/ugc-rules),
/// поэтому один раз на аккаунт, а не на устройство.
///
/// Возвращает true, если правила уже приняты или приняты сейчас; false —
/// шторку закрыли. [force] — показать, даже если профиль считает правила
/// принятыми (сервер ответил UGC_RULES_REQUIRED).
Future<bool> ensureCommunityRulesAccepted(
  BuildContext context,
  WidgetRef ref, {
  bool force = false,
}) async {
  if (!force) {
    var profile = ref.read(profileProvider).valueOrNull;
    if (profile == null) {
      // Профиль ещё не загружен (или упал) — дочитываем, чтобы не
      // показывать правила тем, кто их уже принял.
      await ref.read(profileProvider.notifier).load();
      if (!context.mounted) return false;
      profile = ref.read(profileProvider).valueOrNull;
    }
    if (profile?.ugcRulesAcceptedAt != null) return true;
  }
  final accepted = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (_) => const _CommunityRulesSheet(),
  );
  return accepted ?? false;
}

class _CommunityRulesSheet extends ConsumerStatefulWidget {
  const _CommunityRulesSheet();

  @override
  ConsumerState<_CommunityRulesSheet> createState() =>
      _CommunityRulesSheetState();
}

class _CommunityRulesSheetState extends ConsumerState<_CommunityRulesSheet> {
  bool _isSaving = false;

  static const List<String> _points = [
    'Пишите уважительно — без оскорблений, травли и спама',
    'Ваши отзывы видят другие участницы',
    'На любую публикацию можно пожаловаться',
    'Модерация скрывает то, что нарушает правила',
  ];

  Future<void> _accept() async {
    setState(() => _isSaving = true);
    try {
      await ref.read(profileProvider.notifier).acceptUgcRules();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          userMessageFor(e, fallback: 'Не удалось сохранить. Попробуйте ещё раз'),
        ),
        backgroundColor: AppColors.error,
      ));
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
      child: SafeArea(
        top: false,
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
            const Icon(
              Icons.forum_outlined,
              size: 28,
              color: AppColors.terracotta,
            ),
            const SizedBox(height: 12),
            Text('Правила сообщества', style: AppTypography.serifSectionTitle),
            const SizedBox(height: 14),
            for (final point in _points)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 2),
                      child: Icon(
                        Icons.check,
                        size: 16,
                        color: AppColors.success,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        point,
                        style: AppTypography.body.copyWith(
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 14),
            AppButton(
              text: 'Принимаю',
              isLoading: _isSaving,
              onPressed: _isSaving ? null : _accept,
            ),
            const SizedBox(height: 4),
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
      ),
    );
  }
}
