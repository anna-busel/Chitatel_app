/// Вопрос к Анне в клубе. Соответствует server/src/models/QAQuestion.js.
///
/// Жизненный цикл:
/// 1. Участница задаёт вопрос — answerText/answeredAt пустые
/// 2. Анна в админке отвечает (POST /api/admin/qa/:id/answer)
/// 3. Push участнице (Фаза 6.1)
///
/// Анна отвечает по пятницам (см. AI-CONTEXT v5).
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

  /// Отвечен ли вопрос.
  bool get isAnswered => answerText != null && answerText!.isNotEmpty;

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

    return QAQuestion(
      id: (json['_id'] ?? '').toString(),
      clubMonthId: (json['clubMonthId'] ?? '').toString(),
      questionText: (json['questionText'] ?? '').toString(),
      askedBy: user,
      createdAt: _parseDate(json['createdAt']) ?? DateTime.now(),
      answerText: json['answerText']?.toString(),
      answeredAt: _parseDate(json['answeredAt']),
      answeredBy: answeredBy,
    );
  }
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
