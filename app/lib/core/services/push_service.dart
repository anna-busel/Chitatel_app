import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../router/app_router.dart';
import '../router/routes.dart';
import '../../features/auth/providers/auth_provider.dart';
import 'firebase_android_options.dart';

/// Push (задача 6.1; Android — C3–C5 ANDROID-PLAN, 16.10.2026).
///
/// iOS — APNs без Firebase: нативный токен приходит из AppDelegate.swift
/// через MethodChannel 'chitatel/push'. Поведение iOS не менялось.
///
/// Android — FCM через firebase_messaging (Kotlin-сторона не нужна): токен,
/// разрешение (Android 13+) и тапы берутся из плагина, Firebase запускается
/// опциями из firebase_android_options.dart. Пока опции не заполнены, пуши
/// на Android тихо выключены.
///
/// Общее: токен регистрируется на бэкенде с платформой, тап ведёт на экран.
/// Настройки типов уважаются на сервере.
final pushServiceProvider = Provider<PushService>((ref) => PushService(ref));

bool get _isAndroid => defaultTargetPlatform == TargetPlatform.android;

class PushService {
  PushService(this._ref) {
    _channel.setMethodCallHandler(_onNativeCall);
  }

  final Ref _ref;
  static const MethodChannel _channel = MethodChannel('chitatel/push');

  // POST /api/notifications/register. Путь держим локально, чтобы не трогать
  // общий api_endpoints.dart (baseUrl уже содержит /api).
  static const String _registerPath = '/notifications/register';

  // ── Android: FCM ──

  bool _fcmReady = false;

  /// Однократный запуск Firebase и подписок FCM. false — Android-пуши
  /// недоступны (опции не заполнены / Firebase не поднялся); вызывающий
  /// тогда ведёт себя как без пушей.
  Future<bool> _ensureFcm() async {
    if (_fcmReady) return true;
    if (!_isAndroid || !kFirebaseAndroidConfigured) return false;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: firebaseAndroidOptions);
      }
      final messaging = FirebaseMessaging.instance;
      // Токен FCM может смениться (переустановка, очистка данных) —
      // сразу сообщаем серверу.
      messaging.onTokenRefresh.listen(_registerToken);
      // Тап по уведомлению, когда приложение было в фоне.
      FirebaseMessaging.onMessageOpenedApp
          .listen((message) => _handleTap(message.data));
      // Тап, которым приложение запустили из закрытого состояния. Роутер
      // ещё не смонтирован (main до runApp) — переходим после первого кадра.
      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        final data = initial.data;
        WidgetsBinding.instance.addPostFrameCallback((_) => _handleTap(data));
      }
      _fcmReady = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  bool _isGranted(AuthorizationStatus status) =>
      status == AuthorizationStatus.authorized ||
      status == AuthorizationStatus.provisional;

  /// Android: разрешение (системный диалог на Android 13+, на старых
  /// разрешено сразу) + регистрация токена FCM на бэкенде.
  Future<bool> _requestAndroid() async {
    if (!await _ensureFcm()) return false;
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      final granted = _isGranted(settings.authorizationStatus);
      if (granted) {
        final token = await messaging.getToken();
        if (token != null && token.isNotEmpty) await _registerToken(token);
      }
      return granted;
    } catch (_) {
      return false;
    }
  }

  /// Запрашивает разрешение и регистрирует устройство в APNs (экран 4.8).
  /// Возвращает true, если пользователь разрешил. Токен придёт асинхронно
  /// через onToken и будет отправлен на бэкенд.
  /// Android: то же через FCM, токен регистрируется сразу.
  Future<bool> requestPermissionAndRegister() async {
    if (_isAndroid) return _requestAndroid();
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
    if (_isAndroid) {
      // Android не различает «не спрашивали» и «запретили» до первого
      // запроса, поэтому всё, что не «разрешено», отдаём как notDetermined:
      // экран настроек покажет кнопку запроса, а если запрет окончательный —
      // после запроса подскажет путь в системные настройки.
      if (!await _ensureFcm()) return 'unknown';
      try {
        final settings =
            await FirebaseMessaging.instance.getNotificationSettings();
        return _isGranted(settings.authorizationStatus)
            ? 'authorized'
            : 'notDetermined';
      } catch (_) {
        return 'unknown';
      }
    }
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
    if (_isAndroid) {
      // Firebase поднимаем и гостю: нужен приём тапа по уведомлению.
      if (!await _ensureFcm()) return;
      if (_ref.read(authProvider).status != AuthStatus.authenticated) return;
      try {
        final messaging = FirebaseMessaging.instance;
        final settings = await messaging.getNotificationSettings();
        // Без разрешения токен не регистрируем — его попросят на экране 4.8
        // или в настройках уведомлений.
        if (!_isGranted(settings.authorizationStatus)) return;
        final token = await messaging.getToken();
        if (token != null && token.isNotEmpty) await _registerToken(token);
      } catch (_) {
        // Не критично — повторим при следующем запуске.
      }
      return;
    }
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
        data: {'pushToken': token, 'platform': _isAndroid ? 'android' : 'ios'},
      );
    } catch (_) {
      // Не критично — повторим при следующем входе/запуске.
    }
  }

  void _handleTap(Map<String, dynamic> data) {
    final router = _ref.read(routerProvider);
    // Открываем целевой экран поверх главной: сначала go(home) — чтобы в стеке
    // была база с таб-баром, затем push(target) — чтобы работал «Назад»
    // (иначе экран открывается одиночной страницей без выхода, Guideline 4.0).
    void openOverHome(String target) {
      router.go(Routes.home);
      router.push(target);
    }

    switch (data['type']) {
      case 'ai_ready':
        openOverHome(Routes.diary);
      case 'weekly_report':
        openOverHome(Routes.weeklyReport);
      case 'monthly_report':
        openOverHome(Routes.monthlyReport);
      case 'news':
        openOverHome(Routes.notifications);
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
