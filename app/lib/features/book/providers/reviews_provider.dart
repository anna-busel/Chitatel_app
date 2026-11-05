import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/reviews_service.dart';

/// Состояние отзывов одного разбора (UPDATES-PLAN C3, 05.11.2026).
///
/// Один нотифаер на разбор — его читают и секция на экране книги
/// (3 последних), и экран «Все отзывы» (подгрузка страниц). Пока открыт экран
/// книги, секция держит провайдер живым, поэтому «Все отзывы» продолжают
/// список, а не грузят его заново.
class ReviewsState {
  const ReviewsState({
    this.items = const [],
    this.myReview,
    this.rating = 0,
    this.reviewCount = 0,
    this.total = 0,
    this.page = 0,
    this.hasMore = false,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
  });

  /// Видимые отзывы, новые сверху (свой тоже здесь, если не скрыт).
  final List<Review> items;
  final Review? myReview;
  final double rating;
  final int reviewCount;
  final int total;

  /// Последняя загруженная страница (0 — ещё ничего).
  final int page;
  final bool hasMore;
  final bool isLoading;
  final bool isLoadingMore;
  final Object? error;

  bool get isLoaded => page > 0;

  ReviewsState copyWith({
    List<Review>? items,
    Review? myReview,
    bool clearMyReview = false,
    double? rating,
    int? reviewCount,
    int? total,
    int? page,
    bool? hasMore,
    bool? isLoading,
    bool? isLoadingMore,
    Object? error,
    bool clearError = false,
  }) {
    return ReviewsState(
      items: items ?? this.items,
      myReview: clearMyReview ? null : (myReview ?? this.myReview),
      rating: rating ?? this.rating,
      reviewCount: reviewCount ?? this.reviewCount,
      total: total ?? this.total,
      page: page ?? this.page,
      hasMore: hasMore ?? this.hasMore,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// Отзывы разбора по bookId. autoDispose — ушли с экрана книги, кэш не
/// держим (и не переносим на другой аккаунт после выхода).
final reviewsProvider = StateNotifierProvider.autoDispose
    .family<ReviewsNotifier, ReviewsState, String>((ref, bookId) {
  return ReviewsNotifier(ref.read(reviewsServiceProvider), bookId);
});

class ReviewsNotifier extends StateNotifier<ReviewsState> {
  ReviewsNotifier(this._service, this.bookId)
      : super(const ReviewsState(isLoading: true)) {
    refresh();
  }

  final ReviewsService _service;
  final String bookId;

  /// Первая страница заново (после правки/удаления/скрытия — тоже).
  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final page = await _service.fetch(bookId, page: 1);
      if (!mounted) return;
      state = ReviewsState(
        items: page.items,
        myReview: page.myReview,
        rating: page.rating,
        reviewCount: page.reviewCount,
        total: page.total,
        page: 1,
        hasMore: page.hasMore,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, error: e);
    }
  }

  /// Следующая страница (экран «Все отзывы»).
  Future<void> loadMore() async {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final next = await _service.fetch(bookId, page: state.page + 1);
      if (!mounted) return;
      // Пока листали, сверху могли появиться новые отзывы и сдвинуть страницы —
      // не дублируем уже показанные.
      final seen = state.items.map((r) => r.id).toSet();
      state = state.copyWith(
        items: [
          ...state.items,
          ...next.items.where((r) => !seen.contains(r.id)),
        ],
        page: next.page,
        hasMore: next.hasMore,
        total: next.total,
        isLoadingMore: false,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoadingMore: false);
    }
  }

  /// Оставить/изменить свой отзыв. Ошибки (403 и т. п.) — наверх, шторка
  /// покажет текст. После успеха перечитываем первую страницу.
  Future<void> submit({required int rating, required String text}) async {
    final (_, summary) =
        await _service.submit(bookId, rating: rating, text: text);
    if (!mounted) return;
    state = state.copyWith(
      rating: summary.rating,
      reviewCount: summary.reviewCount,
    );
    await refresh();
  }

  /// Удалить свой отзыв.
  Future<void> deleteMine() async {
    final summary = await _service.deleteMine(bookId);
    if (!mounted) return;
    state = state.copyWith(
      items: state.items.where((r) => !r.isMine).toList(growable: false),
      clearMyReview: true,
      rating: summary.rating,
      reviewCount: summary.reviewCount,
    );
    await refresh();
  }

  /// Скрыть отзыв (Анна).
  Future<void> hide(String reviewId) async {
    await _service.hide(reviewId);
    if (!mounted) return;
    state = state.copyWith(
      items: state.items.where((r) => r.id != reviewId).toList(growable: false),
    );
    await refresh();
  }

  /// Убрать отзывы заблокированного автора сразу, не дожидаясь сервера.
  void removeAuthor(String userId) {
    state = state.copyWith(
      items: state.items
          .where((r) => r.author.id != userId)
          .toList(growable: false),
    );
  }
}
