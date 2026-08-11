import 'dart:io';
import 'package:dio/dio.dart';

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
