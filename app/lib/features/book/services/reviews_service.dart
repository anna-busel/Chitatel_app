import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

/// Отзывы о разборе (UPDATES-PLAN C3, 05.11.2026). API — AI-CONTEXT-7 §7.2.

/// Автор отзыва. name == null — аккаунт удалён.
class ReviewAuthor {
  const ReviewAuthor({required this.id, this.name, this.avatarUrl});

  final String id;
  final String? name;
  final String? avatarUrl;

  String get displayName =>
      (name == null || name!.trim().isEmpty) ? 'Участница' : name!;

  factory ReviewAuthor.fromJson(Map<String, dynamic> j) {
    final avatar = j['avatarUrl']?.toString();
    return ReviewAuthor(
      id: (j['id'] ?? '').toString(),
      name: j['name']?.toString(),
      avatarUrl: (avatar != null && avatar.isNotEmpty) ? avatar : null,
    );
  }
}

class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.text,
    required this.isMine,
    required this.author,
    this.createdAt,
    this.updatedAt,
    this.isHidden = false,
  });

  final String id;

  /// 1..5
  final int rating;
  final String text;
  final bool isMine;
  final ReviewAuthor author;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Только у myReview: отзыв скрыт модерацией (другие его не видят).
  final bool isHidden;

  factory Review.fromJson(Map<String, dynamic> j) {
    DateTime? parseDate(dynamic v) =>
        v is String && v.isNotEmpty ? DateTime.tryParse(v) : null;
    final rawAuthor = j['author'];
    return Review(
      id: (j['id'] ?? '').toString(),
      rating: ((j['rating'] as num?)?.toInt() ?? 0).clamp(0, 5).toInt(),
      text: (j['text'] ?? '').toString(),
      isMine: j['isMine'] == true,
      author: rawAuthor is Map<String, dynamic>
          ? ReviewAuthor.fromJson(rawAuthor)
          : const ReviewAuthor(id: ''),
      createdAt: parseDate(j['createdAt']),
      updatedAt: parseDate(j['updatedAt']),
      isHidden: j['isHidden'] == true,
    );
  }
}

/// Одна страница GET /api/books/:id/reviews.
class ReviewsPage {
  const ReviewsPage({
    required this.items,
    required this.total,
    required this.page,
    required this.hasMore,
    required this.rating,
    required this.reviewCount,
    this.myReview,
  });

  final List<Review> items;
  final int total;
  final int page;
  final bool hasMore;

  /// Средняя оценка по видимым отзывам (то же, что Book.rating).
  final double rating;
  final int reviewCount;
  final Review? myReview;

  factory ReviewsPage.fromJson(Map<String, dynamic> j) {
    final raw = j['items'];
    final mine = j['myReview'];
    return ReviewsPage(
      items: raw is List
          ? raw
              .whereType<Map<String, dynamic>>()
              .map(Review.fromJson)
              .toList(growable: false)
          : const [],
      total: (j['total'] as num?)?.toInt() ?? 0,
      page: (j['page'] as num?)?.toInt() ?? 1,
      hasMore: j['hasMore'] == true,
      rating: (j['rating'] as num?)?.toDouble() ?? 0,
      reviewCount: (j['reviewCount'] as num?)?.toInt() ?? 0,
      myReview: mine is Map<String, dynamic> ? Review.fromJson(mine) : null,
    );
  }
}

/// Итог изменения (свой отзыв, удаление, скрытие): новый рейтинг книги.
class ReviewSummary {
  const ReviewSummary({required this.rating, required this.reviewCount});
  final double rating;
  final int reviewCount;

  factory ReviewSummary.fromJson(Map<String, dynamic> j) => ReviewSummary(
        rating: (j['rating'] as num?)?.toDouble() ?? 0,
        reviewCount: (j['reviewCount'] as num?)?.toInt() ?? 0,
      );
}

final reviewsServiceProvider = Provider<ReviewsService>((ref) {
  return ReviewsService(ref.read(apiClientProvider));
});

class ReviewsService {
  ReviewsService(this._api);
  final ApiClient _api;

  static const int pageSize = 20;

  Map<String, dynamic> _data(dynamic body) {
    if (body is Map && body['data'] is Map<String, dynamic>) {
      return body['data'] as Map<String, dynamic>;
    }
    return const {};
  }

  /// Страница отзывов. Логин не обязателен; с логином сервер не отдаёт
  /// заблокированных мной авторов и добавляет myReview.
  Future<ReviewsPage> fetch(String bookId, {int page = 1}) async {
    final response = await _api.dio.get(
      ApiEndpoints.bookReviews(bookId),
      queryParameters: {'page': page, 'limit': pageSize},
    );
    return ReviewsPage.fromJson(_data(response.data));
  }

  /// Оставить или изменить свой отзыв (один на разбор).
  /// 403: PURCHASE_REQUIRED / FORBIDDEN / UGC_RULES_REQUIRED.
  Future<(Review?, ReviewSummary)> submit(
    String bookId, {
    required int rating,
    required String text,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.bookReviews(bookId),
      data: {'rating': rating, 'text': text},
    );
    final data = _data(response.data);
    final raw = data['review'];
    return (
      raw is Map<String, dynamic> ? Review.fromJson(raw) : null,
      ReviewSummary.fromJson(data),
    );
  }

  /// Удалить свой отзыв.
  Future<ReviewSummary> deleteMine(String bookId) async {
    final response = await _api.dio.delete(ApiEndpoints.bookMyReview(bookId));
    return ReviewSummary.fromJson(_data(response.data));
  }

  /// Скрыть отзыв (только Анна, роль admin).
  Future<void> hide(String reviewId) async {
    await _api.dio.post(ApiEndpoints.adminReviewHide(reviewId));
  }
}
