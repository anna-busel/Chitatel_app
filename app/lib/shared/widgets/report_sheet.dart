import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/network_error.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../features/club/services/block_service.dart';
import '../../features/club/services/club_api_service.dart';
import '../services/content_report_service.dart';

/// Общая жалоба и блокировка автора (UPDATES-PLAN A3, 05.11.2026).
///
/// Сделано по образцу шторки жалобы в чате (chat_tab.dart, _showReportSheet):
/// те же 5 причин и тот же тумблер «Заблокировать». Чат пока живёт со своей
/// копией (у сообщений свой эндпоинт жалобы) — этот виджет для нового
/// контента: отзывы (C3), дальше профиль, полка, лента.
///
/// Apple 1.2 / Google UGC: на любом пользовательском контенте — жалоба и
/// блокировка автора. Блокировка общая с чатом (blockedIdsProvider), снять её
/// можно в Профиль → «Заблокированные».

/// Причины жалобы — как в чате и на сервере (Report.reason).
const List<({String code, String label})> kReportReasons = [
  (code: 'spam', label: 'Спам'),
  (code: 'inappropriate', label: 'Неуместный контент'),
  (code: 'offensive', label: 'Оскорбления'),
  (code: 'copyright', label: 'Нарушение авторских прав'),
  (code: 'other', label: 'Другое'),
];

class _ReportChoice {
  const _ReportChoice({required this.reason, required this.block});
  final String reason;
  final bool block;
}

/// Шторка «Пожаловаться»: причина → POST /api/reports, по желанию —
/// блокировка автора. Сама показывает снекбар с результатом.
///
/// [targetType] — 'review' | 'profile' (то, что принимает сервер).
/// [authorId]/[authorName] — для тумблера блокировки; без authorId тумблера
/// нет. [canBlock] = false — например, автор сам Анна (её заблокировать нельзя).
/// [onBlocked] — вызывается после успешной блокировки (убрать контент из
/// списка на экране, не дожидаясь перезагрузки).
///
/// Возвращает true, если жалоба отправлена (или уже была).
Future<bool> showReportSheet(
  BuildContext context,
  WidgetRef ref, {
  required String targetType,
  required String targetId,
  String? authorId,
  String? authorName,
  bool canBlock = true,
  VoidCallback? onBlocked,
}) async {
  final showBlock = canBlock && authorId != null && authorId.isNotEmpty;
  final name = (authorName == null || authorName.isEmpty)
      ? 'автора'
      : authorName;

  var block = false;
  final choice = await showModalBottomSheet<_ReportChoice>(
    context: context,
    backgroundColor: AppColors.cardBackground,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSheetState) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: Text(
                  'Причина жалобы',
                  style: AppTypography.sectionHeader,
                ),
              ),
              if (showBlock) ...[
                SwitchListTile.adaptive(
                  value: block,
                  activeColor: AppColors.terracotta,
                  title: Text(
                    'Заблокировать $name',
                    style: AppTypography.body,
                  ),
                  subtitle: Text(
                    'Вы не будете видеть её отзывы и сообщения',
                    style: AppTypography.caption,
                  ),
                  onChanged: (v) => setSheetState(() => block = v),
                ),
                const Divider(height: 1),
              ],
              for (final r in kReportReasons)
                ListTile(
                  title: Text(r.label, style: AppTypography.body),
                  onTap: () => Navigator.of(ctx).pop(
                    _ReportChoice(reason: r.code, block: block),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
  if (choice == null || !context.mounted) return false;

  var sent = false;
  try {
    final duplicate = await ref.read(contentReportServiceProvider).report(
          targetType: targetType,
          targetId: targetId,
          reason: choice.reason,
        );
    sent = true;
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          duplicate
              ? 'Вы уже жаловались на это. Мы рассмотрим жалобу'
              : 'Жалоба отправлена. Мы рассмотрим её в ближайшее время',
        ),
        backgroundColor: AppColors.success,
      ));
    }
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          userMessageFor(e, fallback: 'Не удалось отправить жалобу'),
        ),
        backgroundColor: AppColors.error,
      ));
    }
  }

  if (choice.block && showBlock && context.mounted) {
    await blockAuthor(
      context,
      ref,
      userId: authorId!,
      name: authorName,
      onBlocked: onBlocked,
    );
  }
  return sent;
}

/// «Заблокировать автора» отдельным пунктом меню: подтверждение →
/// блокировка. Возвращает true, если заблокировали.
Future<bool> confirmAndBlockAuthor(
  BuildContext context,
  WidgetRef ref, {
  required String userId,
  String? name,
  VoidCallback? onBlocked,
}) async {
  final who = (name == null || name.isEmpty) ? 'эту участницу' : name;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text('Заблокировать $who?'),
      content: const Text(
        'Вы не будете видеть её отзывы и сообщения в клубе. '
        'Разблокировать можно в профиле, в разделе «Заблокированные».',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('Отмена'),
        ),
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text(
            'Заблокировать',
            style: TextStyle(color: AppColors.error),
          ),
        ),
      ],
    ),
  );
  if (ok != true || !context.mounted) return false;
  return blockAuthor(
    context,
    ref,
    userId: userId,
    name: name,
    onBlocked: onBlocked,
  );
}

/// Блокировка: сервер + общий блок-лист (blockedIdsProvider, как в чате).
/// Сама показывает снекбар. Возвращает true при успехе.
Future<bool> blockAuthor(
  BuildContext context,
  WidgetRef ref, {
  required String userId,
  String? name,
  VoidCallback? onBlocked,
}) async {
  try {
    await ref.read(blockedIdsProvider.notifier).block(userId);
    // Сначала снекбар, потом onBlocked: onBlocked убирает контент из списка,
    // и виджет, из которого нас позвали, может исчезнуть вместе с context.
    if (context.mounted) {
      final who = (name == null || name.isEmpty) ? 'участницу' : name;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
          'Вы заблокировали $who. Разблокировать можно в профиле',
        ),
        backgroundColor: AppColors.textPrimary,
      ));
    }
    onBlocked?.call();
    return true;
  } catch (e) {
    if (context.mounted) {
      // Как в чате: VALIDATION_ERROR — это Анна или вы сами.
      final code = e is DioException
          ? ClubApiService.errorCodeFromException(e)
          : null;
      final msg = code == 'VALIDATION_ERROR'
          ? 'Эту участницу нельзя заблокировать'
          : userMessageFor(e,
              fallback: 'Не удалось заблокировать. Попробуйте ещё раз');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(msg),
        backgroundColor: AppColors.error,
      ));
    }
    return false;
  }
}
