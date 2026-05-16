/// Тип сообщения в чате клуба.
/// Соответствует ChatMessage.type в server/src/models/ChatMessage.js.
enum ChatMessageType { text, image, voice, unknown }

/// Автор сообщения (минимальные поля для UI).
/// Сервер populate'ит User по userId — но возвращает только { _id, name, avatarUrl }.
class ChatAuthor {
  const ChatAuthor({required this.id, required this.name, this.avatarUrl});

  final String id;
  final String name;
  final String? avatarUrl;

  factory ChatAuthor.fromJson(Map<String, dynamic> json) {
    return ChatAuthor(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      avatarUrl: json['avatarUrl']?.toString(),
    );
  }

  /// Аноним если populate не сработал.
  factory ChatAuthor.unknown(String userId) => ChatAuthor(id: userId, name: 'Участница');
}

/// Реакция на сообщение (массив userId, поставивших эмодзи).
class MessageReaction {
  const MessageReaction({required this.emoji, required this.userIds});

  final String emoji;
  final List<String> userIds;

  int get count => userIds.length;

  factory MessageReaction.fromJson(Map<String, dynamic> json) {
    final raw = json['userIds'];
    final ids = raw is List
        ? raw.map((e) => e.toString()).toList(growable: false)
        : const <String>[];
    return MessageReaction(
      emoji: (json['emoji'] ?? '').toString(),
      userIds: ids,
    );
  }

  bool containsUser(String userId) => userIds.contains(userId);
}

/// Снапшот родительского сообщения для reply-превью.
///
/// Сервер populate'ит `replyToId` (см. REPLY_POPULATE в routes/club.js) и
/// присылает вложенный объект с автором. Это устраняет баг «ответы без
/// пользователя»: раньше клиент сам искал родителя среди загруженных
/// сообщений (первые 20) — если родитель вне окна, превью было без автора.
/// Теперь снапшот самодостаточен (как в Telegram).
class ReplySnapshot {
  const ReplySnapshot({
    required this.id,
    required this.authorName,
    required this.type,
    required this.text,
    required this.isDeleted,
  });

  final String id;
  final String authorName;
  final ChatMessageType type;
  final String text;
  final bool isDeleted;

  factory ReplySnapshot.fromJson(Map<String, dynamic> json) {
    final userRaw = json['userId'];
    final authorName = userRaw is Map<String, dynamic>
        ? (userRaw['name'] ?? 'Участница').toString()
        : 'Участница';

    final typeRaw = (json['type'] ?? 'text').toString();
    final type = switch (typeRaw) {
      'text' => ChatMessageType.text,
      'image' => ChatMessageType.image,
      'voice' => ChatMessageType.voice,
      _ => ChatMessageType.unknown,
    };

    return ReplySnapshot(
      id: (json['_id'] ?? '').toString(),
      authorName: authorName,
      type: type,
      text: (json['text'] ?? '').toString(),
      isDeleted: json['deletedAt'] != null,
    );
  }
}

/// Сообщение в чате клуба.
///
/// Расширенная схема v5 (см. AI-CONTEXT): поддерживает text/image/voice +
/// reply, reactions, mentions, edit, soft delete, read receipts, pin.
///
/// **Зачем все поля парсятся уже сейчас (4.5), хотя UI для image/voice/reactions
/// будет позже в 4.6/4.7/4.12:** бэкенд уже возвращает сообщения всех типов.
/// Если модель не сможет распарсить — клиент упадёт с unhandled type. Поэтому
/// модель — full-featured, а UI добавляет рендеры постепенно (defensive).
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.clubMonthId,
    required this.author,
    required this.type,
    required this.text,
    required this.createdAt,
    this.imageUrl,
    this.voiceUrl,
    this.voiceDurationSec,
    this.voiceWaveform = const [],
    this.replyToId,
    this.replySnapshot,
    this.reactions = const [],
    this.mentions = const [],
    this.editedAt,
    this.deletedAt,
    this.readBy = const [],
    this.isPinned = false,
    this.reportCount = 0,
  });

  /// MongoDB ObjectId.
  final String id;
  final String clubMonthId;

  /// Автор. ВНИМАНИЕ: если бэкенд не populate'ил userId (например, на ws-эмите),
  /// здесь будет ChatAuthor.unknown — UI должен это переживать.
  final ChatAuthor author;

  final ChatMessageType type;

  /// Текст: основной для type=text, caption для image/voice.
  final String text;

  /// Картинка (type=image). URL до сервера.
  final String? imageUrl;

  /// Голосовое (type=voice).
  final String? voiceUrl;
  final int? voiceDurationSec;

  /// 40 семплов 0-100 для отрисовки waveform на клиенте.
  final List<int> voiceWaveform;

  /// ID родительского сообщения если это reply.
  final String? replyToId;

  /// Снапшот родителя (автор + текст/тип) — приходит с сервера populated.
  /// Используется для reply-превью без поиска в загруженном списке.
  final ReplySnapshot? replySnapshot;

  /// Реакции, сгруппированные по эмодзи.
  final List<MessageReaction> reactions;

  /// ID юзеров, упомянутых через @имя.
  final List<String> mentions;

  /// Когда отредактировано. Если != null — показываем «изменено».
  final DateTime? editedAt;

  /// Soft delete. Если != null — рендерим «сообщение удалено».
  final DateTime? deletedAt;

  /// ID юзеров, прочитавших сообщение (видит только Анна, опционально).
  final List<String> readBy;

  /// Закреплено Анной. На клиенте — баннер сверху чата.
  final bool isPinned;

  /// Счётчик жалоб (для админки).
  final int reportCount;

  /// Время создания (сортировка чата).
  final DateTime createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    // userId может быть populated (объект) или просто строкой.
    final userRaw = json['userId'];
    final author = userRaw is Map<String, dynamic>
        ? ChatAuthor.fromJson(userRaw)
        : ChatAuthor.unknown((userRaw ?? '').toString());

    final typeRaw = (json['type'] ?? 'text').toString();
    final type = switch (typeRaw) {
      'text' => ChatMessageType.text,
      'image' => ChatMessageType.image,
      'voice' => ChatMessageType.voice,
      _ => ChatMessageType.unknown,
    };

    final reactionsRaw = json['reactions'];
    final reactions = reactionsRaw is List
        ? reactionsRaw
            .whereType<Map<String, dynamic>>()
            .map(MessageReaction.fromJson)
            .toList(growable: false)
        : const <MessageReaction>[];

    final mentionsRaw = json['mentions'];
    final mentions = mentionsRaw is List
        ? mentionsRaw.map((e) => e.toString()).toList(growable: false)
        : const <String>[];

    final waveformRaw = json['voiceWaveform'];
    final waveform = waveformRaw is List
        ? waveformRaw.map((e) => (e as num).toInt()).toList(growable: false)
        : const <int>[];

    final readByRaw = json['readBy'];
    final readBy = readByRaw is List
        ? readByRaw.map((e) => e.toString()).toList(growable: false)
        : const <String>[];

    // replyToId может прийти как:
    // - строка (id) — старый формат / ws-эмит без populate
    // - объект (populated reply-снапшот с автором) — новый формат (фикс бага)
    // - null
    final replyRaw = json['replyToId'];
    String? replyToId;
    ReplySnapshot? replySnapshot;
    if (replyRaw is Map<String, dynamic>) {
      replyToId = (replyRaw['_id'] ?? '').toString();
      replySnapshot = ReplySnapshot.fromJson(replyRaw);
    } else if (replyRaw != null) {
      replyToId = replyRaw.toString();
    }

    return ChatMessage(
      id: (json['_id'] ?? '').toString(),
      clubMonthId: (json['clubMonthId'] ?? '').toString(),
      author: author,
      type: type,
      text: (json['text'] ?? '').toString(),
      imageUrl: json['imageUrl']?.toString(),
      voiceUrl: json['voiceUrl']?.toString(),
      voiceDurationSec: (json['voiceDurationSec'] as num?)?.toInt(),
      voiceWaveform: waveform,
      replyToId: replyToId,
      replySnapshot: replySnapshot,
      reactions: reactions,
      mentions: mentions,
      editedAt: _parseDate(json['editedAt']),
      deletedAt: _parseDate(json['deletedAt']),
      readBy: readBy,
      isPinned: json['isPinned'] == true,
      reportCount: (json['reportCount'] as num?)?.toInt() ?? 0,
      createdAt: _parseDate(json['createdAt']) ?? DateTime.now(),
    );
  }

  /// Копия с заменой части полей. Нужен для обновления сообщения в списке
  /// без полной перезагрузки (например, при chat:reaction_updated по WS —
  /// меняем только reactions, остальное оставляем как есть).
  ChatMessage copyWith({
    List<MessageReaction>? reactions,
    String? text,
    DateTime? editedAt,
    DateTime? deletedAt,
    bool? isPinned,
  }) {
    return ChatMessage(
      id: id,
      clubMonthId: clubMonthId,
      author: author,
      type: type,
      text: text ?? this.text,
      createdAt: createdAt,
      imageUrl: imageUrl,
      voiceUrl: voiceUrl,
      voiceDurationSec: voiceDurationSec,
      voiceWaveform: voiceWaveform,
      replyToId: replyToId,
      replySnapshot: replySnapshot,
      reactions: reactions ?? this.reactions,
      mentions: mentions,
      editedAt: editedAt ?? this.editedAt,
      deletedAt: deletedAt ?? this.deletedAt,
      readBy: readBy,
      isPinned: isPinned ?? this.isPinned,
      reportCount: reportCount,
    );
  }

  bool get isDeleted => deletedAt != null;
  bool get isEdited => editedAt != null;
  bool get hasReply => replyToId != null && replyToId!.isNotEmpty;
  bool get hasReactions => reactions.isNotEmpty;

  /// Проверка автора: моё ли это сообщение.
  bool isMine(String? currentUserId) =>
      currentUserId != null && author.id == currentUserId;
}

DateTime? _parseDate(dynamic raw) {
  if (raw is String && raw.isNotEmpty) return DateTime.tryParse(raw);
  return null;
}
