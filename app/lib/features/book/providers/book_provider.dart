import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/book_model.dart';
import '../services/book_service.dart';

/// Асинхронный провайдер одной книги по её id.
///
/// Использование в UI:
///   final bookAsync = ref.watch(bookProvider(bookId));
///   bookAsync.when(data: ..., loading: ..., error: ...);
///
/// Обновление (pull-to-refresh):
///   ref.invalidate(bookProvider(bookId));
final bookProvider =
    FutureProvider.family<BookModel, String>((ref, id) async {
  final service = ref.read(bookServiceProvider);
  return service.fetchBook(id);
});
