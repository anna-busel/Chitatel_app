import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

/// Провайдер сервиса детальной страницы книги.
final bookServiceProvider = Provider<BookService>((ref) {
  return BookService(ref.read(apiClientProvider));
});

class BookService {
  BookService(this._api);
  final ApiClient _api;

  /// GET /api/books/:id — детальная информация о книге.
  /// MASTER 7.4. Возвращает BookModel с заполненными parts/purchaseUrl.
  Future<BookModel> fetchBook(String id) async {
    final response = await _api.dio.get(ApiEndpoints.bookById(id));
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final bookJson = data['book'] as Map<String, dynamic>? ?? const {};
    return BookModel.fromJson(bookJson);
  }
}
