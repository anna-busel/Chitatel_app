import 'weekly_report.dart';

/// Ежемесячный ИИ-отчёт (сервер: server/src/models/MonthlyReport.js, экран 4.26).
///
/// Показывается только текст insights (глубокое письмо Анны за месяц) +
/// рекомендации каталога по темам месяца. ReportStats и Recommendation —
/// общие с недельным отчётом (weekly_report.dart).
class MonthlyReportModel {
  const MonthlyReportModel({
    required this.id,
    required this.month,
    required this.year,
    required this.startDate,
    required this.endDate,
    required this.stats,
    this.insights = '',
    this.recommendations = const [],
  });

  final String id;
  final int month;
  final int year;
  final DateTime startDate;
  final DateTime endDate;
  final ReportStats stats;

  /// Глубокое письмо Анны — единственное, что показывается на экране.
  final String insights;

  final List<Recommendation> recommendations;

  factory MonthlyReportModel.fromJson(Map<String, dynamic> json) {
    final statsJson = json['stats'] as Map<String, dynamic>? ?? const {};

    return MonthlyReportModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      month: (json['month'] as num?)?.toInt() ?? 0,
      year: (json['year'] as num?)?.toInt() ?? 0,
      startDate:
          DateTime.tryParse((json['startDate'] ?? '').toString()) ?? DateTime.now(),
      endDate:
          DateTime.tryParse((json['endDate'] ?? '').toString()) ?? DateTime.now(),
      stats: ReportStats.fromJson(statsJson),
      insights: (json['insights'] ?? '').toString(),
      recommendations: Recommendation.listFromJson(json['recommendations']),
    );
  }
}
