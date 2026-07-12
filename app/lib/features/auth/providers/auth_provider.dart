import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import '../../../core/storage/secure_storage.dart';
import '../../club/providers/club_provider.dart';
import '../../club/services/block_service.dart';
import '../../diary/providers/ai_consent_provider.dart';
import '../../diary/providers/diary_provider.dart';
import '../../home/providers/home_provider.dart';
import '../../profile/providers/profile_provider.dart';
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
    ref,
  );
});

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._authService, this._storage, this._ref)
      : super(const AuthState());

  final AuthService _authService;
  final SecureStorage _storage;
  final Ref _ref;

  /// 🔴 СБРОС ПОЛЬЗОВАТЕЛЬСКОГО СОСТОЯНИЯ ПРИ СМЕНЕ АККАУНТА
  /// (баг найден 12.07.2026 при первом тесте Фазы 6).
  ///
  /// СИМПТОМ 1: вышел из аккаунта Apple → вошёл под test-expired → в профиле
  /// висит ЧУЖОЙ аватар и имя. После перезапуска приложения — верные.
  /// СИМПТОМ 2 (нашли следом): в клубе открыт МЕСЯЦ, выбранный прежним юзером
  /// в переключателе — человек заходит в клуб, видит чужой архивный месяц,
  /// пустой чат и «нет вопросов», и решает, что клуб сломан.
  ///
  /// ПРИЧИНА: провайдеры ниже — обычные (не autoDispose). Создаются один раз,
  /// тянут данные при первом чтении и живут до перезапуска ПРОЦЕССА.
  /// `logout()` чистил только токены в secure storage — состояние Riverpod
  /// оставалось от прежнего юзера.
  ///
  /// ЭТО НЕ КОСМЕТИКА: так же «переживали» смену аккаунта цитаты дневника,
  /// блок-лист и данные о подписке. Показать чужие цитаты новому вошедшему —
  /// утечка личных данных между аккаунтами.
  ///
  /// ЛЕЧЕНИЕ: явный сброс при КАЖДОЙ смене личности — и при выходе, и при
  /// входе (вход без выхода возможен: истёк refresh → экран логина → вошли
  /// другим аккаунтом).
  ///
  /// ⚠️ ПРАВИЛО НА БУДУЩЕЕ: любой новый провайдер, который держит данные или
  /// ВЫБОР КОНКРЕТНОГО пользователя (профиль, дневник, прогресс, покупки, клуб,
  /// выбранный месяц клуба, блок-лист, push-настройки), ОБЯЗАН быть добавлен
  /// сюда. Иначе он переживёт смену аккаунта и покажет чужое.
  void _resetUserScopedState() {
    // Профиль и подэкраны (6.2)
    _ref.invalidate(profileProvider);
    _ref.invalidate(progressStatsProvider);
    _ref.invalidate(purchaseHistoryProvider);

    // Блок-лист (A1) — иначе новый юзер унаследует чужие блокировки
    _ref.invalidate(blockedIdsProvider);

    // Дневник (Фаза 5) — цитаты и отчёты строго личные
    _ref.invalidate(quotesProvider);
    _ref.invalidate(latestReportProvider);
    _ref.invalidate(aiConsentProvider);

    // Главная и клуб — зависят от подписки конкретного юзера.
    // selectedClubIdProvider — ВЫБРАННЫЙ В ПЕРЕКЛЮЧАТЕЛЕ МЕСЯЦ: без сброса
    // новый юзер попадает в клуб, который выбрал предыдущий (симптом 2 выше).
    _ref.invalidate(homeProvider);
    _ref.invalidate(selectedClubIdProvider);
    _ref.invalidate(currentClubProvider);
    _ref.invalidate(clubListProvider);
  }

  /// Локальные флаги, не привязанные к юзеру.
  ///
  /// `ai_consent` в SharedPreferences хранится БЕЗ привязки к пользователю
  /// (aiConsentProvider кэширует его там, т.к. писался до появления
  /// GET /api/profile). При смене аккаунта его надо стирать, иначе согласие
  /// на ИИ-анализ «перетечёт» с одного пользователя на другого — а это
  /// согласие на передачу личных цитат в OpenAI (Apple 5.1.2(i)).
  Future<void> _clearLocalUserFlags() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ai_consent');
  }

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

  /// Google Sign In.
  /// ⚠️ Кнопка Google на экране входа СКРЫТА (login_screen: _googleEnabled=false)
  /// до настройки GOOGLE_CLIENT_ID и URL scheme. Метод оставлен рабочим.
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

  /// Apple Sign In (MASTER 6.1 #1, 7.4).
  ///
  /// Получаем у Apple identityToken + authorizationCode + (при первой
  /// авторизации) имя, шлём на бэкенд POST /api/auth/apple, который
  /// верифицирует токен через Apple JWKS. Имя Apple отдаёт ТОЛЬКО один раз —
  /// собираем из givenName + familyName.
  ///
  /// authorizationCode (Фаза 6, A2): одноразовый код; сервер обменивает его на
  /// refresh-токен Apple и хранит, чтобы при удалении аккаунта отозвать доступ
  /// приложения (требование Apple к приложениям с Sign in with Apple).
  ///
  /// Требует capability «Sign in with Apple» в Xcode. Не работает в симуляторе.
  Future<void> signInWithApple() async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );

      final identityToken = credential.identityToken;
      if (identityToken == null) {
        state = state.copyWith(
          status: AuthStatus.error,
          errorMessage: 'Не удалось получить Apple token',
        );
        return;
      }

      // Имя приходит только при первой авторизации.
      final nameParts = [credential.givenName, credential.familyName]
          .where((p) => p != null && p.isNotEmpty)
          .cast<String>()
          .toList();
      final fullName = nameParts.isEmpty ? null : nameParts.join(' ');

      final data = await _authService.appleSignIn(
        identityToken: identityToken,
        authorizationCode: credential.authorizationCode,
        fullName: fullName,
      );
      await _saveAuthData(data);
      state = state.copyWith(
        status: AuthStatus.authenticated,
        user: data['user'],
        isNewUser: data['isNewUser'] ?? false,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      // Пользователь отменил вход — молча возвращаемся в гостевой режим.
      if (e.code == AuthorizationErrorCode.canceled) {
        state = state.copyWith(status: AuthStatus.guest);
        return;
      }
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: _parseError(e),
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

  /// Выход.
  ///
  /// Чистим ВСЁ: серверный refresh-токен, локальное хранилище, локальные флаги
  /// и кэш провайдеров — иначе следующий вошедший увидит данные предыдущего
  /// (см. _resetUserScopedState).
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
    await _clearLocalUserFlags();
    _resetUserScopedState();
    state = const AuthState(status: AuthStatus.guest);
  }

  /// Сохранить токены + флаг прохождения онбординга.
  ///
  /// ⚠️ Здесь же сбрасываем кэш провайдеров и локальные флаги: вход мог
  /// произойти БЕЗ выхода (истёк refresh → экран логина → вошли другим),
  /// и тогда данные прежнего юзера остались бы на экранах.
  Future<void> _saveAuthData(Map<String, dynamic> data) async {
    await _storage.saveTokens(
      accessToken: data['accessToken'],
      refreshToken: data['refreshToken'],
    );
    if (data['user'] != null && data['user']['_id'] != null) {
      await _storage.saveUserId(data['user']['_id']);
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_seen', true);
    await prefs.remove('ai_consent');

    _resetUserScopedState();
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
