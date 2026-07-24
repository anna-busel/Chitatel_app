import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../models/quote.dart';
import '../models/weekly_report.dart';
import '../models/monthly_report.dart';

/// Провайдер сервиса дневника.
final diaryServiceProvider = Provider<DiaryService>((ref) {
  return DiaryService(ref.read(apiClientProvider));
});

/// HTTP-вызовы дневника (MASTER 7.4, сервер: routes/quotes.js, routes/reports.js).
class DiaryService {
  DiaryService(this._api);
  final ApiClient _api;

  /// GET /api/quotes — лента цитат (новые сверху).
  Future<List<QuoteModel>> fetchQuotes({
    int page = 1,
    int limit = 50,
    String? bookId,
  }) async {
    final response = await _api.dio.get(
      ApiEndpoints.quotes,
      queryParameters: {
        'page': page,
        'limit': limit,
        if (bookId != null) 'bookId': bookId,
      },
    );

    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final items = data['items'] as List<dynamic>? ?? const [];

    return items
        .whereType<Map<String, dynamic>>()
        .map(QuoteModel.fromJson)
        .toList();
  }

  /// GET /api/quotes/:id — одна цитата с разбором.
  Future<QuoteModel> fetchQuote(String id) async {
    final response = await _api.dio.get(ApiEndpoints.quoteById(id));
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final json = data['quote'] as Map<String, dynamic>? ?? const {};
    return QuoteModel.fromJson(json);
  }

  /// POST /api/quotes — сохранить цитату (шторка 4.17).
  Future<QuoteModel> createQuote({
    required String text,
    String? author,
    String? bookTitle,
    String? bookId,
    int? audioTimestamp,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.quotes,
      data: {
        'text': text,
        if (author != null && author.isNotEmpty) 'author': author,
        if (bookTitle != null && bookTitle.isNotEmpty) 'bookTitle': bookTitle,
        if (bookId != null && bookId.isNotEmpty) 'bookId': bookId,
        if (audioTimestamp != null) 'audioTimestamp': audioTimestamp,
      },
    );

    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final json = data['quote'] as Map<String, dynamic>? ?? const {};
    return QuoteModel.fromJson(json);
  }

  /// DELETE /api/quotes/:id — удалить свою цитату.
  Future<void> deleteQuote(String id) async {
    await _api.dio.delete(ApiEndpoints.quoteById(id));
  }

  /// GET /api/reports/weekly/latest — последний недельный отчёт (или null).
  Future<WeeklyReportModel?> fetchLatestReport() async {
    final response = await _api.dio.get(ApiEndpoints.reportsWeeklyLatest);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final json = data['report'];
    if (json is! Map<String, dynamic>) {
      return null;
    }
    return WeeklyReportModel.fromJson(json);
  }

  /// GET /api/reports/monthly/latest — последний месячный отчёт (или null).
  Future<MonthlyReportModel?> fetchLatestMonthlyReport() async {
    final response = await _api.dio.get(ApiEndpoints.reportsMonthlyLatest);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final json = data['report'];
    if (json is! Map<String, dynamic>) {
      return null;
    }
    return MonthlyReportModel.fromJson(json);
  }

  /// PATCH /api/profile/ai-consent — включить/выключить ИИ-анализ (4.7 / 4.42).
  Future<void> setAiConsent(bool consent) async {
    await _api.dio.patch(
      ApiEndpoints.profileAiConsent,
      data: {'consent': consent},
    );
  }
}
