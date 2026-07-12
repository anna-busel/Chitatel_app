import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

/// HTTP вызовы к /api/auth/*
/// Источник: MASTER.md секция 7.4 (Auth endpoints)
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(ref.read(apiClientProvider));
});

class AuthService {
  AuthService(this._apiClient);
  final ApiClient _apiClient;

  /// POST /api/auth/register
  /// {email, password, name} → {accessToken, refreshToken, user}
  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String name,
  }) async {
    final response = await _apiClient.dio.post(
      ApiEndpoints.register,
      data: {'email': email, 'password': password, 'name': name},
    );
    return response.data['data'];
  }

  /// POST /api/auth/login
  /// {email, password} → {accessToken, refreshToken, user}
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final response = await _apiClient.dio.post(
      ApiEndpoints.login,
      data: {'email': email, 'password': password},
    );
    return response.data['data'];
  }

  /// POST /api/auth/google
  /// {idToken} → {accessToken, refreshToken, user, isNewUser}
  Future<Map<String, dynamic>> googleSignIn({
    required String idToken,
  }) async {
    final response = await _apiClient.dio.post(
      ApiEndpoints.google,
      data: {'idToken': idToken},
    );
    return response.data['data'];
  }

  /// POST /api/auth/apple
  /// {identityToken, authorizationCode?, fullName?} → {accessToken, refreshToken, user, isNewUser}
  ///
  /// Бэкенд (server/src/services/apple-auth.service.js) верифицирует
  /// identityToken через Apple JWKS, извлекает sub→appleUserId и email
  /// (email может отсутствовать — private relay). fullName передаём ТОЛЬКО
  /// при первой авторизации (Apple отдаёт имя один раз; в самом токене его нет).
  ///
  /// authorizationCode (Фаза 6, A2): одноразовый код, который сервер обменивает
  /// на refresh-токен Apple. Он нужен ровно для одного — отозвать доступ
  /// приложения при удалении аккаунта (этого требует Apple от приложений с
  /// Sign in with Apple). Без него удаление аккаунта пройдёт, но без revoke.
  Future<Map<String, dynamic>> appleSignIn({
    required String identityToken,
    String? authorizationCode,
    String? fullName,
  }) async {
    final response = await _apiClient.dio.post(
      ApiEndpoints.apple,
      data: {
        'identityToken': identityToken,
        if (authorizationCode != null && authorizationCode.isNotEmpty)
          'authorizationCode': authorizationCode,
        if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
      },
    );
    return response.data['data'];
  }

  /// POST /api/auth/forgot-password
  /// {email} → {message}
  Future<void> forgotPassword({required String email}) async {
    await _apiClient.dio.post(
      ApiEndpoints.forgotPassword,
      data: {'email': email},
    );
  }

  /// POST /api/auth/logout
  Future<void> logout({required String refreshToken}) async {
    await _apiClient.dio.post(
      ApiEndpoints.logout,
      data: {'refreshToken': refreshToken},
    );
  }
}
