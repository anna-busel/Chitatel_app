/// Уведомление ленты (MASTER 4.30).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.data,
    required this.isRead,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final bool isRead;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    return AppNotification(
      id: (j['_id'] ?? j['id'] ?? '').toString(),
      type: (j['type'] ?? 'system').toString(),
      title: (j['title'] ?? '').toString(),
      body: (j['body'] ?? '').toString(),
      data: (j['data'] is Map)
          ? (j['data'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : <String, dynamic>{},
      isRead: j['isRead'] == true,
      createdAt:
          DateTime.tryParse((j['createdAt'] ?? '').toString())?.toLocal() ??
              DateTime.now(),
    );
  }

  AppNotification copyWith({bool? isRead}) {
    return AppNotification(
      id: id,
      type: type,
      title: title,
      body: body,
      data: data,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt,
    );
  }
}
