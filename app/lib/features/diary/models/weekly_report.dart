import 'quote.dart';

/// Еженедельный ИИ-отчёт (сервер: server/src/models/WeeklyReport.js, экран 4.26).
///
/// Показывается только текст insights (личное письмо Анны). dominantThemes и
/// статистика — служебные. recommendations — книги каталога, подобранные по темам
/// (карточка с обложкой, тап → экран разбора).
class WeeklyReportModel {
  const WeeklyReportModel({
    required this.id,
    required this.weekNumber,
    required this.year,
    required this.startDate,
    required this.endDate,
    required this.stats,
    required this.quotes,
    this.insights = '',
    this.dominantThemes = const [],
    this.recommendations = const [],
  });

  final String id;
  final int weekNumber;
  final int year;
  final DateTime startDate;
  final DateTime endDate;
  final ReportStats stats;

  /// Личное письмо Анны — единственное, что показывается на экране.
  final String insights;

  final List<String> dominantThemes;

  /// Рекомендованные разборы из каталога (только с реальным bookId).
  final List<Recommendation> recommendations;

  final List<QuoteModel> quotes;

  factory WeeklyReportModel.fromJson(Map<String, dynamic> json) {
    final statsJson = json['stats'] as Map<String, dynamic>? ?? const {};
    final quotesJson = json['quotes'] as List<dynamic>? ?? const [];
    final themesJson = json['dominantThemes'] as List<dynamic>? ?? const [];

    return WeeklyReportModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      weekNumber: (json['weekNumber'] as num?)?.toInt() ?? 0,
      year: (json['year'] as num?)?.toInt() ?? 0,
      startDate:
          DateTime.tryParse((json['startDate'] ?? '').toString()) ?? DateTime.now(),
      endDate:
          DateTime.tryParse((json['endDate'] ?? '').toString()) ?? DateTime.now(),
      stats: ReportStats.fromJson(statsJson),
      insights: (json['insights'] ?? '').toString(),
      dominantThemes: themesJson
          .map((e) => e.toString())
          .where((e) => e.trim().isNotEmpty)
          .toList(),
      recommendations: Recommendation.listFromJson(json['recommendations']),
      quotes: quotesJson
          .whereType<Map<String, dynamic>>()
          .map(QuoteModel.fromJson)
          .toList(),
    );
  }
}

/// Статистика отчёта. weeksActive используется только в месячном отчёте.
class ReportStats {
  const ReportStats({
    this.quotesCount = 0,
    this.uniqueAuthors = 0,
    this.activeDays = 0,
    this.weeksActive = 0,
  });

  final int quotesCount;
  final int uniqueAuthors;
  final int activeDays;
  final int weeksActive;

  factory ReportStats.fromJson(Map<String, dynamic> json) {
    return ReportStats(
      quotesCount: (json['quotesCount'] as num?)?.toInt() ?? 0,
      uniqueAuthors: (json['uniqueAuthors'] as num?)?.toInt() ?? 0,
      activeDays: (json['activeDays'] as num?)?.toInt() ?? 0,
      weeksActive: (json['weeksActive'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Рекомендованный разбор из каталога. bookId проставляет сервер — по нему
/// открывается экран книги (там уже «Слушать» / «Купить» / «Продолжить»).
class Recommendation {
  const Recommendation({
    required this.bookId,
    required this.title,
    required this.author,
    required this.coverImageUrl,
    required this.why,
  });

  final String? bookId;
  final String title;
  final String author;
  final String coverImageUrl;
  final String why;

  /// Показываем карточку только если есть название и ссылка на реальную книгу.
  bool get isUsable => title.trim().isNotEmpty && (bookId?.isNotEmpty ?? false);

  factory Recommendation.fromJson(Map<String, dynamic> json) {
    return Recommendation(
      bookId: json['bookId']?.toString(),
      title: (json['title'] ?? '').toString(),
      author: (json['author'] ?? '').toString(),
      coverImageUrl: (json['coverImageUrl'] ?? '').toString(),
      why: (json['why'] ?? '').toString(),
    );
  }

  /// Разбор массива рекомендаций из ответа сервера (с отсевом нерабочих).
  static List<Recommendation> listFromJson(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(Recommendation.fromJson)
        .where((r) => r.isUsable)
        .toList();
  }
}
