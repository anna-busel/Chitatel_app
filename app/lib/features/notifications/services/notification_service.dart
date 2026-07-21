import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../models/app_notification.dart';

/// Лента + число непрочитанных (ответ GET /api/notifications).
class NotificationsData {
  const NotificationsData({required this.items, required this.unreadCount});
  final List<AppNotification> items;
  final int unreadCount;
}

final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService(ref.read(apiClientProvider));
});

/// Обращения к /api/notifications. Base URL и JWT — на ApiClient (сам ставит
/// Authorization и рефрешит токен). Сервер оборачивает ответ в { success, data }.
class NotificationService {
  NotificationService(this._api);
  final ApiClient _api;

  Future<NotificationsData> fetch({int page = 1, int limit = 30}) async {
    final res = await _api.dio.get(
      '/notifications',
      queryParameters: {'page': page, 'limit': limit},
    );
    final data = (res.data['data'] as Map).cast<String, dynamic>();
    final items = (data['notifications'] as List? ?? const [])
        .map((e) => AppNotification.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
    final unread = (data['unreadCount'] as num?)?.toInt() ?? 0;
    return NotificationsData(items: items, unreadCount: unread);
  }

  Future<void> markRead(String id) async {
    await _api.dio.patch('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _api.dio.patch('/notifications/read-all');
  }
}
