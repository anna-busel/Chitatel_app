import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

/// Провайдер сервиса каталога.
final catalogServiceProvider = Provider<CatalogService>((ref) {
  return CatalogService(ref.read(apiClientProvider));
});

/// Параметры запроса каталога.
class CatalogQuery {
  const CatalogQuery({
    this.category,
    this.isFree,
  });

  final String? category;
  final bool? isFree;

  Map<String, dynamic> toQueryParams() {
    final params = <String, dynamic>{
      'limit': 50, // все 45 книг приходят за один запрос
    };
    if (category != null) params['category'] = category;
    if (isFree != null) params['isFree'] = isFree.toString();
    return params;
  }
}

/// Результат запроса каталога.
class CatalogResult {
  const CatalogResult({
    required this.books,
    required this.total,
  });

  final List<BookModel> books;
  final int total;
}

class CatalogService {
  CatalogService(this._api);
  final ApiClient _api;

  /// GET /api/books — список книг с фильтрами.
  Future<CatalogResult> fetchBooks(CatalogQuery query) async {
    final response = await _api.dio.get(
      ApiEndpoints.books,
      queryParameters: query.toQueryParams(),
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};

    final items = data['items'] as List<dynamic>? ?? const [];
    final books = items
        .whereType<Map<String, dynamic>>()
        .map(BookModel.fromJson)
        .toList(growable: false);

    final total = (data['total'] as num?)?.toInt() ?? books.length;

    return CatalogResult(books: books, total: total);
  }
}
