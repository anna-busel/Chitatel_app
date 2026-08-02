import 'package:flutter/foundation.dart';

/// Часть аудиоразбора (глава).
/// Соответствует partSchema в server/src/models/Book.js.
@immutable
class BookPart {
  const BookPart({
    required this.number,
    required this.title,
    required this.duration,
    this.isPreviewAvailable = false,
  });

  /// Порядковый номер части (1, 2, 3...).
  final int number;
  final String title;

  /// Длительность в секундах.
  final int duration;

  /// true для 1-й части платных книг (5-минутное превью).
  final bool isPreviewAvailable;

  factory BookPart.fromJson(Map<String, dynamic> json) {
    return BookPart(
      number: (json['number'] as num?)?.toInt() ?? 0,
      title: json['title'] as String? ?? '',
      duration: (json['duration'] as num?)?.toInt() ?? 0,
      isPreviewAvailable: json['isPreviewAvailable'] as bool? ?? false,
    );
  }

  /// Длительность для UI — «45 мин» или «1 ч 12 мин».
  String get displayDuration => _formatDuration(duration);
}

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
    this.parts = const [],
    this.purchaseUrl = '',
    this.appleProductId,
    this.freeChapterIndex = 0,
    this.hasAccess = false,
    this.isOwned = false,
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

  /// Список частей разбора. Пустой если аудио ещё не загружено.
  final List<BookPart> parts;

  /// Ссылка на покупку на внешнем сайте Анны (anna-busel.com).
  /// Используется как фоллбек для юзеров где Apple IAP недоступен.
  /// См. AI-CONTEXT → «Кнопка Купить на сайте для юзеров России».
  final String purchaseUrl;

  /// Product ID для Apple IAP (например `book.anna_karenina`).
  final String? appleProductId;

  /// Индекс бесплатной части для превью платных (0-based).
  final int freeChapterIndex;

  /// ВЫЧИСЛЯЕМОЕ СЕРВЕРОМ поле (НЕ из схемы Book.js): есть ли у текущего
  /// юзера ПОЛНЫЙ доступ к книге: куплена отдельно ИЛИ бесплатная ИЛИ входит в
  /// купленный пакет ИЛИ открыта подпиской как книга клуба в календарном окне
  /// (месяц клуба + следующий месяц-архив; модель 08.07.2026) ИЛИ админ.
  ///
  /// Сервер кладёт его ТОЛЬКО в GET /api/books/:id (с optionalAuth);
  /// в списках каталога/поиска поля нет → здесь будет false по дефолту.
  /// Используется book_screen для выбора «Слушать» vs «Купить».
  final bool hasAccess;

  /// ВЫЧИСЛЯЕМОЕ СЕРВЕРОМ поле: разбор КУПЛЕН (по отдельности ИЛИ в составе
  /// купленного пакета). В отличие от hasAccess НЕ включает клуб-подписку —
  /// это именно «куплено». Сервер кладёт его в списки каталога/поиска
  /// (GET /books, /books/featured, /books/search с optionalAuth); используется
  /// карточкой каталога, чтобы показать «Куплено» вместо цены.
  final bool isOwned;

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
      parts: _parseParts(json['parts']),
      purchaseUrl: json['purchaseUrl'] as String? ?? '',
      appleProductId: json['appleProductId'] as String?,
      freeChapterIndex: (json['freeChapterIndex'] as num?)?.toInt() ?? 0,
      hasAccess: json['hasAccess'] as bool? ?? false,
      isOwned: json['isOwned'] as bool? ?? false,
    );
  }

  static List<String>? _parseStringList(dynamic raw) {
    if (raw is List) {
      return raw.map((e) => e.toString()).toList(growable: false);
    }
    return null;
  }

  static List<BookPart> _parseParts(dynamic raw) {
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .map(BookPart.fromJson)
          .toList(growable: false);
    }
    return const [];
  }

  /// Цена для отображения в UI (USD с долларом).
  /// Когда подключим StoreKit — будем использовать локализованную цену оттуда.
  String? get displayPriceUsd =>
      priceUsd != null ? '\$${priceUsd!.toStringAsFixed(2)}' : null;

  /// Общая длительность для UI — «3 ч 45 мин» или «45 мин».
  /// Возвращает пустую строку если durationTotal == 0.
  String get displayDuration =>
      durationTotal == 0 ? '' : _formatDuration(durationTotal);
}

/// Форматирует длительность в секундах в строку для UI.
/// Примеры: 2700 → «45 мин», 4500 → «1 ч 15 мин», 3600 → «1 ч».
String _formatDuration(int seconds) {
  if (seconds <= 0) return '';
  final totalMinutes = seconds ~/ 60;
  final hours = totalMinutes ~/ 60;
  final minutes = totalMinutes % 60;
  if (hours == 0) return '$minutes мин';
  if (minutes == 0) return '$hours ч';
  return '$hours ч $minutes мин';
}
