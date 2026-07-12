import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

/// Блокировка участников (Фаза 6, A1 — Apple Guideline 1.2).
///
/// Зачем отдельный сервис, а не метод в ClubApiService: блокировка живёт на
/// уровне ПОЛЬЗОВАТЕЛЯ (/api/users/...), а не клуба, и нужна не только чату,
/// но и профилю (экран «Заблокированные»).
///
/// Как работает блокировка:
/// - сервер не отдаёт сообщения заблокированных в истории чата и вырезает их
///   из превью ответов (club.js);
/// - клиент дополнительно прячет сообщения заблокированных, ПРИШЕДШИЕ ПО
///   WEBSOCKET (сокет вещает в комнату клуба всем — фильтровать на входе
///   проще и дешевле, чем персонализировать эмиты на сервере);
/// - разблокировать можно на экране «Заблокированные» в профиле.
///
/// Администратора (Анну) заблокировать нельзя — сервер вернёт ошибку.

/// Один заблокированный участник (для экрана списка).
class BlockedUser {
  const BlockedUser({
    required this.id,
    required this.name,
    this.avatarUrl,
  });

  final String id;
  final String name;
  final String? avatarUrl;

  factory BlockedUser.fromJson(Map<String, dynamic> j) {
    return BlockedUser(
      id: (j['id'] ?? '').toString(),
      name: (j['name'] ?? 'Участница').toString(),
      avatarUrl: j['avatarUrl']?.toString(),
    );
  }
}

final blockServiceProvider = Provider<BlockService>((ref) {
  return BlockService(ref.read(apiClientProvider));
});

class BlockService {
  BlockService(this._api);
  final ApiClient _api;

  /// Список заблокированных мной участников.
  Future<List<BlockedUser>> fetchBlocked() async {
    final response = await _api.dio.get(ApiEndpoints.usersBlocked);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final raw = data['blocked'];
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .map(BlockedUser.fromJson)
          .toList(growable: false);
    }
    return const [];
  }

  /// Заблокировать участника. Идемпотентно.
  Future<void> block(String userId) async {
    await _api.dio.post(ApiEndpoints.userBlock(userId));
  }

  /// Разблокировать участника. Идемпотентно.
  Future<void> unblock(String userId) async {
    await _api.dio.delete(ApiEndpoints.userBlock(userId));
  }

  /// Пожаловаться на участника целиком (не на одно сообщение).
  /// reason: spam | inappropriate | offensive | copyright | other
  Future<void> reportUser({
    required String userId,
    required String reason,
    String comment = '',
  }) async {
    await _api.dio.post(
      ApiEndpoints.userReport(userId),
      data: {'reason': reason, 'comment': comment},
    );
  }
}

/// Локальный блок-лист: множество userId заблокированных.
///
/// Чат читает его синхронно, чтобы отсекать входящие сообщения по WebSocket
/// и мгновенно (не дожидаясь перезагрузки истории) убирать из ленты того,
/// кого только что заблокировали.
final blockedIdsProvider =
    StateNotifierProvider<BlockedIdsNotifier, Set<String>>((ref) {
  return BlockedIdsNotifier(ref.read(blockServiceProvider));
});

class BlockedIdsNotifier extends StateNotifier<Set<String>> {
  BlockedIdsNotifier(this._service) : super(const <String>{}) {
    load();
  }

  final BlockService _service;

  /// Подтянуть список с сервера (при старте и при открытии экрана списка).
  /// Ошибку глушим: пустой блок-лист не ломает чат, сервер всё равно
  /// фильтрует историю сам.
  Future<void> load() async {
    try {
      final blocked = await _service.fetchBlocked();
      if (!mounted) return;
      state = blocked.map((u) => u.id).toSet();
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[BlockedIds] load failed (ignored): $e');
      }
    }
  }

  /// Заблокировать: сначала сервер, затем локальное состояние.
  /// Бросает исключение наверх — UI покажет ошибку (например, попытку
  /// заблокировать администратора).
  Future<void> block(String userId) async {
    await _service.block(userId);
    if (!mounted) return;
    state = {...state, userId};
  }

  /// Разблокировать.
  Future<void> unblock(String userId) async {
    await _service.unblock(userId);
    if (!mounted) return;
    final next = {...state}..remove(userId);
    state = next;
  }

  bool isBlocked(String userId) => state.contains(userId);
}
