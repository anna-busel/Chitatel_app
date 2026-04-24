import 'package:flutter/foundation.dart';

/// Модель книги (аудиоразбора) на клиенте.
/// Соответствует схеме server/src/models/Book.js (источник истины).
///
/// См. docs/AI-CONTEXT.md → РАСХОЖДЕНИЯ С MASTER.md.
@immutable
class BookModel {
  const BookModel({
    required this.id,
    required this.title,
    required this.author,
    this.description = '',
    this.coverImageUrl = '',
    this.coverGradientColors = const ['#1A0E08', '#3A2018'],
    this.coverLabel = '',
    this.bookSlug = '',
    this.durationTotal = 0,
    this.categories = const [],
    this.tags = const [],
    this.priceUsd,
    this.priceRub,
    this.priceByn,
    this.isFree = false,
    this.isPartOfClub = false,
    this.rating = 0,
    this.reviewCount = 0,
  });

  /// MongoDB ObjectId (строкой)
  final String id;
  final String title;
  final String author;
  final String description;

  /// Основной источник обложки. Возможные форматы:
  /// - `asset://book-covers/{slug}.png` — Flutter-ассет (по умолчанию)
  /// - `https://...` — сетевая обложка (появится когда будет VPS)
  /// - пустая строка → fallback на градиент + coverLabel
  final String coverImageUrl;

  /// Fallback-градиент: два hex-цвета. Также используется как фон в плеере.
  final List<String> coverGradientColors;

  /// Fallback-буквы (2 символа), если coverImageUrl пусто.
  final String coverLabel;

  /// Slug для URL и имени файла обложки (совпадает с именем PNG в assets).
  final String bookSlug;

  /// Общая длительность в секундах. 0 пока нет аудио.
  final int durationTotal;

  final List<String> categories;
  final List<String> tags;

  /// Цены. null → бесплатная книга или цена пока не назначена.
  final double? priceUsd;
  final double? priceRub;
  final double? priceByn;

  final bool isFree;
  final bool isPartOfClub;

  final double rating;
  final int reviewCount;

  /// Парсинг JSON-ответа бэкенда.
  /// Все поля optional — бэкенд может отдавать урезанный projection.
  factory BookModel.fromJson(Map<String, dynamic> json) {
    return BookModel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      title: json['title'] as String? ?? '',
      author: json['author'] as String? ?? '',
      description: json['description'] as String? ?? '',
      coverImageUrl: json['coverImageUrl'] as String? ?? '',
      coverGradientColors: _parseStringList(json['coverGradientColors']) ??
          const ['#1A0E08', '#3A2018'],
      coverLabel: json['coverLabel'] as String? ?? '',
      bookSlug: json['bookSlug'] as String? ?? '',
      durationTotal: (json['durationTotal'] as num?)?.toInt() ?? 0,
      categories: _parseStringList(json['categories']) ?? const [],
      tags: _parseStringList(json['tags']) ?? const [],
      priceUsd: (json['priceUsd'] as num?)?.toDouble(),
      priceRub: (json['priceRub'] as num?)?.toDouble(),
      priceByn: (json['priceByn'] as num?)?.toDouble(),
      isFree: json['isFree'] as bool? ?? false,
      isPartOfClub: json['isPartOfClub'] as bool? ?? false,
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      reviewCount: (json['reviewCount'] as num?)?.toInt() ?? 0,
    );
  }

  static List<String>? _parseStringList(dynamic raw) {
    if (raw is List) {
      return raw.map((e) => e.toString()).toList(growable: false);
    }
    return null;
  }

  /// Цена для отображения в UI (USD с долларом).
  /// Когда подключим StoreKit — будем использовать локализованную цену оттуда.
  String? get displayPriceUsd =>
      priceUsd != null ? '\$${priceUsd!.toStringAsFixed(2)}' : null;
}
