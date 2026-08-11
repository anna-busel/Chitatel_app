import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../router/app_router.dart';
import '../router/routes.dart';
import '../../features/auth/providers/auth_provider.dart';

/// APNs push (задача 6.1). Только iOS, без Firebase.
///
/// Нативный токен приходит из AppDelegate.swift через MethodChannel
/// 'chitatel/push'. Здесь регистрируем токен на бэкенде и обрабатываем тап
/// по уведомлению (навигация). Настройки типов уважаются на сервере.
final pushServiceProvider = Provider<PushService>((ref) => PushService(ref));

class PushService {
  PushService(this._ref) {
    _channel.setMethodCallHandler(_onNativeCall);
  }

  final Ref _ref;
  static const MethodChannel _channel = MethodChannel('chitatel/push');

  // POST /api/notifications/register. Путь держим локально, чтобы не трогать
  // общий api_endpoints.dart (baseUrl уже содержит /api).
  static const String _registerPath = '/notifications/register';

  /// Запрашивает разрешение и регистрирует устройство в APNs (экран 4.8).
  /// Возвращает true, если пользователь разрешил. Токен придёт асинхронно
  /// через onToken и будет отправлен на бэкенд.
  Future<bool> requestPermissionAndRegister() async {
    try {
      final granted =
          await _channel.invokeMethod<bool>('requestPermissionAndRegister');
      return granted ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// Текущий статус разрешения на уведомления (задача 6.1, умная кнопка):
  /// 'authorized' | 'provisional' | 'denied' | 'notDetermined' | 'unknown'.
  /// 'unknown' — канал недоступен / не iOS; экран настроек тогда показывает
  /// запрос как прежде (безопасный дефолт).
  Future<String> getPermissionStatus() async {
    try {
      final status =
          await _channel.invokeMethod<String>('getNotificationStatus');
      return status ?? 'unknown';
    } on PlatformException {
      return 'unknown';
    } on MissingPluginException {
      return 'unknown';
    }
  }

  /// Тихо переустанавливает токен на бэкенде (вызывается при старте, если юзер
  /// авторизован и разрешение уже выдано ранее).
  Future<void> refreshToken() async {
    if (_ref.read(authProvider).status != AuthStatus.authenticated) return;
    try {
      final token = await _channel.invokeMethod<String>('getToken');
      if (token != null && token.isNotEmpty) {
        await _registerToken(token);
      }
    } on PlatformException {
      // токен ещё не выдан — придёт через onToken после выдачи разрешения
    } on MissingPluginException {
      // не iOS / канал недоступен
    }
  }

  Future<void> _onNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onToken':
        final token = call.arguments as String?;
        if (token != null && token.isNotEmpty) {
          await _registerToken(token);
        }
      case 'onTap':
        final raw = call.arguments;
        final data = raw is Map
            ? raw.map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        _handleTap(data);
      case 'onTokenError':
        // Ошибку регистрации в APNs для MVP не логируем.
        break;
    }
  }

  Future<void> _registerToken(String token) async {
    // Регистрируем только под авторизованным юзером — эндпоинт требует токен.
    if (_ref.read(authProvider).status != AuthStatus.authenticated) return;
    try {
      final api = _ref.read(apiClientProvider);
      await api.dio.post(
        _registerPath,
        data: {'pushToken': token, 'platform': 'ios'},
      );
    } catch (_) {
      // Не критично — повторим при следующем входе/запуске.
    }
  }

  void _handleTap(Map<String, dynamic> data) {
    final router = _ref.read(routerProvider);
    switch (data['type']) {
      case 'ai_ready':
        router.go(Routes.diary);
      case 'weekly_report':
        router.go(Routes.weeklyReport);
      case 'monthly_report':
        router.go(Routes.monthlyReport);
      case 'news':
        router.go(Routes.notifications);
      // Задача 6.1: ответы/упоминания в чате и ответ Анны в Q&A ведут в клуб.
      case 'chat_reply':
      case 'mention':
      case 'qa_answer':
        router.go(Routes.club);
      default:
        router.go(Routes.home);
    }
  }
}
