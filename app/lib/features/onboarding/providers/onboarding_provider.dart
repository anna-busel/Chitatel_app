import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../profile/services/profile_service.dart';

/// Ключ resume-guard'а онбординга (задача 6.3).
///
/// Ставится в `true` при входе, если сервер вернул onboardingCompleted != true
/// (см. auth_provider._saveAuthData), и снимается, как только опрос отправлен
/// (сервер тогда сам ставит onboardingCompleted = true) либо онбординг дошёл до
/// конца (push-экран). Пока флаг true — редирект роутера держит пользователя
/// внутри цепочки персонализации, чтобы её нельзя было «проскочить» рестартом.
const String onboardingPendingKey = 'onboarding_pending';

final onboardingControllerProvider = Provider<OnboardingController>((ref) {
  return OnboardingController(ref.read(profileServiceProvider));
});

/// Тонкий контроллер шагов онбординга: имя, ответы опроса, страна/город/
/// рассылка. Все вызовы бросают исключение наверх — экран показывает ошибку и
/// не уводит дальше, если сохранить не удалось.
class OnboardingController {
  OnboardingController(this._service);

  final ProfileService _service;

  /// Экран «Имя» — сохраняем настоящее имя (заменяет заглушку «Пользователь»,
  /// из-за которой ИИ-анализ не обращался лично).
  Future<void> saveName(String name) async {
    await _service.updateProfile(name: name);
  }

  /// Экран опроса — отправляем ответы. Сервер помечает onboardingCompleted,
  /// поэтому снимаем resume-guard.
  Future<void> submitSurvey(Map<String, dynamic> answers) async {
    await _service.submitSurvey(answers);
    await clearPending();
  }

  /// Экран «Страна/город/рассылка» (необязательный).
  Future<void> saveExtra({
    String? country,
    String? city,
    String? marketingEmail,
    bool? marketingConsent,
  }) async {
    await _service.updateProfile(
      country: country,
      city: city,
      marketingEmail: marketingEmail,
      marketingConsent: marketingConsent,
    );
  }

  /// Снять resume-guard (опрос отправлен / онбординг завершён).
  static Future<void> clearPending() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(onboardingPendingKey, false);
  }
}
