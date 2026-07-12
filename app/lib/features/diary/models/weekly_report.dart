import 'quote.dart';

/// Еженедельный ИИ-отчёт (сервер: server/src/models/WeeklyReport.js, экран 4.26).
class WeeklyReportModel {
  const WeeklyReportModel({
    required this.id,
    required this.weekNumber,
    required this.year,
    required this.startDate,
    required this.endDate,
    required this.stats,
    required this.quotes,
    this.weekTheme = '',
    this.insight = '',
    this.recommendation,
  });

  final String id;
  final int weekNumber;
  final int year;
  final DateTime startDate;
  final DateTime endDate;
  final ReportStats stats;

  /// Главная тема недели (обобщение ИИ)
  final String weekTheme;

  /// Наблюдение — что может занимать читателя сейчас
  final String insight;

  /// Рекомендованный разбор. null — если ИИ не подобрал книгу из каталога:
  /// в этом случае блок рекомендации на экране не показывается.
  final Recommendation? recommendation;

  final List<QuoteModel> quotes;

  factory WeeklyReportModel.fromJson(Map<String, dynamic> json) {
    final summary = json['aiSummary'] as Map<String, dynamic>? ?? const {};
    final recJson = summary['recommendation'];
    final statsJson = json['stats'] as Map<String, dynamic>? ?? const {};
    final quotesJson = json['quotes'] as List<dynamic>? ?? const [];

    final recommendation = recJson is Map<String, dynamic>
        ? Recommendation.fromJson(recJson)
        : null;

    return WeeklyReportModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      weekNumber: (json['weekNumber'] as num?)?.toInt() ?? 0,
      year: (json['year'] as num?)?.toInt() ?? 0,
      startDate:
          DateTime.tryParse((json['startDate'] ?? '').toString()) ?? DateTime.now(),
      endDate:
          DateTime.tryParse((json['endDate'] ?? '').toString()) ?? DateTime.now(),
      stats: ReportStats.fromJson(statsJson),
      weekTheme: (summary['weekTheme'] ?? '').toString(),
      insight: (summary['insight'] ?? '').toString(),
      // Рекомендация показывается только если есть реальная книга в каталоге.
      recommendation:
          (recommendation != null && recommendation.isUsable) ? recommendation : null,
      quotes: quotesJson
          .whereType<Map<String, dynamic>>()
          .map(QuoteModel.fromJson)
          .toList(),
    );
  }
}

/// Статистика недели.
class ReportStats {
  const ReportStats({
    this.minutesListened = 0,
    this.quotesCount = 0,
    this.analysesCount = 0,
  });

  /// ⚠️ Пока всегда 0: недельная статистика прослушивания появится в задаче 6.2
  /// (GET /api/progress/stats). Экран это учитывает и минуты не показывает.
  final int minutesListened;
  final int quotesCount;
  final int analysesCount;

  factory ReportStats.fromJson(Map<String, dynamic> json) {
    return ReportStats(
      minutesListened: (json['minutesListened'] as num?)?.toInt() ?? 0,
      quotesCount: (json['quotesCount'] as num?)?.toInt() ?? 0,
      analysesCount: (json['analysesCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Рекомендованный разбор из нашего каталога.
/// bookId проставляет сервер — по нему открывается экран книги
/// (там уже «Слушать» / «Купить» / «Продолжить»).
class Recommendation {
  const Recommendation({
    required this.title,
    required this.author,
    required this.why,
    required this.bookId,
  });

  final String title;
  final String author;
  final String why;
  final String? bookId;

  /// Показываем блок только если есть и название, и ссылка на реальную книгу.
  bool get isUsable => title.trim().isNotEmpty && (bookId?.isNotEmpty ?? false);

  factory Recommendation.fromJson(Map<String, dynamic> json) {
    return Recommendation(
      title: (json['title'] ?? '').toString(),
      author: (json['author'] ?? '').toString(),
      why: (json['why'] ?? '').toString(),
      bookId: json['bookId']?.toString(),
    );
  }
}
