import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/book_model.dart';
import '../services/catalog_service.dart';

/// Активный фильтр каталога. Один из трёх режимов одновременно.
sealed class CatalogFilter {
  const CatalogFilter();
}

/// Все книги (без фильтра).
class AllBooksFilter extends CatalogFilter {
  const AllBooksFilter();
}

/// Только бесплатные.
class FreeOnlyFilter extends CatalogFilter {
  const FreeOnlyFilter();
}

/// Конкретная категория («КРИЗИСЫ», «ЛЮБОВЬ» и т.д.).
class CategoryFilter extends CatalogFilter {
  const CategoryFilter(this.category);
  final String category;
}

/// Состояние каталога.
class CatalogState {
  const CatalogState({
    required this.filter,
    required this.books,
    required this.isLoading,
    this.error,
  });

  final CatalogFilter filter;
  final List<BookModel> books;
  final bool isLoading;
  final String? error;

  CatalogState copyWith({
    CatalogFilter? filter,
    List<BookModel>? books,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return CatalogState(
      filter: filter ?? this.filter,
      books: books ?? this.books,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }

  static const initial = CatalogState(
    filter: AllBooksFilter(),
    books: [],
    isLoading: true,
  );
}

/// StateNotifier каталога — управляет фильтром и загрузкой.
class CatalogNotifier extends StateNotifier<CatalogState> {
  CatalogNotifier(this._service) : super(CatalogState.initial) {
    load();
  }

  final CatalogService _service;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final query = _buildQuery(state.filter);
      final result = await _service.fetchBooks(query);
      state = state.copyWith(
        books: result.books,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Не удалось загрузить каталог',
      );
    }
  }

  void setFilter(CatalogFilter filter) {
    if (_isSameFilter(state.filter, filter)) return;
    state = state.copyWith(filter: filter);
    load();
  }

  CatalogQuery _buildQuery(CatalogFilter filter) {
    return switch (filter) {
      AllBooksFilter() => const CatalogQuery(),
      FreeOnlyFilter() => const CatalogQuery(isFree: true),
      CategoryFilter(category: final c) => CatalogQuery(category: c),
    };
  }

  bool _isSameFilter(CatalogFilter a, CatalogFilter b) {
    if (a is AllBooksFilter && b is AllBooksFilter) return true;
    if (a is FreeOnlyFilter && b is FreeOnlyFilter) return true;
    if (a is CategoryFilter && b is CategoryFilter) {
      return a.category == b.category;
    }
    return false;
  }
}

/// Provider состояния каталога.
final catalogProvider =
    StateNotifierProvider<CatalogNotifier, CatalogState>((ref) {
  return CatalogNotifier(ref.read(catalogServiceProvider));
});
