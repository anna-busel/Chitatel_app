import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_endpoints.dart';
import '../storage/secure_storage.dart';

/// Dio HTTP клиент с JWT interceptor.
/// Источник: MASTER.md секция 7.2.1
///
/// - Добавляет Authorization header автоматически
/// - На 401: пробует refresh → если fail → logout
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
  bool _isRefreshing = false;

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

  /// На 401 пробуем refresh token
  Future<void> _onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    if (err.response?.statusCode != 401 || _isRefreshing) {
      return handler.next(err);
    }

    _isRefreshing = true;
    try {
      final storage = _ref.read(secureStorageProvider);
      final refreshToken = await storage.getRefreshToken();

      if (refreshToken == null) {
        await _logout();
        return handler.next(err);
      }

      // Пробуем refresh
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

        // Повторяем оригинальный запрос с новым токеном
        final opts = err.requestOptions;
        opts.headers['Authorization'] = 'Bearer ${data['accessToken']}';
        final retryResponse = await _dio.fetch(opts);
        return handler.resolve(retryResponse);
      } else {
        await _logout();
        return handler.next(err);
      }
    } catch (_) {
      await _logout();
      return handler.next(err);
    } finally {
      _isRefreshing = false;
    }
  }

  Future<void> _logout() async {
    final storage = _ref.read(secureStorageProvider);
    await storage.clearAll();
  }
}
