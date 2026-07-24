/// Цитата дневника (сервер: server/src/models/Quote.js, MASTER 7.3).
///
/// aiStatus:
///   skipped — ИИ выключен, анализа не будет
///   pending — анализ считается (показываем «Анализируем…»)
///   ready   — анализ готов, лежит в aiAnalysis
///   failed  — не получилось («Анализ временно недоступен»)
class QuoteModel {
  const QuoteModel({
    required this.id,
    required this.text,
    required this.aiStatus,
    required this.createdAt,
    this.author,
    this.bookTitle,
    this.bookId,
    this.audioTimestamp,
    this.aiAnalysis,
  });

  final String id;
  final String text;
  final String? author;
  final String? bookTitle;
  final String? bookId;
  final int? audioTimestamp;
  final String aiStatus;
  final AiAnalysis? aiAnalysis;
  final DateTime createdAt;

  bool get hasAnalysis => aiStatus == 'ready' && aiAnalysis != null;
  bool get isAnalyzing => aiStatus == 'pending';
  bool get isFailed => aiStatus == 'failed';

  factory QuoteModel.fromJson(Map<String, dynamic> json) {
    final analysisJson = json['aiAnalysis'];
    return QuoteModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      text: (json['text'] ?? '').toString(),
      author: json['author'] as String?,
      bookTitle: json['bookTitle'] as String?,
      bookId: json['bookId']?.toString(),
      audioTimestamp: json['audioTimestamp'] is num
          ? (json['audioTimestamp'] as num).toInt()
          : null,
      aiStatus: (json['aiStatus'] ?? 'skipped').toString(),
      aiAnalysis: analysisJson is Map<String, dynamic>
          ? AiAnalysis.fromJson(analysisJson)
          : null,
      createdAt: DateTime.tryParse((json['createdAt'] ?? '').toString()) ??
          DateTime.now(),
    );
  }
}

/// Результат ИИ-разбора цитаты (экран 4.25). Формат промпта Анны:
///   category  — одна из 14 категорий
///   themes    — 1–3 короткие темы
///   sentiment — positive / neutral / negative
///   insights  — художественный разбор в тоне «личной колонки»
class AiAnalysis {
  const AiAnalysis({
    required this.category,
    required this.themes,
    required this.sentiment,
    required this.insights,
  });

  final String category;
  final List<String> themes;
  final String sentiment;
  final String insights;

  bool get isEmpty =>
      insights.trim().isEmpty && category.trim().isEmpty && themes.isEmpty;

  factory AiAnalysis.fromJson(Map<String, dynamic> json) {
    final themesJson = json['themes'];
    return AiAnalysis(
      category: (json['category'] ?? '').toString(),
      themes: themesJson is List
          ? themesJson
              .map((e) => e.toString())
              .where((e) => e.trim().isNotEmpty)
              .toList()
          : const [],
      sentiment: (json['sentiment'] ?? '').toString(),
      insights: (json['insights'] ?? '').toString(),
    );
  }
}
