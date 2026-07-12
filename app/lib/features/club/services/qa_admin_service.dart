import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../models/qa_question.dart';

/// Ответ Анны на вопрос Q&A прямо из приложения (Фаза 6).
///
/// ЗАЧЕМ: серверный эндпоинт (`POST /api/admin/qa/:id/answer`) существовал с
/// задачи 4.4, но UI для него не было НИГДЕ — ни в приложении, ни в вебе.
/// Участницам показывалось «Анна отвечает по пятницам», а ответить Анне было
/// физически негде (только curl). Теперь у неё есть кнопка «Ответить» в табе
/// Q&A (видна только с ролью admin) и раздел Q&A в веб-админке.
///
/// Отдельный сервис, а не метод в ClubApiService: это админское действие,
/// живёт под /api/admin и доступно ровно одному аккаунту.
final qaAdminServiceProvider = Provider<QaAdminService>((ref) {
  return QaAdminService(ref.read(apiClientProvider));
});

class QaAdminService {
  QaAdminService(this._api);
  final ApiClient _api;

  /// Ответить на вопрос. Возвращает обновлённый вопрос (с текстом ответа,
  /// датой и автором ответа) — карточка в ленте сразу перерисуется.
  ///
  /// Ошибки сервера: FORBIDDEN (не админ / на вопрос уже отвечено),
  /// NOT_FOUND (вопроса нет).
  Future<QAQuestion> answerQuestion({
    required String questionId,
    required String answerText,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.adminQaAnswer(questionId),
      data: {'answerText': answerText},
    );
    final body = response.data as Map<String, dynamic>;
    final data = body['data'] as Map<String, dynamic>;
    return QAQuestion.fromJson(data['question'] as Map<String, dynamic>);
  }
}
