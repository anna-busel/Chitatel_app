/// Краткие карточки отчётов для архива/переключателя (экран 4.26).
///
/// Полный текст отчёта сюда НЕ тянем — список нужен только чтобы показать все
/// доступные периоды; сам отчёт грузится при выборе конкретной недели/месяца.

class WeeklyReportSummary {
  const WeeklyReportSummary({
    required this.weekNumber,
    required this.year,
    required this.startDate,
    required this.endDate,
    required this.quotesCount,
  });

  final int weekNumber;
  final int year;
  final DateTime startDate;
  final DateTime endDate;
  final int quotesCount;

  factory WeeklyReportSummary.fromJson(Map<String, dynamic> j) {
    final stats = j['stats'];
    final statsMap = stats is Map<String, dynamic> ? stats : const {};
    return WeeklyReportSummary(
      weekNumber: (j['weekNumber'] as num?)?.toInt() ?? 0,
      year: (j['year'] as num?)?.toInt() ?? 0,
      startDate:
          DateTime.tryParse(j['startDate']?.toString() ?? '') ?? DateTime(2000),
      endDate:
          DateTime.tryParse(j['endDate']?.toString() ?? '') ?? DateTime(2000),
      quotesCount: (statsMap['quotesCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class MonthlyReportSummary {
  const MonthlyReportSummary({
    required this.month,
    required this.year,
    required this.startDate,
    required this.endDate,
    required this.quotesCount,
  });

  final int month;
  final int year;
  final DateTime startDate;
  final DateTime endDate;
  final int quotesCount;

  factory MonthlyReportSummary.fromJson(Map<String, dynamic> j) {
    final stats = j['stats'];
    final statsMap = stats is Map<String, dynamic> ? stats : const {};
    return MonthlyReportSummary(
      month: (j['month'] as num?)?.toInt() ?? 0,
      year: (j['year'] as num?)?.toInt() ?? 0,
      startDate:
          DateTime.tryParse(j['startDate']?.toString() ?? '') ?? DateTime(2000),
      endDate:
          DateTime.tryParse(j['endDate']?.toString() ?? '') ?? DateTime(2000),
      quotesCount: (statsMap['quotesCount'] as num?)?.toInt() ?? 0,
    );
  }
}
