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
