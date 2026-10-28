/// Живая встреча с Анной в Zoom — Тариф 2 (UPDATES-PLAN M, 28.10.2026).
///
/// Приходит в GET /api/club/current и /api/club/:id полем `meetings`:
/// массив — у участницы Тариф 2 на этот клуб (сервер уже проверил доступ),
/// null — Тарифа 2 нет, карточку встречи не показываем.
class ClubMeeting {
  const ClubMeeting({
    required this.id,
    required this.title,
    required this.startsAt,
    required this.zoomUrl,
  });

  final String id;
  final String title;
  final DateTime startsAt;
  final String zoomUrl;

  /// Сколько после начала карточка ещё висит с кнопкой «Подключиться»
  /// (опоздавшие тоже должны войти).
  static const Duration joinWindowAfterStart = Duration(hours: 2);

  static ClubMeeting? tryParse(Object? raw) {
    if (raw is! Map<String, dynamic>) return null;
    final startsAt = DateTime.tryParse(raw['startsAt']?.toString() ?? '');
    final url = raw['zoomUrl']?.toString() ?? '';
    if (startsAt == null || url.isEmpty) return null;
    final title = raw['title']?.toString() ?? '';
    return ClubMeeting(
      id: raw['id']?.toString() ?? '',
      title: title.isEmpty ? 'Встреча с Анной' : title,
      startsAt: startsAt.toLocal(),
      zoomUrl: url,
    );
  }

  /// null → Тарифа 2 нет; [] → Тариф 2 есть, встреч пока не назначено.
  static List<ClubMeeting>? listFromJson(Object? raw) {
    if (raw is! List) return null;
    return raw.map(tryParse).whereType<ClubMeeting>().toList()
      ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
  }

  /// Ближайшая встреча, к которой ещё можно подключиться (не закончилась
  /// окном [joinWindowAfterStart]). null — таких нет.
  static ClubMeeting? nextOf(List<ClubMeeting> meetings, DateTime now) {
    for (final m in meetings) {
      if (now.isBefore(m.startsAt.add(joinWindowAfterStart))) return m;
    }
    return null;
  }
}
