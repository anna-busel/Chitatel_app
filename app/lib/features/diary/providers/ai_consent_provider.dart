import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/diary_service.dart';

/// Состояние согласия на ИИ-анализ (экран 4.7, модалка 4.42, тумблер в профиле).
///
/// Источник истины — сервер (User.aiConsent). Но GET /api/profile появится
/// только в задаче 6.2, поэтому текущее значение кэшируем локально
/// (SharedPreferences) и обновляем при каждом PATCH /api/profile/ai-consent.
///
/// Значения:
///   null  — ещё не спрашивали / не знаем (первое сохранение цитаты покажет модалку 4.42)
///   false — юзер отказался
///   true  — согласие дано, цитаты уходят на разбор
final aiConsentProvider =
    StateNotifierProvider<AiConsentNotifier, bool?>((ref) {
  return AiConsentNotifier(ref.read(diaryServiceProvider))..load();
});

class AiConsentNotifier extends StateNotifier<bool?> {
  AiConsentNotifier(this._service) : super(null);

  final DiaryService _service;

  static const String _prefsKey = 'ai_consent';

  /// Прочитать сохранённое значение при старте.
  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    if (!prefs.containsKey(_prefsKey)) {
      state = null;
      return;
    }
    state = prefs.getBool(_prefsKey);
  }

  /// Включить/выключить ИИ-анализ. Сначала сервер, потом локальный кэш —
  /// если запрос упал, состояние не меняем (не врём юзеру).
  Future<void> setConsent(bool consent) async {
    await _service.setAiConsent(consent);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefsKey, consent);

    state = consent;
  }
}
