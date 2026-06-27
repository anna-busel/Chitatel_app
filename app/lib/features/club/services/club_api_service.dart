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
  const ChatHistoryResult({
    required this.messages,
    required this.hasMore,
    this.pinnedMessage,
  });

  /// DESC по createdAt — новые сверху (как возвращает сервер).
  final List<ChatMessage> messages;
  final bool hasMore;

  /// Закреплённое сообщение клуба (populated). Приходит ТОЛЬКО на первой
  /// странице (before == null), чтобы баннер закрепа был виден сразу при
  /// входе в чат, даже если само сообщение далеко в истории и не попало в
  /// загруженное окно (как в Telegram). null — закрепа нет либо удалён/скрыт.
  final ChatMessage? pinnedMessage;
}

/// Результат загрузки контекста вокруг сообщения (переход к закрепу/reply).
///
/// messages — DESC (как и обычная история). targetId — id целевого
/// сообщения для подсветки. hasMoreBefore/hasMoreAfter — есть ли ещё
/// сообщения за окном (для догрузки скроллом вверх/вниз).
class ChatContextResult {
  const ChatContextResult({
    required this.messages,
    required this.targetId,
    required this.hasMoreBefore,
    required this.hasMoreAfter,
  });

  final List<ChatMessage> messages;
  final String targetId;
  final bool hasMoreBefore;
  final bool hasMoreAfter;
}

/// Пользователь которого можно упомянуть через @ (задача 4.9).
/// Сейчас это админы (Анна). id — userId для поля mentions[] при отправке.
class MentionableUser {
  const MentionableUser({
    required this.id,
    required this.name,
    this.avatarUrl,
    this.isAdmin = false,
  });

  final String id;
  final String name;
  final String? avatarUrl;
  final bool isAdmin;

  factory MentionableUser.fromJson(Map<String, dynamic> j) {
    return MentionableUser(
      id: (j['id'] ?? '').toString(),
      name: (j['name'] ?? '').toString(),
      avatarUrl: j['avatarUrl']?.toString(),
      isAdmin: j['isAdmin'] == true,
    );
  }
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

  /// Список кого можно упомянуть через @ (4.9). Сейчас = админы (Анна).
  /// Возвращает пустой список при любой ошибке (упоминания — не критичный
  /// функционал, чат должен работать и без них).
  Future<List<MentionableUser>> fetchMentionable(String clubMonthId) async {
    try {
      final response =
          await _api.dio.get(ApiEndpoints.clubMentionable(clubMonthId));
      final body = response.data as Map<String, dynamic>;
      final data = body['data'] as Map<String, dynamic>;
      final raw = data['mentionable'];
      if (raw is List) {
        return raw
            .whereType<Map<String, dynamic>>()
            .map(MentionableUser.fromJson)
            .toList(growable: false);
      }
      return const [];
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubApiService] fetchMentionable failed: $e');
      }
      return const [];
    }
  }

  /// История чата с пагинацией. `before` — для подгрузки старых при скролле вверх.
  /// limit ограничен 50 на бэке.
  ///
  /// На первой странице (before == null) ответ содержит также pinnedMessage —
  /// закреплённое сообщение клуба, чтобы баннер закрепа был виден сразу.
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

    // Закреплённое сообщение (только на первой странице).
    ChatMessage? pinned;
    final pinnedRaw = data['pinnedMessage'];
    if (pinnedRaw is Map<String, dynamic>) {
      pinned = ChatMessage.fromJson(pinnedRaw);
    }

    return ChatHistoryResult(
      messages: messages,
      hasMore: data['hasMore'] == true,
      pinnedMessage: pinned,
    );
  }

  /// Загрузить контекст вокруг сообщения (переход к закрепу/reply как в
  /// Telegram). Возвращает целевое + radius соседей до и после.
  ///
  /// Используется когда тап по баннеру закрепа или reply-превью ведёт к
  /// сообщению которого нет в текущем загруженном окне — клиент перестраивает
  /// ленту вокруг цели и подсвечивает её.
  ///
  /// Бросает DioException NOT_FOUND если сообщение скрыто/не в этом клубе.
  Future<ChatContextResult> fetchChatContext({
    required String clubMonthId,
    required String messageId,
    int radius = 15,
  }) async {
    final response = await _api.dio.get(
      ApiEndpoints.clubChatContext(clubMonthId, messageId),
      queryParameters: {'radius': radius},
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

    return ChatContextResult(
      messages: messages,
      targetId: (data['targetId'] ?? '').toString(),
      hasMoreBefore: data['hasMoreBefore'] == true,
      hasMoreAfter: data['hasMoreAfter'] == true,
    );
  }

  /// Отправить текстовое сообщение. mentions — userId упомянутых через @
  /// (бэк отфильтрует, оставит только админов).
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
  /// [mentions] — userId упомянутых через @ в подписи (бэк отфильтрует).
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
    List<String> mentions = const [],
  }) async {
    final fileName = filePath.split('/').last;
    final formData = FormData.fromMap({
      'image': await MultipartFile.fromFile(filePath, filename: fileName),
      if (caption.isNotEmpty) 'text': caption,
      if (replyToId != null) 'replyToId': replyToId,
      // FormData не сериализует List напрямую как нужно бэку — шлём
      // повторяющимся ключом mentions (express qs соберёт в массив).
      if (mentions.isNotEmpty) 'mentions': mentions,
    });

    final response = await _api.dio.post(
      ApiEndpoints.clubChatImage(clubMonthId),
      data: formData,
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
  }

  /// Отправить голосовое сообщение (4.12, multipart/form-data).
  ///
  /// [filePath] — путь к .m4a файлу записи (из пакета record).
  /// [durationSec] — длительность записи в секундах (1..180).
  /// [waveform] — 40 чисел 0..100 (амплитуды для отрисовки), шлём JSON-строкой.
  /// [replyToId] — опциональный reply.
  ///
  /// ТОЛЬКО Анна-admin (бэк вернёт VOICE_ADMIN_ONLY для остальных). Сервер
  /// создаёт ChatMessage type=voice + эмитит chat:new_message по WS.
  ///
  /// Бросает DioException: VOICE_ADMIN_ONLY (не админ), VALIDATION (формат/
  /// длительность/waveform), FORBIDDEN (архив/бан).
  Future<ChatMessage> sendVoiceMessage({
    required String clubMonthId,
    required String filePath,
    required int durationSec,
    required List<int> waveform,
    String? replyToId,
  }) async {
    final fileName = filePath.split('/').last;
    final formData = FormData.fromMap({
      'voice': await MultipartFile.fromFile(filePath, filename: fileName),
      'durationSec': durationSec.toString(),
      // waveform — JSON-строка массива, бэк делает JSON.parse.
      'waveform': '[${waveform.join(',')}]',
      if (replyToId != null) 'replyToId': replyToId,
    });

    final response = await _api.dio.post(
      ApiEndpoints.clubChatVoice(clubMonthId),
      data: formData,
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
  }

  /// Поставить/снять реакцию на сообщение (toggle).
  ///
  /// [emoji] — один из 6 разрешённых (❤️👍🔥👏🥲🙏). Бэк валидирует.
  /// Логика toggle на сервере: один юзер = одна реакция (как в Telegram).
  ///
  /// Сервер эмитит chat:reaction_updated по WS — UI обновится через
  /// socket-стрим (ChatReactionUpdatedEvent). Метод возвращает обновлённый
  /// массив реакций (на случай если нужно применить сразу, не дожидаясь WS).
  Future<List<MessageReaction>> toggleReaction({
    required String messageId,
    required String emoji,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.clubChatReaction(messageId),
      data: {'emoji': emoji},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final raw = data['reactions'];
    if (raw is List) {
      return raw
          .whereType<Map<String, dynamic>>()
          .map(MessageReaction.fromJson)
          .toList(growable: false);
    }
    return const [];
  }

  /// Редактировать своё сообщение (4.8).
  ///
  /// [text] — новый текст (для text) или подпись (для image).
  /// Окно 15 мин, только автор, не voice — валидируется на бэке.
  /// Сервер эмитит chat:message_edited по WS.
  ///
  /// Бросает DioException: FORBIDDEN (не автор / voice),
  /// EDIT_WINDOW_EXPIRED (прошло 15 мин), NOT_FOUND.
  Future<ChatMessage> editMessage({
    required String messageId,
    required String text,
  }) async {
    final response = await _api.dio.patch(
      ApiEndpoints.clubChatMessage(messageId),
      data: {'text': text},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return ChatMessage.fromJson(data['message'] as Map<String, dynamic>);
  }

  /// Удалить своё сообщение (4.8, soft delete).
  ///
  /// Автор может удалить своё, админ — любое. Сервер эмитит
  /// chat:message_deleted по WS; bubble перерисуется как «удалено».
  Future<bool> deleteMessage(String messageId) async {
    final response = await _api.dio.delete(
      ApiEndpoints.clubChatMessage(messageId),
    );
    final body = response.data as Map<String, dynamic>;
    return body['success'] == true;
  }

  /// Закрепить / открепить сообщение (4.10). Только Анна-admin (бэк проверяет
  /// role). pinned=true закрепить, false открепить. Сервер эмитит
  /// chat:pin_changed по WS — баннер закрепа обновится у всех.
  ///
  /// Бросает DioException FORBIDDEN если не админ, NOT_FOUND если сообщения нет.
  Future<String?> pinMessage({
    required String clubMonthId,
    required String messageId,
    required bool pinned,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.clubChatPin(clubMonthId, messageId),
      data: {'pinned': pinned},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    final id = data['pinnedMessageId'];
    return (id is String && id.isNotEmpty) ? id : null;
  }

  /// Отметить сообщения прочитанными (4.11). Фоновая метрика для Анны —
  /// ошибки глушим (не критично для UX). Без WS.
  Future<void> markRead({
    required String clubMonthId,
    required List<String> messageIds,
  }) async {
    if (messageIds.isEmpty) return;
    try {
      await _api.dio.post(
        ApiEndpoints.clubChatRead(clubMonthId),
        data: {'messageIds': messageIds},
      );
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[ClubApiService] markRead failed (ignored): $e');
      }
    }
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
