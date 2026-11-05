import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

// Баннеры на главной (UPDATES-PLAN T, 05.11.2026).
//
// GET /api/home/banners?platform=ios|android. Сервер сам отбирает
// активные по датам и платформе (на Android по умолчанию баннеров нет)
// и сортирует. Действие по тапу — только внутри приложения.

/// Что делать по тапу на баннер.
enum HomeBannerActionKind { none, book, books }

class HomeBannerAction {
  const HomeBannerAction({
    required this.kind,
    this.bookId,
    this.listTitle = '',
    this.books = const [],
  });

  final HomeBannerActionKind kind;

  /// Для [HomeBannerActionKind.book].
  final String? bookId;

  /// Для [HomeBannerActionKind.books] — заголовок экрана-подборки.
  final String listTitle;

  /// Для [HomeBannerActionKind.books] — разборы подборки (кратко, как в
  /// каталоге).
  final List<BookModel> books;

  static const none = HomeBannerAction(kind: HomeBannerActionKind.none);

  factory HomeBannerAction.fromJson(Map<String, dynamic>? json) {
    if (json == null) return none;
    switch (json['kind']) {
      case 'book':
        final id = json['bookId']?.toString() ?? '';
        if (id.isEmpty) return none;
        return HomeBannerAction(kind: HomeBannerActionKind.book, bookId: id);
      case 'books':
        final raw = json['books'];
        final books = raw is List
            ? raw
                .whereType<Map<String, dynamic>>()
                .map(BookModel.fromJson)
                .toList(growable: false)
            : const <BookModel>[];
        if (books.isEmpty) return none;
        return HomeBannerAction(
          kind: HomeBannerActionKind.books,
          listTitle: json['listTitle'] as String? ?? '',
          books: books,
        );
      default:
        return none;
    }
  }
}

class HomeBanner {
  const HomeBanner({
    required this.id,
    required this.imageUrl,
    required this.action,
  });

  final String id;
  final String imageUrl;
  final HomeBannerAction action;

  factory HomeBanner.fromJson(Map<String, dynamic> json) {
    return HomeBanner(
      id: (json['id'] ?? '').toString(),
      imageUrl: json['imageUrl'] as String? ?? '',
      action: HomeBannerAction.fromJson(
        json['action'] is Map<String, dynamic>
            ? json['action'] as Map<String, dynamic>
            : null,
      ),
    );
  }
}

final homeBannersServiceProvider = Provider<HomeBannersService>((ref) {
  return HomeBannersService(ref.read(apiClientProvider));
});

class HomeBannersService {
  HomeBannersService(this._api);
  final ApiClient _api;

  /// Платформа для сервера: на Android свои баннеры (по умолчанию — никаких).
  static String get platform =>
      defaultTargetPlatform == TargetPlatform.android ? 'android' : 'ios';

  Future<List<HomeBanner>> fetchBanners() async {
    final response = await _api.dio.get(
      ApiEndpoints.homeBanners,
      queryParameters: {'platform': platform},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>? ?? const {};
    final raw = data['items'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(HomeBanner.fromJson)
        .where((b) => b.imageUrl.isNotEmpty)
        .toList(growable: false);
  }
}
