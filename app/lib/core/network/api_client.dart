import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_endpoints.dart';
import '../storage/secure_storage.dart';

/// Dio HTTP клиент с JWT interceptor.
/// Источник: MASTER.md секция 7.2.1
///
/// - Добавляет Authorization header автоматически
/// - На 401: пробует refresh → если fail → logout
///
/// Гонка параллельных 401 (фикс): когда несколько запросов уходят
/// одновременно (например, экран клуба шлёт club/current + историю чата +
/// mentionable разом) и у всех истёк access-токен, они получают 401 почти
/// одновременно. РАНЬШЕ: первый запускал refresh, а остальные, видя флаг
/// _isRefreshing, проваливались через handler.next(err) или повисали —
/// отсюда «вечная загрузка» на экране клуба после перезахода (токен в
/// хранилище уже протух). ТЕПЕРЬ: один refresh на всех, остальные 401
/// ждут его в очереди и повторяются с новым токеном.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref);
});

class ApiClient {
  ApiClient(this._ref) {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiEndpoints.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {'Content-Type': 'application/json'},
      ),
    );

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: _onRequest,
        onError: _onError,
      ),
    );
  }

  final Ref _ref;
  late final Dio _dio;

  /// Идёт ли сейчас обновление токена (один на всё приложение).
  bool _isRefreshing = false;

  /// Future текущего refresh — параллельные 401 ждут его, чтобы не запускать
  /// несколько refresh сразу. Возвращает новый accessToken или null (если
  /// refresh не удался → logout).
  Future<String?>? _refreshFuture;

  Dio get dio => _dio;

  /// Добавляем Authorization header если есть токен
  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final storage = _ref.read(secureStorageProvider);
    final token = await storage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  /// На 401 пробуем refresh token. Один refresh на все параллельные 401:
  /// первый запускает обновление, остальные ждут тот же _refreshFuture.
  Future<void> _onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // Не 401 — пропускаем дальше как есть.
    if (err.response?.statusCode != 401) {
      return handler.next(err);
    }

    // Защита от бесконечной петли: если это уже повторный запрос после
    // refresh (помечен флагом) и снова 401 — refresh не помог, logout.
    if (err.requestOptions.extra['__retried__'] == true) {
      await _logout();
      return handler.next(err);
    }

    // Сам запрос refresh-токена вернул 401 — не пытаемся рефрешить рекурсивно.
    if (err.requestOptions.path == ApiEndpoints.refresh) {
      await _logout();
      return handler.next(err);
    }

    // Получаем новый токен: либо запускаем refresh (первый), либо ждём уже
    // идущий (параллельные 401).
    final newToken = await _ensureRefreshed();

    if (newToken == null) {
      // refresh не удался → logout уже выполнен внутри _ensureRefreshed.
      return handler.next(err);
    }

    // Повторяем оригинальный запрос с новым токеном.
    try {
      final opts = err.requestOptions;
      opts.headers['Authorization'] = 'Bearer $newToken';
      opts.extra['__retried__'] = true;
      final retryResponse = await _dio.fetch(opts);
      return handler.resolve(retryResponse);
    } catch (e) {
      // Повтор тоже упал — отдаём ошибку дальше (UI покажет ErrorView).
      if (e is DioException) {
        return handler.next(e);
      }
      return handler.next(err);
    }
  }

  /// Гарантирует один refresh на все параллельные 401. Возвращает новый
  /// accessToken, либо null если refresh не удался (тогда выполнен logout).
  Future<String?> _ensureRefreshed() {
    // Уже идёт refresh — ждём его результат.
    if (_isRefreshing && _refreshFuture != null) {
      return _refreshFuture!;
    }

    _isRefreshing = true;
    _refreshFuture = _doRefresh().whenComplete(() {
      _isRefreshing = false;
      _refreshFuture = null;
    });
    return _refreshFuture!;
  }

  /// Выполнить обновление токена. Возвращает новый accessToken или null.
  /// Использует отдельный Dio без interceptor'а (чтобы refresh-запрос не
  /// попал в этот же _onError при своём 401).
  Future<String?> _doRefresh() async {
    final storage = _ref.read(secureStorageProvider);
    final refreshToken = await storage.getRefreshToken();

    if (refreshToken == null) {
      await _logout();
      return null;
    }

    try {
      final response = await Dio(
        BaseOptions(baseUrl: ApiEndpoints.baseUrl),
      ).post(
        ApiEndpoints.refresh,
        data: {'refreshToken': refreshToken},
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        final data = response.data['data'];
        await storage.saveTokens(
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
        );
        return data['accessToken'] as String;
      }

      await _logout();
      return null;
    } catch (_) {
      await _logout();
      return null;
    }
  }

  Future<void> _logout() async {
    final storage = _ref.read(secureStorageProvider);
    await storage.clearAll();
  }
}
