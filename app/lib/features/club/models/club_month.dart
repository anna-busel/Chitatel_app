/// Клуб месяца. Соответствует server/src/models/ClubMonth.js.
///
/// Один документ на месяц. Каждое 1-е число стартует новый клуб,
/// предыдущий уходит в архив на 21 день (archiveUntilDate).
class ClubMonth {
  const ClubMonth({
    required this.id,
    required this.month,
    required this.year,
    required this.bookId,
    required this.title,
    required this.author,
    required this.startsAt,
    required this.endsAt,
    required this.archiveUntilDate,
    required this.isActive,
    required this.participantCount,
    required this.messageCount,
    this.partSchedule = const [],
    this.pinnedMessageId,
  });

  /// MongoDB ObjectId как строка.
  final String id;

  /// Месяц (1..12) и год.
  final int month;
  final int year;

  /// Ссылка на Book — детали через `Book` модель в response /api/club/current.
  final String bookId;

  /// Денормализованные поля из Book (для скорости — сервер кладёт их сюда при создании).
  final String title;
  final String author;

  /// Период действия клуба.
  final DateTime startsAt;
  final DateTime endsAt;

  /// Дата окончания архивного доступа = endsAt + 21 день.
  /// Используется чтобы решить: показывать ли клуб юзеру с истёкшей подпиской.
  final DateTime archiveUntilDate;

  /// Cron-флаг активного клуба. true когда startsAt <= now < endsAt.
  final bool isActive;

  /// Статистика (обновляется сервером триггерами).
  final int participantCount;
  final int messageCount;

  /// Расписание открытия частей. Пустой массив — все части доступны со старта.
  final List<PartSchedule> partSchedule;

  /// ID закреплённого сообщения (1 на клуб, только Анна закрепляет).
  final String? pinnedMessageId;

  factory ClubMonth.fromJson(Map<String, dynamic> json) {
    final scheduleRaw = json['partSchedule'];
    final schedule = scheduleRaw is List
        ? scheduleRaw
            .map((e) => PartSchedule.fromJson(e as Map<String, dynamic>))
            .toList(growable: false)
        : const <PartSchedule>[];

    return ClubMonth(
      id: (json['_id'] ?? '').toString(),
      month: (json['month'] as num?)?.toInt() ?? 1,
      year: (json['year'] as num?)?.toInt() ?? 2026,
      bookId: (json['bookId'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      author: (json['author'] ?? '').toString(),
      startsAt: _parseDate(json['startsAt']) ?? DateTime.now(),
      endsAt: _parseDate(json['endsAt']) ?? DateTime.now(),
      archiveUntilDate: _parseDate(json['archiveUntilDate']) ?? DateTime.now(),
      isActive: json['isActive'] == true,
      participantCount: (json['participantCount'] as num?)?.toInt() ?? 0,
      messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
      partSchedule: schedule,
      pinnedMessageId: json['pinnedMessageId']?.toString(),
    );
  }

  /// Есть ли закреплённое сообщение в этом клубе.
  bool get hasPinnedMessage =>
      pinnedMessageId != null && pinnedMessageId!.isNotEmpty;

  /// Клуб полностью закрыт (даже архив).
  bool isArchiveClosed(DateTime now) => now.isAfter(archiveUntilDate);

  /// Клуб ещё не начался (будущий).
  bool isFuture(DateTime now) => now.isBefore(startsAt);
}

/// Расписание открытия одной части (используется в табе «Разборы»).
class PartSchedule {
  const PartSchedule({required this.partNumber, required this.opensAt});

  final int partNumber;
  final DateTime opensAt;

  factory PartSchedule.fromJson(Map<String, dynamic> json) {
    return PartSchedule(
      partNumber: (json['partNumber'] as num?)?.toInt() ?? 1,
      opensAt: _parseDate(json['opensAt']) ?? DateTime.now(),
    );
  }
}

DateTime? _parseDate(dynamic raw) {
  if (raw is String && raw.isNotEmpty) return DateTime.tryParse(raw);
  return null;
}
