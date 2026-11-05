import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_client.dart';
import '../../core/network/api_endpoints.dart';

/// Жалобы на пользовательский контент (UPDATES-PLAN A3, 05.11.2026).
///
/// Общий для всех новых типов контента: отзыв (C3), позже профиль, фото
/// полки, пост ленты. Сообщения чата по-прежнему жалуются через свой
/// эндпоинт (ClubApiService.reportMessage) — его не трогаем.
///
/// POST /api/reports { targetType, targetId, reason, comment? }
/// → { reported: true } или { reported: true, duplicate: true }.
final contentReportServiceProvider = Provider<ContentReportService>((ref) {
  return ContentReportService(ref.read(apiClientProvider));
});

class ContentReportService {
  ContentReportService(this._api);
  final ApiClient _api;

  /// Отправить жалобу. Возвращает true, если жалоба на этот объект от меня
  /// уже была (сервер ответил duplicate: true).
  /// reason: spam | inappropriate | offensive | copyright | other
  Future<bool> report({
    required String targetType,
    required String targetId,
    required String reason,
    String? comment,
  }) async {
    final response = await _api.dio.post(
      ApiEndpoints.contentReports,
      data: {
        'targetType': targetType,
        'targetId': targetId,
        'reason': reason,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      },
    );
    final body = response.data;
    final data = body is Map ? body['data'] : null;
    return data is Map && data['duplicate'] == true;
  }
}
