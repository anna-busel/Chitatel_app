import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

/// Провайдер сервиса поиска книг.
final searchServiceProvider = Provider<SearchService>((ref) {
  return SearchService(ref.read(apiClientProvider));
});

/// Сервис поиска книг.
///
/// Использует MongoDB text index на полях `title`, `author`, `description`
/// (см. `server/src/models/Book.js`). Запрос: `GET /api/books/search?q=...`.
class SearchService {
  SearchService(this._api);
  final ApiClient _api;

  /// GET /api/books/search?q=... — поиск книг.
  /// Пустой запрос → пустой результат (бэкенд возвращает [] для пустой строки).
  /// Лимит на стороне сервера: 20 результатов.
  Future<List<BookModel>> search(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return const [];

    final response = await _api.dio.get(
      ApiEndpoints.booksSearch,
      queryParameters: {'q': trimmed},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final items = data['books'] as List<dynamic>? ?? const [];

    return items
        .whereType<Map<String, dynamic>>()
        .map(BookModel.fromJson)
        .toList(growable: false);
  }
}
