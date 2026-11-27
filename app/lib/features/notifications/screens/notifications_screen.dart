import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_spacing.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/router/routes.dart';
import '../../../core/services/purchase_target.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../models/app_notification.dart';
import '../providers/notification_provider.dart';

/// Экран уведомлений (MASTER 4.30). Открывается с колокольчика в шапке главной.
///
/// Непрочитанные — жирный шрифт + красная точка; прочитанные — 55% прозрачности.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(notificationsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          // Экран может быть открыт из пуша без стека — тогда уходим
          // на главную, чтобы не остаться в тупике без выхода.
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go(Routes.home);
            }
          },
        ),
        title: Text('Уведомления', style: AppTypography.screenTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: AppColors.textPrimary),
            onPressed: () => context.push(Routes.notificationSettings),
          ),
        ],
      ),
      body: SafeArea(
        child: state.when(
          loading: () => const Center(
            child: CircularProgressIndicator(
              color: AppColors.terracotta,
              strokeWidth: 2.5,
            ),
          ),
          error: (_, __) => _ErrorView(onRetry: () =>
              ref.read(notificationsProvider.notifier).load()),
          data: (d) => d.items.isEmpty
              ? const _EmptyView()
              : _list(context, ref, d.items),
        ),
      ),
    );
  }

  Widget _list(
    BuildContext context,
    WidgetRef ref,
    List<AppNotification> items,
  ) {
    return RefreshIndicator(
      color: AppColors.terracotta,
      onRefresh: () => ref.read(notificationsProvider.notifier).load(),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) => _tile(context, ref, items[i]),
      ),
    );
  }

  Widget _tile(BuildContext context, WidgetRef ref, AppNotification n) {
    final visual = _visual(n.type);
    final tile = ListTile(
      onTap: () => _open(context, ref, n),
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: visual.$2.withOpacity(0.12),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(visual.$1, size: 20, color: visual.$2),
      ),
      title: Text(
        n.title,
        style: n.isRead
            ? AppTypography.body
            : AppTypography.bodyMedium,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 2),
          Text(n.body, style: AppTypography.caption),
          // F3 (27.11.2026): заявку в друзья можно принять прямо в ленте.
          if (n.type == 'friend_request' &&
              (n.data['requestId']?.toString() ?? '').isNotEmpty)
            _FriendRequestActions(
              requestId: n.data['requestId'].toString(),
              onDone: () =>
                  ref.read(notificationsProvider.notifier).markRead(n.id),
            ),
          const SizedBox(height: 4),
          Text(
            _timeAgo(n.createdAt),
            style: AppTypography.small.copyWith(color: AppColors.textTertiary),
          ),
        ],
      ),
      trailing: n.isRead
          ? null
          : Container(
              width: 9,
              height: 9,
              decoration: const BoxDecoration(
                color: AppColors.error,
                shape: BoxShape.circle,
              ),
            ),
    );

    // Прочитанные — приглушённые (55%).
    return Opacity(opacity: n.isRead ? 0.55 : 1.0, child: tile);
  }

  void _open(BuildContext context, WidgetRef ref, AppNotification n) {
    ref.read(notificationsProvider.notifier).markRead(n.id);

    final quoteId = n.data['quoteId']?.toString();
    switch (n.type) {
      case 'ai_ready':
        if (quoteId != null && quoteId.isNotEmpty) {
          context.push(Routes.analysis(quoteId));
        } else {
          context.push(Routes.diary);
        }
      case 'weekly_report':
        context.push(Routes.weeklyReport);
      // Тариф 2: напоминание о встрече — в клуб, там карточка с «Подключиться».
      case 'club_meeting':
        context.go(Routes.club);
      // K2: о покупке — экран книги / пейвол клуба (на Android — клуб).
      case 'purchase':
        _openPurchase(context, ref, n);
      default:
        // Остальные — просто помечаем прочитанными, остаёмся на экране.
        break;
    }
  }

  Future<void> _openPurchase(
    BuildContext context,
    WidgetRef ref,
    AppNotification n,
  ) async {
    final target = await resolvePurchaseTargetFromWidget(ref, n.data);
    if (!context.mounted) return;
    if (target.isTab) {
      context.go(target.location);
    } else {
      context.push(target.location);
    }
  }

  /// (иконка, цвет) по типу уведомления.
  (IconData, Color) _visual(String type) {
    switch (type) {
      case 'new_audio':
        return (Icons.headphones, AppColors.terracotta);
      case 'ai_ready':
        return (Icons.auto_awesome, AppColors.purple);
      case 'chat_reply':
        return (Icons.chat_bubble_outline, AppColors.success);
      case 'reminder':
        return (Icons.edit_outlined, AppColors.gold);
      case 'weekly_report':
        return (Icons.insights_outlined, AppColors.terracotta);
      case 'club_meeting':
        return (Icons.videocam_outlined, AppColors.terracotta);
      case 'purchase':
        return (Icons.local_offer_outlined, AppColors.terracotta);
      case 'friend_request':
        return (Icons.person_add_alt_1_outlined, AppColors.terracotta);
      case 'friend_accepted':
        return (Icons.people_outline, AppColors.success);
      default:
        return (Icons.notifications_none, AppColors.textSecondary);
    }
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'только что';
    if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
    if (diff.inHours < 24) return '${diff.inHours} ч назад';
    if (diff.inDays < 7) return '${diff.inDays} дн назад';
    final dd = dt.day.toString().padLeft(2, '0');
    final mm = dt.month.toString().padLeft(2, '0');
    return '$dd.$mm.${dt.year}';
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.notifications_none,
              size: 48,
              color: AppColors.textTertiary,
            ),
            const SizedBox(height: 12),
            Text(
              'Здесь появятся новости',
              style: AppTypography.bodyMedium.copyWith(
                color: AppColors.textSecondary,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.screenPadding),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Не удалось загрузить уведомления',
              style: AppTypography.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: onRetry,
              child: Text(
                'Повторить',
                style: AppTypography.bodyMedium.copyWith(
                  color: AppColors.terracotta,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Кнопки «Принять / Отклонить» у заявки в друзья (F3, 27.11.2026).
/// После ответа вместо кнопок — короткий итог.
class _FriendRequestActions extends ConsumerStatefulWidget {
  const _FriendRequestActions({required this.requestId, required this.onDone});
  final String requestId;
  final VoidCallback onDone;

  @override
  ConsumerState<_FriendRequestActions> createState() =>
      _FriendRequestActionsState();
}

class _FriendRequestActionsState extends ConsumerState<_FriendRequestActions> {
  bool _busy = false;
  String? _result;

  Future<void> _answer(bool accept) async {
    setState(() => _busy = true);
    try {
      final dio = ref.read(apiClientProvider).dio;
      await dio.post(accept
          ? ApiEndpoints.friendRequestAccept(widget.requestId)
          : ApiEndpoints.friendRequestDecline(widget.requestId));
      if (!mounted) return;
      setState(() {
        _busy = false;
        _result = accept ? 'Вы теперь друзья' : 'Заявка отклонена';
      });
      widget.onDone();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _result = 'Заявка уже неактуальна';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(
          _result!,
          style: AppTypography.small.copyWith(color: AppColors.textSecondary),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(
        children: [
          TextButton(
            onPressed: _busy ? null : () => _answer(true),
            child: Text(
              'Принять',
              style: AppTypography.bodyMedium
                  .copyWith(color: AppColors.terracotta),
            ),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: _busy ? null : () => _answer(false),
            child: Text(
              'Отклонить',
              style: AppTypography.bodyMedium
                  .copyWith(color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}
