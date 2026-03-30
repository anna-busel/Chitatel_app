import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../../../core/storage/secure_storage.dart';
import '../services/auth_service.dart';

/// Состояния аутентификации.
enum AuthStatus { initial, loading, authenticated, guest, error }

/// Данные состояния auth.
class AuthState {
  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.errorMessage,
    this.isNewUser = false,
  });

  final AuthStatus status;
  final Map<String, dynamic>? user;
  final String? errorMessage;
  final bool isNewUser;

  AuthState copyWith({
    AuthStatus? status,
    Map<String, dynamic>? user,
    String? errorMessage,
    bool? isNewUser,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      errorMessage: errorMessage,
      isNewUser: isNewUser ?? this.isNewUser,
    );
  }
}

/// Auth provider — Riverpod StateNotifier.
/// Источник: MASTER.md секция 7.2.1
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.read(authServiceProvider),
    ref.read(secureStorageProvider),
  );
});

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._authService, this._storage) : super(const AuthState());

  final AuthService _authService;
  final SecureStorage _storage;

  /// Проверка сохранённых токенов при запуске
  Future<void> checkAuth() async {
    final hasTokens = await _storage.hasTokens();
    if (hasTokens) {
      state = state.copyWith(status: AuthStatus.authenticated);
    } else {
      state = state.copyWith(status: AuthStatus.guest);
    }
  }

  /// Email регистрация
  Future<void> register({
    required String email,
    required String password,
    required String name,
  }) async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final data = await _authService.register(
        email: email,
        password: password,
        name: name,
      );
      await _saveAuthData(data);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isNewUser: true,
      );
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _parseError(e),
      );
    }
  }

  /// Email вход
  Future<void> login({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final data = await _authService.login(
        email: email,
        password: password,
      );
      await _saveAuthData(data);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isNewUser: false,
      );
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _parseError(e),
      );
    }
  }

  /// Google Sign In
  Future<void> signInWithGoogle() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final googleSignIn = GoogleSignIn(
        clientId: '29430814146-6i4kal1nihgo8l4685i53009dg1tjm81.apps.googleusercontent.com',
      );
      final account = await googleSignIn.signIn();
      if (account == null) {
        state = state.copyWith(status: AuthStatus.guest);
        return;
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        state = state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Не удалось получить Google token',
        );
        return;
      }

      final data = await _authService.googleSignIn(idToken: idToken);
      await _saveAuthData(data);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isNewUser: data['isNewUser'] ?? false,
      );
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _parseError(e),
      );
    }
  }

  /// Войти как гость (кнопка «Пропустить»)
  void enterAsGuest() {
    state = state.copyWith(status: AuthStatus.guest);
  }

  /// Выход
  Future<void> logout() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken != null) {
        await _authService.logout(refreshToken: refreshToken);
      }
    } catch (_) {
      // Игнорируем ошибку — всё равно чистим локально
    }
    await _storage.clearAll();
    state = const AuthState(status: AuthStatus.guest);
  }

  /// Сохранить токены
  Future<void> _saveAuthData(Map<String, dynamic> data) async {
    await _storage.saveTokens(
      accessToken: data['accessToken'],
      refreshToken: data['refreshToken'],
    );
    if (data['user'] != null && data['user']['_id'] != null) {
      await _storage.saveUserId(data['user']['_id']);
    }
  }

  /// Парсинг ошибок из Dio
  String _parseError(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map && data['error'] is Map) {
        return data['error']['message'] ?? 'Ошибка сервера';
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return 'Сервер не отвечает. Попробуйте позже';
      }
      if (e.type == DioExceptionType.connectionError) {
        return 'Нет подключения к серверу';
      }
    }
    return 'Произошла ошибка';
  }
}

import 'package:dio/dio.dart';
