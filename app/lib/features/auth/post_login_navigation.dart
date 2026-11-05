import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/router/routes.dart';
import '../../core/services/push_service.dart';
import 'providers/auth_provider.dart';

/// Куда вести после входа (UPDATES-PLAN Q1, 05.11.2026).
///
/// Почему: экран «Разрешить уведомления» (Routes.pushConsent) был только в
/// онбординге нового аккаунта. Кто ставит приложение заново или на новый
/// телефон и входит в старый аккаунт — вопроса не видел, приложение не
/// попадало в Настройки → Уведомления, пуши не всплывали (Гиорги, 03.11).
///
/// Теперь после входа в существующий аккаунт: если iOS ещё ни разу не
/// спрашивала (статус notDetermined) — один раз на устройство показываем тот
/// же экран. Apple это разрешает: объяснение, затем обычный системный запрос.
///
/// Онбординг нового аккаунта не меняется: пока персонализация не пройдена,
/// ведём в неё как раньше (там свой шаг с уведомлениями).
///
/// Только iOS: на Android (ветка android) свой однократный запрос после
/// входа в push_service.dart — второй не нужен.

/// Флаг SharedPreferences «экран уведомлений уже показывали на этом
/// устройстве». Не стирается при выходе из аккаунта — вопрос один на телефон.
const String pushConsentShownKey = 'push_consent_shown';

/// Отметить, что экран уведомлений показан (и из онбординга тоже).
Future<void> markPushConsentShown() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(pushConsentShownKey, true);
  } catch (_) {
    // Не удалось записать флаг — не повод ломать вход.
  }
}

/// Одно решение на один вход. Экран входа по почте лежит поверх общего
/// экрана входа, и оба слушают authProvider — без этого они могли бы решить
/// по-разному (первый поставил флаг, второй уже видит его и уводит мимо).
Future<bool>? _decision;

Future<bool> _shouldAsk(PushService push) {
  final existing = _decision;
  if (existing != null) return existing;
  final decision = _decide(push);
  _decision = decision;
  // Через несколько секунд забываем — следующий вход решает заново.
  unawaited(decision.whenComplete(() {
    Future<void>.delayed(const Duration(seconds: 5), () => _decision = null);
  }));
  return decision;
}

Future<bool> _decide(PushService push) async {
  if (defaultTargetPlatform != TargetPlatform.iOS) return false;
  try {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(pushConsentShownKey) ?? false) return false;
    // Новый аккаунт в онбординге — там свой экран уведомлений.
    if (prefs.getBool('onboarding_pending') ?? false) return false;
    final status = await push.getPermissionStatus();
    if (status != 'notDetermined') return false;
    await prefs.setBool(pushConsentShownKey, true);
    return true;
  } catch (_) {
    return false;
  }
}

/// Переход после успешного входа.
///
/// [next] — состояние authProvider (из ref.listen). [target] — куда вести
/// вошедшего, если онбординг пройден (главная или ?from=…).
Future<void> goAfterLogin(
  BuildContext context,
  WidgetRef ref,
  AuthState next, {
  String target = Routes.home,
}) async {
  final user = next.user;
  final completed = user != null && user['onboardingCompleted'] == true;
  if (!completed) {
    context.go(Routes.onboardingName);
    return;
  }
  final ask = await _shouldAsk(ref.read(pushServiceProvider));
  if (!context.mounted) return;
  if (ask) {
    context.go(Uri(
      path: Routes.pushConsent,
      queryParameters: {'next': target},
    ).toString());
  } else {
    context.go(target);
  }
}
