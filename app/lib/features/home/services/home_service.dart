import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

/// Провайдер сервиса главной.
final homeServiceProvider = Provider<HomeService>((ref) {
  return HomeService(ref.read(apiClientProvider));
});

/// Данные главной страницы (GET /api/home).
class HomeData {
  const HomeData({
    this.clubBook,
    this.clubMonthLabel,
    this.dailyQuote,
    required this.freeBooks,
    required this.popularBooks,
    this.continueListening,
  });

  final BookModel? clubBook;
  final String? clubMonthLabel; // 'YYYY-MM'
  final DailyQuote? dailyQuote;
  final List<BookModel> freeBooks;
  final List<BookModel> popularBooks;

  /// Последний начатый разбор (13.07.2026). null — ничего не начато или гость;
  /// тогда блок «Продолжить слушать» на главной не показывается вовсе.
  final ContinueListening? continueListening;
}

/// «Продолжить слушать» — последний начатый разбор.
///
/// Заменил мёртвую карточку «Мой прогресс» (та всегда писала «Начните слушать
/// первый разбор» и вела в каталог). Статистика прослушивания живёт в профиле.
class ContinueListening {
  const ContinueListening({
    required this.book,
    required this.currentPartNumber,
    required this.positionSeconds,
    this.partTitle,
    this.partDuration,
  });

  final BookModel book;
  final int currentPartNumber;
  final int positionSeconds;

  /// Заголовок текущей части (может отсутствовать — тогда «Часть N»).
  final String? partTitle;

  /// Длительность текущей части в секундах (для полоски прогресса).
  final int? partDuration;

  /// Прогресс внутри части, 0..1. Если длительность неизвестна — 0.
  double get progress {
    final total = partDuration ?? 0;
    if (total <= 0) return 0;
    final p = positionSeconds / total;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  /// Сколько осталось до конца части («осталось 12 мин»). null если неизвестно.
  int? get minutesLeft {
    final total = partDuration ?? 0;
    if (total <= 0) return null;
    final left = total - positionSeconds;
    if (left <= 0) return 0;
    return (left / 60).ceil();
  }

  factory ContinueListening.fromJson(Map<String, dynamic> json) {
    return ContinueListening(
      book: BookModel.fromJson(json['book'] as Map<String, dynamic>),
      currentPartNumber: (json['currentPartNumber'] as num?)?.toInt() ?? 1,
      positionSeconds: (json['positionSeconds'] as num?)?.toInt() ?? 0,
      partTitle: json['partTitle'] as String?,
      partDuration: (json['partDuration'] as num?)?.toInt(),
    );
  }
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
    final continueJson = data['continueListening'] as Map<String, dynamic>?;

    return HomeData(
      clubBook: clubBookJson != null ? BookModel.fromJson(clubBookJson) : null,
      clubMonthLabel: clubMonth?['month'] as String?,
      dailyQuote: data['dailyQuote'] is Map<String, dynamic>
          ? DailyQuote.fromJson(data['dailyQuote'] as Map<String, dynamic>)
          : null,
      freeBooks: _parseBooks(data['freeBooks']),
      popularBooks: _parseBooks(data['popularBooks']),
      continueListening: continueJson != null
          ? ContinueListening.fromJson(continueJson)
          : null,
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
