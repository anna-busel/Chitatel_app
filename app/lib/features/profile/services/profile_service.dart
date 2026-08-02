import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../shared/models/book_model.dart';

/// Профиль пользователя (экран 4.27 и подэкраны, задача 6.2).
class UserProfile {
  const UserProfile({
    required this.id,
    required this.name,
    this.email,
    this.avatarUrl,
    this.city,
    required this.authProvider,
    required this.subscriptionStatus,
    this.subscriptionPlan,
    this.subscriptionExpiresAt,
    required this.aiConsent,
    required this.pushSettings,
    required this.isAdmin,
  });

  final String id;
  final String name;
  final String? email;
  final String? avatarUrl;
  final String? city;

  /// apple | google | email — определяет, можно ли менять почту.
  final String authProvider;

  /// free | basic | premium | expired
  final String subscriptionStatus;

  /// monthly | season | ... (null у бесплатных)
  final String? subscriptionPlan;
  final DateTime? subscriptionExpiresAt;

  final bool aiConsent;
  final Map<String, bool> pushSettings;
  final bool isAdmin;

  /// Есть ли действующий доступ к клубу.
  bool get hasSubscription =>
      subscriptionStatus == 'basic' || subscriptionStatus == 'premium';

  factory UserProfile.fromJson(Map<String, dynamic> j) {
    final rawPush = j['pushSettings'];
    final push = <String, bool>{};
    if (rawPush is Map) {
      rawPush.forEach((key, value) {
        if (value is bool) push[key.toString()] = value;
      });
    }

    DateTime? parseDate(dynamic v) {
      if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
      return null;
    }

    return UserProfile(
      id: (j['_id'] ?? j['id'] ?? '').toString(),
      name: (j['name'] ?? 'Участница').toString(),
      email: j['email']?.toString(),
      avatarUrl: j['avatarUrl']?.toString(),
      city: j['city']?.toString(),
      authProvider: (j['authProvider'] ?? 'email').toString(),
      subscriptionStatus: (j['subscriptionStatus'] ?? 'free').toString(),
      subscriptionPlan: j['subscriptionPlan']?.toString(),
      subscriptionExpiresAt: parseDate(j['subscriptionExpiresAt']),
      aiConsent: j['aiConsent'] == true,
      pushSettings: push,
      isAdmin: (j['role'] ?? 'user').toString() == 'admin',
    );
  }
}

/// Статистика прослушивания (экран «Мой прогресс», 4.45).
/// За ВСЁ ВРЕМЯ — недельной разбивки в базе нет (решение 12.07.2026).
class ProgressStats {
  const ProgressStats({
    required this.totalMinutes,
    required this.booksStarted,
    required this.booksCompleted,
    required this.quotesCount,
    this.lastListenedAt,
  });

  final int totalMinutes;
  final int booksStarted;
  final int booksCompleted;
  final int quotesCount;
  final DateTime? lastListenedAt;

  factory ProgressStats.fromJson(Map<String, dynamic> j) {
    return ProgressStats(
      totalMinutes: (j['totalMinutes'] as num?)?.toInt() ?? 0,
      booksStarted: (j['booksStarted'] as num?)?.toInt() ?? 0,
      booksCompleted: (j['booksCompleted'] as num?)?.toInt() ?? 0,
      quotesCount: (j['quotesCount'] as num?)?.toInt() ?? 0,
      lastListenedAt: j['lastListenedAt'] is String
          ? DateTime.tryParse(j['lastListenedAt'] as String)
          : null,
    );
  }
}

/// Один начатый/дослушанный разбор — карточка в списке под статистикой на
/// экране «Мой прогресс» (4.45). Тап продолжает воспроизведение с сохранённой
/// части и секунды (как «Продолжить слушать» на главной).
class ProgressItem {
  const ProgressItem({
    required this.book,
    required this.currentPartNumber,
    required this.positionSeconds,
    required this.totalParts,
    required this.listenedParts,
    required this.isCompleted,
    this.lastListenedAt,
  });

  final BookModel book;
  final int currentPartNumber;
  final int positionSeconds;
  final int totalParts;
  final int listenedParts;
  final bool isCompleted;
  final DateTime? lastListenedAt;

  factory ProgressItem.fromJson(Map<String, dynamic> j) {
    return ProgressItem(
      book: BookModel.fromJson(j['book'] as Map<String, dynamic>),
      currentPartNumber: (j['currentPartNumber'] as num?)?.toInt() ?? 1,
      positionSeconds: (j['positionSeconds'] as num?)?.toInt() ?? 0,
      totalParts: (j['totalParts'] as num?)?.toInt() ?? 0,
      listenedParts: (j['listenedParts'] as num?)?.toInt() ?? 0,
      isCompleted: j['isCompleted'] == true,
      lastListenedAt: j['lastListenedAt'] is String
          ? DateTime.tryParse(j['lastListenedAt'] as String)
          : null,
    );
  }
}

/// Обложка для карточки покупки (реальный ассет/сеть, иначе градиент + label).
/// Соответствует объекту `cover` из GET /api/purchases/history.
class PurchaseCover {
  const PurchaseCover({
    this.coverImageUrl = '',
    this.coverGradientColors = const ['#1A0E08', '#3A2018'],
    this.coverLabel = '',
  });

  final String coverImageUrl;
  final List<String> coverGradientColors;
  final String coverLabel;

  factory PurchaseCover.fromJson(Map<String, dynamic> j) {
    final raw = j['coverGradientColors'];
    final gradient = raw is List
        ? raw.map((e) => e.toString()).toList(growable: false)
        : const ['#1A0E08', '#3A2018'];
    return PurchaseCover(
      coverImageUrl: (j['coverImageUrl'] ?? '').toString(),
      coverGradientColors:
          gradient.isNotEmpty ? gradient : const ['#1A0E08', '#3A2018'],
      coverLabel: (j['coverLabel'] ?? '').toString(),
    );
  }
}

/// Одна покупка (экран «Мои покупки», 4.44).
/// Цену не показываем: она живёт в App Store и зависит от страны.
class PurchaseItem {
  const PurchaseItem({
    required this.itemType,
    required this.appleProductId,
    required this.status,
    this.title,
    this.targetId,
    this.author,
    this.bookCount,
    this.cover,
    this.purchasedAt,
    this.expiresAt,
  });

  /// subscription | book | package | archive
  final String itemType;
  final String appleProductId;

  /// active | expired | refunded | cancelled
  final String status;

  /// Конкретное название разбора/пакета (сервер резолвит по slug). У подписок
  /// и архива null — клиент подписывает их сам по типу.
  final String? title;

  /// _id разбора/пакета для перехода на его экран. null у подписок/архива.
  final String? targetId;

  /// Автор разбора (только book). null у пакета/подписки/архива.
  final String? author;

  /// Число разборов в пакете (только package). null у прочих.
  final int? bookCount;

  /// Обложка: у book — обложка разбора, у package — собственная обложка пакета.
  /// null у подписки/архива (клиент рисует эмблему).
  final PurchaseCover? cover;

  final DateTime? purchasedAt;
  final DateTime? expiresAt;

  factory PurchaseItem.fromJson(Map<String, dynamic> j) {
    DateTime? parseDate(dynamic v) {
      if (v is String && v.isNotEmpty) return DateTime.tryParse(v);
      return null;
    }

    String? nonEmpty(dynamic v) {
      final s = v?.toString();
      return (s != null && s.isNotEmpty) ? s : null;
    }

    final rawCover = j['cover'];
    return PurchaseItem(
      itemType: (j['itemType'] ?? '').toString(),
      appleProductId: (j['appleProductId'] ?? '').toString(),
      status: (j['status'] ?? '').toString(),
      title: nonEmpty(j['title']),
      targetId: nonEmpty(j['targetId']),
      author: nonEmpty(j['author']),
      bookCount: (j['bookCount'] as num?)?.toInt(),
      cover: rawCover is Map<String, dynamic>
          ? PurchaseCover.fromJson(rawCover)
          : null,
      purchasedAt: parseDate(j['purchasedAt']),
      expiresAt: parseDate(j['expiresAt']),
    );
  }
}

final profileServiceProvider = Provider<ProfileService>((ref) {
  return ProfileService(ref.read(apiClientProvider));
});

/// HTTP-слой профильной зоны (задача 6.2).
class ProfileService {
  ProfileService(this._api);
  final ApiClient _api;

  UserProfile _userFrom(Response response) {
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return UserProfile.fromJson(data['user'] as Map<String, dynamic>);
  }

  /// Профиль текущего пользователя.
  Future<UserProfile> fetchProfile() async {
    final response = await _api.dio.get(ApiEndpoints.profile);
    return _userFrom(response);
  }

  /// Имя и город (экран 4.46). Почта не меняется.
  Future<UserProfile> updateProfile({String? name, String? city}) async {
    final response = await _api.dio.patch(
      ApiEndpoints.profile,
      data: {
        if (name != null) 'name': name,
        if (city != null) 'city': city,
      },
    );
    return _userFrom(response);
  }

  /// Загрузить фото профиля (multipart). Оно же появится в чате напротив
  /// сообщений участницы — сервер хранит ссылку в User.avatarUrl.
  Future<UserProfile> uploadAvatar(String filePath) async {
    final fileName = filePath.split('/').last;
    final formData = FormData.fromMap({
      'avatar': await MultipartFile.fromFile(filePath, filename: fileName),
    });

    final response = await _api.dio.post(
      ApiEndpoints.profileAvatar,
      data: formData,
    );
    return _userFrom(response);
  }

  /// Тумблер «ИИ-анализ» (4.27 / модалка 4.42).
  /// Пока consent=false — ни одна цитата не уходит в OpenAI.
  Future<UserProfile> setAiConsent(bool consent) async {
    final response = await _api.dio.patch(
      ApiEndpoints.profileAiConsent,
      data: {'consent': consent},
    );
    return _userFrom(response);
  }

  /// Настройки уведомлений (4.31).
  Future<UserProfile> updatePushSettings(Map<String, bool> settings) async {
    final response = await _api.dio.patch(
      ApiEndpoints.profilePushSettings,
      data: settings,
    );
    return _userFrom(response);
  }

  /// Ответы опроса (4.6, онбординг).
  Future<UserProfile> submitSurvey(Map<String, dynamic> answers) async {
    final response = await _api.dio.post(
      ApiEndpoints.profileSurvey,
      data: {'answers': answers},
    );
    return _userFrom(response);
  }

  /// Статистика прослушивания (4.45).
  Future<ProgressStats> fetchStats() async {
    final response = await _api.dio.get(ApiEndpoints.progressStats);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return ProgressStats.fromJson(data['stats'] as Map<String, dynamic>);
  }

  /// Список начатых/дослушанных разборов (4.45) — для мини-карточек под
  /// статистикой. Новые сверху (по времени последнего прослушивания).
  Future<List<ProgressItem>> fetchProgressList() async {
    final response = await _api.dio.get(ApiEndpoints.progressList);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final raw = data['items'];
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .map(ProgressItem.fromJson)
          .toList(growable: false);
    }
    return const [];
  }

  /// История покупок (4.44).
  Future<List<PurchaseItem>> fetchPurchases() async {
    final response = await _api.dio.get(ApiEndpoints.purchasesHistory);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final raw = data['purchases'];
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .map(PurchaseItem.fromJson)
          .toList(growable: false);
    }
    return const [];
  }

  /// Удаление аккаунта (4.34, Apple 5.1.1(v)).
  /// Требует подтверждения словом «УДАЛИТЬ» — защита от случайного нажатия.
  Future<void> deleteAccount() async {
    await _api.dio.delete(
      ApiEndpoints.deleteAccount,
      data: {'confirm': 'УДАЛИТЬ'},
    );
  }
}
