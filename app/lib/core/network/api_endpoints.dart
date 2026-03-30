/// Все URL эндпоинтов API.
/// Источник: MASTER.md секция 7.4
///
/// Базовый URL меняется при деплое на VPS.
/// Для локальной разработки: http://localhost:3000/api
class ApiEndpoints {
  ApiEndpoints._();

  // Базовый URL — пока localhost, позже https://api.chitatel.app
  static const String baseUrl = 'http://localhost:3000/api';

  // — Auth —
  static const String register = '/auth/register';
  static const String login = '/auth/login';
  static const String google = '/auth/google';
  static const String apple = '/auth/apple';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';
  static const String forgotPassword = '/auth/forgot-password';
  static const String resetPassword = '/auth/reset-password';
  static const String deleteAccount = '/auth/account';

  // — Profile —
  static const String profile = '/profile';
  static const String profileAvatar = '/profile/avatar';
  static const String profilePassword = '/profile/password';
  static const String profilePushSettings = '/profile/push-settings';
  static const String profileAiConsent = '/profile/ai-consent';
  static const String profileSurvey = '/profile/survey';
  static const String profileReferral = '/profile/referral';

  // — Health —
  static const String health = '/health';
}
