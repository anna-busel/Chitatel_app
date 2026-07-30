import 'package:flutter/foundation.dart';
import 'book_model.dart';

/// Модель пакета разборов на клиенте.
/// Соответствует схеме server/src/models/Package.js (источник истины).
///
/// Пакет = набор разборов со скидкой (Non-Consumable Apple IAP).
/// `books` приходит populated с сервера (GET /api/packages и /:id).
@immutable
class PackageModel {
  const PackageModel({
    required this.id,
    required this.title,
    this.description = '',
    this.coverImageUrl = '',
    this.coverGradientColors = const ['#1A0E08', '#3A2018'],
    this.coverLabel = '',
    this.packageSlug = '',
    this.books = const [],
    this.priceUsd,
    this.priceByn,
    this.appleProductId,
    this.purchaseUrl = '',
  });

  /// MongoDB ObjectId (строкой).
  final String id;
  final String title;
  final String description;

  final String coverImageUrl;
  final List<String> coverGradientColors;
  final String coverLabel;

  /// Slug для ссылок и имени файла обложки.
  final String packageSlug;

  /// Разборы, входящие в пакет (populated сервером).
  final List<BookModel> books;

  /// Цены. null → цена пока не назначена.
  final double? priceUsd;
  final double? priceByn;

  /// Product ID для Apple IAP (например `package.paket_woman`).
  final String? appleProductId;

  /// Ссылка на покупку на внешнем сайте (фоллбек).
  final String purchaseUrl;

  /// Количество разборов в пакете.
  int get bookCount => books.length;

  /// Цена для отображения в UI (USD с долларом).
  String? get displayPriceUsd =>
      priceUsd != null ? '\$${priceUsd!.toStringAsFixed(2)}' : null;

  /// Парсинг JSON-ответа бэкенда. Все поля optional.
  factory PackageModel.fromJson(Map<String, dynamic> json) {
    return PackageModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      coverImageUrl: json['coverImageUrl'] as String? ?? '',
      coverGradientColors: _parseStringList(json['coverGradientColors']) ??
          const ['#1A0E08', '#3A2018'],
      coverLabel: json['coverLabel'] as String? ?? '',
      packageSlug: json['packageSlug'] as String? ?? '',
      books: _parseBooks(json['books']),
      priceUsd: (json['priceUsd'] as num?)?.toDouble(),
      priceByn: (json['priceByn'] as num?)?.toDouble(),
      appleProductId: json['appleProductId'] as String?,
      purchaseUrl: json['purchaseUrl'] as String? ?? '',
    );
  }

  static List<String>? _parseStringList(dynamic raw) {
    if (raw is List) {
      return raw.map((e) => e.toString()).toList(growable: false);
    }
    return null;
  }

  static List<BookModel> _parseBooks(dynamic raw) {
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .map(BookModel.fromJson)
          .toList(growable: false);
    }
    return const [];
  }
}
