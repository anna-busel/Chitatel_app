import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../models/chat_message.dart';
import '../models/club_access.dart';
import '../models/club_month.dart';
import '../models/club_summary.dart';
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

/// Результат запроса GET /api/club/list — три категории клубов для переключателя.
class ClubListResult {
  const ClubListResult({
    required this.archive,
    required this.current,
    required this.future,
  });

  /// Прошлые клубы (в окне archiveUntilDate либо все для подписчика).
  /// Сортировка DESC по startsAt (свежие архивы выше).
  final List<ClubSummary> archive;

  /// Текущий активный (0 или 1 элемент).
  final List<ClubSummary> current;

  /// Ближайшие будущие (только подписчики и админ; expired видит пустой массив).
  /// Сортировка ASC по startsAt (ближайший месяц выше).
  final List<ClubSummary> future;

  /// Все клубы единым плоским списком в порядке: current → future → archive.
  /// Удобно для построения dropdown'а сверху вниз.
  List<ClubSummary> get flat => [...current, ...future, ...archive];
}

/// Результат пагинированной загрузки чата.
class ChatHistoryResult {
  const ChatHistoryResult({required this.messages, required this.hasMore});

  /// DESC по createdAt — новые сверху (как возвращает сервер).
  final List<ChatMessage> messages;
  final bool hasMore;
}

/// Сервис для работы с REST API клуба.
class ClubApiService {
  ClubApiService(this._api);
  final ApiClient _api;

  /// Получить список клубов для переключателя.
  ///
  /// Возвращает три категории: archive / current / future. Каждый клуб
  /// содержит относительную метку (relation) для UI.
  ///
  /// Для expired-юзеров future будет пустым — этот случай UI обрабатывает.
  Future<ClubListResult> fetchClubList() async {
    final response = await _api.dio.get(ApiEndpoints.clubList);
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;

    List<ClubSummary> parse(dynamic raw) {
      if (raw is! List) return const [];
      return raw
          .whereType<Map<String, dynamic>>()
          .map(ClubSummary.fromJson)
          .toList(growable: false);
    }

    return ClubListResult(
      archive: parse(data['archive']),
      current: parse(data['current']),
      future: parse(data['future']),
    );
  }

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

  /// Отправить текстовое сообщение.
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

  /// Отправить картинку в чат (multipart/form-data).
  ///
  /// [filePath] — локальный путь к файлу (из image_picker).
  /// [caption] — опциональная подпись под картинкой.
  /// [replyToId] — опциональный reply.
  ///
  /// Сервер сам создаёт ChatMessage type=image + эмитит chat:new_message
  /// по WS — сообщение придёт в ленту через socket-стрим (как текст).
  ///
  /// Бросает DioException при сетевых ошибках / 4xx (обрабатывается в UI:
  /// VALIDATION — файл больше 8 МБ / неверный тип; FORBIDDEN — архив/бан).
  Future<ChatMessage> sendImageMessage({
    required String clubMonthId,
    required String filePath,
    String caption = '',
    String? replyToId,
  }) async {
    final fileName = filePath.split('/').last;
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(filePath, filename: fileName),
      if (caption.isNotEmpty) 'text': caption,
      if (replyToId != null) 'replyToId': replyToId,
    });

    final response = await _api.dio.post(
      ApiEndpoints.clubChatImage(clubMonthId),
      data: formData,
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
  }

  /// Жалоба на сообщение.
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

  /// Распарсить код ошибки из DioException.
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
