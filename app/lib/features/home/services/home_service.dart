import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

/// Провайдер сервиса главной.
final homeServiceProvider = Provider<HomeService>((ref) {
  return HomeService(ref.read(apiClientProvider));
});

/// Данные главной страницы (MASTER 7.4: GET /api/home).
class HomeData {
  const HomeData({
    this.clubBook,
    this.clubMonthLabel,
    this.dailyQuote,
    required this.freeBooks,
    required this.popularBooks,
  });

  final BookModel? clubBook;
  final String? clubMonthLabel; // 'YYYY-MM'
  final DailyQuote? dailyQuote;
  final List<BookModel> freeBooks;
  final List<BookModel> popularBooks;
}

class DailyQuote {
  const DailyQuote({
    required this.text,
    required this.author,
    required this.bookTitle,
  });

  final String text;
  final String author;
  final String bookTitle;

  factory DailyQuote.fromJson(Map<String, dynamic> json) {
    return DailyQuote(
      text: json['text'] as String? ?? '',
      author: json['author'] as String? ?? '',
      bookTitle: json['bookTitle'] as String? ?? '',
    );
  }
}

class HomeService {
  HomeService(this._api);
  final ApiClient _api;

  Future<HomeData> fetchHome() async {
    final response = await _api.dio.get(ApiEndpoints.home);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};

    final clubMonth = data['clubMonth'] as Map<String, dynamic>?;
    final clubBookJson = clubMonth?['book'] as Map<String, dynamic>?;

    return HomeData(
      clubBook: clubBookJson != null ? BookModel.fromJson(clubBookJson) : null,
      clubMonthLabel: clubMonth?['month'] as String?,
      dailyQuote: data['dailyQuote'] is Map<String, dynamic>
          ? DailyQuote.fromJson(data['dailyQuote'] as Map<String, dynamic>)
          : null,
      freeBooks: _parseBooks(data['freeBooks']),
      popularBooks: _parseBooks(data['popularBooks']),
    );
  }

  List<BookModel> _parseBooks(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(BookModel.fromJson)
        .toList(growable: false);
  }
}
