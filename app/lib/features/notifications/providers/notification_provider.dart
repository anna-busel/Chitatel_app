import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/notification_service.dart';

/// Лента уведомлений (4.30).
///
/// autoDispose: провайдер живёт, пока его кто-то слушает (колокольчик на
/// главной / экран ленты). Колокольчик читает его ТОЛЬКО для авторизованных —
/// поэтому при выходе провайдер сам уничтожается, а при следующем входе
/// создаётся заново и грузит данные текущего юзера (не течёт между аккаунтами).
final notificationsProvider = StateNotifierProvider.autoDispose<
    NotificationsNotifier, AsyncValue<NotificationsData>>((ref) {
  return NotificationsNotifier(ref.read(notificationServiceProvider));
});

class NotificationsNotifier
    extends StateNotifier<AsyncValue<NotificationsData>> {
  NotificationsNotifier(this._service)
      : super(const AsyncValue.loading()) {
    load();
  }

  final NotificationService _service;

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final data = await _service.fetch();
      if (mounted) state = AsyncValue.data(data);
    } catch (e, st) {
      if (mounted) state = AsyncValue.error(e, st);
    }
  }

  Future<void> markRead(String id) async {
    final current = state.value;
    if (current == null) return;
    final items = current.items
        .map((n) => n.id == id ? n.copyWith(isRead: true) : n)
        .toList();
    final unread = items.where((n) => !n.isRead).length;
    state = AsyncValue.data(
      NotificationsData(items: items, unreadCount: unread),
    );
    try {
      await _service.markRead(id);
    } catch (_) {
      // Не критично — локально уже помечено.
    }
  }

  Future<void> markAllRead() async {
    final current = state.value;
    if (current == null) return;
    final items = current.items.map((n) => n.copyWith(isRead: true)).toList();
    state = AsyncValue.data(
      NotificationsData(items: items, unreadCount: 0),
    );
    try {
      await _service.markAllRead();
    } catch (_) {
      // Не критично.
    }
  }
}
