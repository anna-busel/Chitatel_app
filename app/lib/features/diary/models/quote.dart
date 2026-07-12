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

/// Результат ИИ-разбора цитаты (экран 4.25).
class AiAnalysis {
  const AiAnalysis({
    required this.resonance,
    required this.context,
    required this.question,
  });

  /// Почему цитата откликнулась («Что эта цитата говорит о вас»)
  final String resonance;

  /// Связь с идеями книги («Паттерн»)
  final String context;

  /// Вопрос для размышления
  final String question;

  bool get isEmpty =>
      resonance.trim().isEmpty &&
      context.trim().isEmpty &&
      question.trim().isEmpty;

  factory AiAnalysis.fromJson(Map<String, dynamic> json) {
    return AiAnalysis(
      resonance: (json['resonance'] ?? '').toString(),
      context: (json['context'] ?? '').toString(),
      question: (json['question'] ?? '').toString(),
    );
  }
}
