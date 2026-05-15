import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../models/chat_message.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
import '../models/qa_question.dart';

/// Провайдер сервиса клуба.
final clubApiServiceProvider = Provider<ClubApiService>((ref) {
  return ClubApiService(ref.read(apiClientProvider));
});

/// Пара (клуб + access + book-данные) — возвращается GET /api/club/current.
class CurrentClubResult {
  const CurrentClubResult({
    required this.club,
    required this.access,
    required this.bookJson,
  });

  final ClubMonth club;
  final ClubAccess access;

  /// Полный JSON книги. Парсится Book.fromJson на стороне `features/book/`,
  /// чтобы не дублировать модель.
  final Map<String, dynamic>? bookJson;
}

/// Результат пагинированной загрузки чата.
class ChatHistoryResult {
  const ChatHistoryResult({required this.messages, required this.hasMore});

  /// DESC по createdAt — новые сверху (как возвращает сервер).
  final List<ChatMessage> messages;
  final bool hasMore;
}

/// Сервис для работы с REST API клуба.
///
/// Эндпоинты:
/// - GET /api/club/current — текущий клуб
/// - GET /api/club/:id — конкретный клуб
/// - GET /api/club/:id/chat — история чата (limit, before)
/// - POST /api/club/:id/chat — отправить сообщение
/// - POST /api/club/chat/:msgId/report — жалоба
/// - GET /api/club/:id/qa — список вопросов
/// - POST /api/club/:id/qa — задать вопрос
class ClubApiService {
  ClubApiService(this._api);
  final ApiClient _api;

  /// Получить текущий активный клуб + книгу + access.
  Future<CurrentClubResult> fetchCurrentClub() async {
    final response = await _api.dio.get(ApiEndpoints.clubCurrent);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;

    return CurrentClubResult(
      club: ClubMonth.fromJson(data['club'] as Map<String, dynamic>),
      access: ClubAccess.fromJson(data['access'] as Map<String, dynamic>),
      bookJson: data['book'] as Map<String, dynamic>?,
    );
  }

  /// Получить клуб по ID. То же что current, но для архивных/будущих.
  Future<CurrentClubResult> fetchClubById(String clubMonthId) async {
    final response = await _api.dio.get(ApiEndpoints.clubById(clubMonthId));
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;

    return CurrentClubResult(
      club: ClubMonth.fromJson(data['club'] as Map<String, dynamic>),
      access: ClubAccess.fromJson(data['access'] as Map<String, dynamic>),
      bookJson: data['book'] as Map<String, dynamic>?,
    );
  }

  /// История чата с пагинацией. `before` — для подгрузки старых при скролле вверх.
  /// limit ограничен 50 на бэке.
  Future<ChatHistoryResult> fetchChatHistory({
    required String clubMonthId,
    int limit = 20,
    DateTime? before,
  }) async {
    final query = <String, dynamic>{'limit': limit};
    if (before != null) {
      query['before'] = before.toUtc().toIso8601String();
    }

    final response = await _api.dio.get(
      ApiEndpoints.clubChat(clubMonthId),
      queryParameters: query,
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;

    final messagesRaw = data['messages'];
    final messages = messagesRaw is List
        ? messagesRaw
            .whereType<Map<String, dynamic>>()
            .map(ChatMessage.fromJson)
            .toList(growable: false)
        : const <ChatMessage>[];

    return ChatHistoryResult(
      messages: messages,
      hasMore: data['hasMore'] == true,
    );
  }

  /// Отправить текстовое сообщение. Сервер дополнительно эмитит chat:new_message
  /// в комнату клуба через Socket.io — клиент его получит через WS-стрим.
  ///
  /// Возвращает сообщение с populated автором (если успешно).
  /// Бросает DioException при сетевых ошибках / 4xx.
  Future<ChatMessage> sendTextMessage({
    required String clubMonthId,
    required String text,
    String? replyToId,
    List<String> mentions = const [],
  }) async {
    final payload = <String, dynamic>{
      'type': 'text',
      'text': text,
      if (replyToId != null) 'replyToId': replyToId,
      if (mentions.isNotEmpty) 'mentions': mentions,
    };

    final response = await _api.dio.post(
      ApiEndpoints.clubChat(clubMonthId),
      data: payload,
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
  }

  /// Жалоба на сообщение (Apple Guideline 1.2).
  /// Reason — один из spam/inappropriate/offensive/copyright/other.
  ///
  /// Возвращает true при успехе. Если юзер уже жаловался — Dio бросит ошибку
  /// со status 409 (DUPLICATE_KEY) — обрабатывается в UI.
  Future<bool> reportMessage({
    required String messageId,
    required String reason,
    String comment = '',
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.clubChatReport(messageId),
      data: {'reason': reason, 'comment': comment},
    );
    final body = response.data as Map<String, dynamic>;
    return body['success'] == true;
  }

  /// Список вопросов клуба.
  Future<List<QAQuestion>> fetchQA(String clubMonthId) async {
    try {
      final response = await _api.dio.get(ApiEndpoints.clubQa(clubMonthId));
      final body = response.data as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>;

      final raw = data['questions'];
      if (raw is List) {
        return raw
            .whereType<Map<String, dynamic>>()
            .map(QAQuestion.fromJson)
            .toList(growable: false);
      }
      return const [];
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubApiService] fetchQA failed: $e');
      }
      rethrow;
    }
  }

  /// Задать вопрос Анне.
  ///
  /// Бэк проверяет дубликаты (нормализация текста) — при совпадении бросает
  /// 409 QA_DUPLICATE. UI ловит DioException и показывает соответствующее сообщение.
  Future<QAQuestion> askQuestion({
    required String clubMonthId,
    required String questionText,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.clubQa(clubMonthId),
      data: {'questionText': questionText},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return QAQuestion.fromJson(data['question'] as Map<String, dynamic>);
  }

  /// Распарсить код ошибки из DioException (для UI-обработки).
  /// Возвращает code из { success: false, error: { code, message } } если есть.
  static String? errorCodeFromException(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map<String, dynamic>) {
        final err = data['error'];
        if (err is Map<String, dynamic>) {
          return err['code']?.toString();
        }
      }
    }
    return null;
  }
}
