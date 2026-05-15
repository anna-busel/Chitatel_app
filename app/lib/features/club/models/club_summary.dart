/// Лёгкая модель клуба для переключателя — только то что нужно нарисовать
/// одну строку dropdown'а. Полную модель ClubMonth подгружаем отдельно
/// когда юзер выбирает конкретный клуб.
///
/// Источник: GET /api/club/list (server/src/routes/club.js).
/// Поле `relation` приходит с бэка с тремя возможными значениями:
/// 'archive' / 'current' / 'future'.
class ClubSummary {
  const ClubSummary({
    required this.id,
    required this.month,
    required this.year,
    required this.title,
    required this.author,
    required this.startsAt,
    required this.endsAt,
    required this.archiveUntilDate,
    required this.relation,
    required this.participantCount,
    required this.messageCount,
  });

  final String id;
  final int month;
  final int year;
  final String title;
  final String author;
  final DateTime startsAt;
  final DateTime endsAt;
  final DateTime archiveUntilDate;
  final ClubRelation relation;
  final int participantCount;
  final int messageCount;

  factory ClubSummary.fromJson(Map<String, dynamic> json) {
    return ClubSummary(
      id: (json['_id'] ?? json['id']).toString(),
      month: (json['month'] as num?)?.toInt() ?? 0,
      year: (json['year'] as num?)?.toInt() ?? 0,
      title: json['title']?.toString() ?? '',
      author: json['author']?.toString() ?? '',
      startsAt: DateTime.tryParse(json['startsAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      endsAt: DateTime.tryParse(json['endsAt']?.toString() ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      archiveUntilDate:
          DateTime.tryParse(json['archiveUntilDate']?.toString() ?? '') ??
              DateTime.fromMillisecondsSinceEpoch(0),
      relation: ClubRelation.fromString(json['relation']?.toString()),
      participantCount: (json['participantCount'] as num?)?.toInt() ?? 0,
      messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Относительная позиция клуба к текущему моменту.
enum ClubRelation {
  archive,
  current,
  future,
  unknown;

  static ClubRelation fromString(String? s) {
    switch (s) {
      case 'archive':
        return ClubRelation.archive;
      case 'current':
        return ClubRelation.current;
      case 'future':
        return ClubRelation.future;
      default:
        return ClubRelation.unknown;
    }
  }
}
