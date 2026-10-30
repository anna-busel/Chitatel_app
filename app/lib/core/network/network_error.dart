import 'dart:io';
import 'package:dio/dio.dart';
import '../../features/club/services/club_api_service.dart';

/// true, если ошибка вызвана отсутствием/обрывом сети (а не серверным ответом
/// 4xx/5xx). Нужно, чтобы показать экран 4.38 «Нет подключения» вместо общей
/// ошибки и не разлогинивать пользователя при офлайне.
///
/// Apple штатно тестирует запуск и работу без сети (Guideline 2.1), поэтому
/// сетевые сбои трактуем отдельно от серверных ошибок.
bool isConnectionError(Object? error) {
  if (error is SocketException) return true;
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return true;
      default:
        return error.error is SocketException;
    }
  }
  return false;
}

/// Понятный пользователю текст ошибки запроса (UPDATES-PLAN B1).
///
/// Порядок: обрыв сети → известные коды сервера → 429 → [fallback].
/// Коды, которые значат что-то своё на конкретном экране (LINK_NOT_ALLOWED,
/// FORBIDDEN и т. п.), экран проверяет сам до вызова хелпера.
String userMessageFor(
  Object? error, {
  String fallback = 'Что-то пошло не так. Попробуйте ещё раз',
}) {
  if (error == null) return fallback;
  if (isConnectionError(error)) {
    return 'Нет соединения, проверьте интернет';
  }
  switch (ClubApiService.errorCodeFromException(error)) {
    case 'SUBSCRIPTION_REQUIRED':
      return 'Нет доступа к клубу';
    case 'CLUB_BLOCKED':
      return 'Вы не можете писать в этом клубе';
    case 'NOT_FOUND':
      return 'Сообщение не найдено';
  }
  if (error is DioException && error.response?.statusCode == 429) {
    return 'Слишком часто, попробуйте через минуту';
  }
  return fallback;
}
