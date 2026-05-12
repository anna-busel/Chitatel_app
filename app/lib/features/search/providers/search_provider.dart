import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../shared/models/book_model.dart';
import '../services/search_service.dart';

/// Состояние поиска.
///
/// `phase` отвечает за то что показывает экран:
/// - `SearchPhase.idle` — пустое поле, показываем подсказку.
/// - `SearchPhase.typing` — юзер печатает, идёт debounce. Покажем shimmer.
/// - `SearchPhase.loading` — запрос отправлен на сервер. Покажем shimmer.
/// - `SearchPhase.success` — есть результаты в `books` (может быть пустой).
/// - `SearchPhase.error` — сетевая ошибка, `errorMessage` заполнен.
enum SearchPhase { idle, typing, loading, success, error }

class SearchState {
  const SearchState({
    this.query = '',
    this.phase = SearchPhase.idle,
    this.books = const [],
    this.errorMessage,
  });

  final String query;
  final SearchPhase phase;
  final List<BookModel> books;
  final String? errorMessage;

  SearchState copyWith({
    String? query,
    SearchPhase? phase,
    List<BookModel>? books,
    String? errorMessage,
    bool clearError = false,
  }) {
    return SearchState(
      query: query ?? this.query,
      phase: phase ?? this.phase,
      books: books ?? this.books,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

/// Provider состояния экрана поиска.
final searchProvider =
    StateNotifierProvider.autoDispose<SearchNotifier, SearchState>((ref) {
  final service = ref.read(searchServiceProvider);
  return SearchNotifier(service);
});

/// Notifier с debounce 300ms между нажатиями клавиш и запросом на сервер.
class SearchNotifier extends StateNotifier<SearchState> {
  SearchNotifier(this._service) : super(const SearchState());

  final SearchService _service;
  Timer? _debounceTimer;

  /// 300ms — стандартный debounce для поиска по STEP-BY-STEP задача 2.5.
  static const Duration _debounceDuration = Duration(milliseconds: 300);

  /// Вызывается на каждое изменение текста в поле поиска.
  void updateQuery(String query) {
    final trimmed = query.trim();

    // Пустой запрос → возвращаемся в idle. Отменяем pending debounce.
    if (trimmed.isEmpty) {
      _debounceTimer?.cancel();
      state = const SearchState();
      return;
    }

    // Запоминаем что юзер печатает (visual feedback: shimmer).
    state = state.copyWith(
      query: query,
      phase: SearchPhase.typing,
      clearError: true,
    );

    // Сбрасываем таймер при каждом нажатии — отправляем запрос только когда
    // юзер 300ms ничего не печатает.
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounceDuration, () => _runSearch(trimmed));
  }

  /// Очистить поиск (крестик в поле).
  void clear() {
    _debounceTimer?.cancel();
    state = const SearchState();
  }

  /// Повторить последний поиск (кнопка retry в ErrorView).
  void retry() {
    final trimmed = state.query.trim();
    if (trimmed.isEmpty) return;
    _runSearch(trimmed);
  }

  Future<void> _runSearch(String query) async {
    state = state.copyWith(phase: SearchPhase.loading, clearError: true);
    try {
      final books = await _service.search(query);
      // Если за время запроса юзер успел снова поменять текст — игнорируем.
      // (notifier не autoDispose между перерисовками, но autoDispose
      //  на уровне провайдера убирает state при уходе с экрана.)
      if (!mounted) return;
      if (state.query.trim() != query) return;

      state = state.copyWith(phase: SearchPhase.success, books: books);
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(
        phase: SearchPhase.error,
        errorMessage: 'Не удалось выполнить поиск',
      );
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}
