/// Вопрос к Анне в клубе. Соответствует server/src/models/QAQuestion.js.
///
/// Жизненный цикл:
/// 1. Участница задаёт вопрос — answerText/answeredAt пустые
/// 2. Анна в админке отвечает (POST /api/admin/qa/:id/answer)
/// 3. Push участнице (Фаза 6.1)
///
/// Анна отвечает по пятницам (см. AI-CONTEXT v5).
///
/// Раздел «Вопросы» (UPDATES-PLAN D5/D7, 11.2026): у вопроса есть статус
/// (open → podcast / answered) и «Тоже интересно» (interestCount,
/// interestedByMe). Старый сервер этих полей не присылал — парсим безопасно.
class QAQuestion {
  const QAQuestion({
    required this.id,
    required this.clubMonthId,
    required this.questionText,
    required this.askedBy,
    required this.createdAt,
    this.answerText,
    this.answeredAt,
    this.answeredBy,
    this.status = QAStatus.open,
    this.interestCount = 0,
    this.interestedByMe = false,
  });

  final String id;
  final String clubMonthId;

  /// Текст вопроса (max 500 символов на бэке).
  final String questionText;

  /// Кто задал вопрос.
  final QAUser askedBy;

  /// Когда задан.
  final DateTime createdAt;

  /// Ответ Анны (null если ещё не отвечен).
  final String? answerText;
  final DateTime? answeredAt;

  /// Кто ответил (обычно Анна-admin).
  final QAUser? answeredBy;

  /// Статус (D1). Старый сервер не присылал — выводим из answerText.
  final QAStatus status;

  /// Сколько участниц нажали «Тоже интересно» (D3).
  final int interestCount;

  /// Я сама нажала «Тоже интересно».
  final bool interestedByMe;

  /// Отвечен ли вопрос.
  bool get isAnswered => answerText != null && answerText!.isNotEmpty;

  QAQuestion copyWith({
    QAStatus? status,
    int? interestCount,
    bool? interestedByMe,
  }) {
    return QAQuestion(
      id: id,
      clubMonthId: clubMonthId,
      questionText: questionText,
      askedBy: askedBy,
      createdAt: createdAt,
      answerText: answerText,
      answeredAt: answeredAt,
      answeredBy: answeredBy,
      status: status ?? this.status,
      interestCount: interestCount ?? this.interestCount,
      interestedByMe: interestedByMe ?? this.interestedByMe,
    );
  }

  factory QAQuestion.fromJson(Map<String, dynamic> json) {
    // userId / answeredByUserId могут быть populated объектами или строками.
    final userRaw = json['userId'];
    final user = userRaw is Map<String, dynamic>
        ? QAUser.fromJson(userRaw)
        : QAUser.unknown((userRaw ?? '').toString());

    QAUser? answeredBy;
    final answeredRaw = json['answeredByUserId'];
    if (answeredRaw is Map<String, dynamic>) {
      answeredBy = QAUser.fromJson(answeredRaw);
    } else if (answeredRaw is String && answeredRaw.isNotEmpty) {
      answeredBy = QAUser.unknown(answeredRaw);
    }

    final answerText = json['answerText']?.toString();
    final hasAnswer = answerText != null && answerText.isNotEmpty;
    final status = switch (json['status']?.toString()) {
      'open' => QAStatus.open,
      'podcast' => QAStatus.podcast,
      'answered' => QAStatus.answered,
      _ => hasAnswer ? QAStatus.answered : QAStatus.open,
    };
    final countRaw = json['interestCount'];

    return QAQuestion(
      id: (json['_id'] ?? '').toString(),
      clubMonthId: (json['clubMonthId'] ?? '').toString(),
      questionText: (json['questionText'] ?? '').toString(),
      askedBy: user,
      createdAt: _parseDate(json['createdAt']) ?? DateTime.now(),
      answerText: answerText,
      answeredAt: _parseDate(json['answeredAt']),
      answeredBy: answeredBy,
      status: status,
      interestCount: countRaw is num ? countRaw.toInt() : 0,
      interestedByMe: json['interestedByMe'] == true,
    );
  }
}

/// Статус вопроса. Соответствует QAQuestion.status на сервере.
enum QAStatus {
  /// Ждёт — Анна ещё не разобрала.
  open,

  /// Анна взяла вопрос в подкаст/эфир.
  podcast,

  /// Анна ответила текстом.
  answered;

  /// Значение для запросов (`?status=` и `POST /status`).
  String get apiValue => name;
}

/// Минимальные данные о юзере в контексте Q&A (тот же формат что ChatAuthor,
/// но отдельная модель — чтобы не тянуть chat-зависимость в Q&A UI).
class QAUser {
  const QAUser({required this.id, required this.name, this.avatarUrl});

  final String id;
  final String name;
  final String? avatarUrl;

  factory QAUser.fromJson(Map<String, dynamic> json) {
    return QAUser(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      avatarUrl: json['avatarUrl']?.toString(),
    );
  }

  factory QAUser.unknown(String userId) => QAUser(id: userId, name: 'Участница');
}

DateTime? _parseDate(dynamic raw) {
  if (raw is String && raw.isNotEmpty) return DateTime.tryParse(raw);
  return null;
}
