import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/profile_service.dart';

/// Профиль текущего пользователя (задача 6.2).
///
/// Держим отдельно от authProvider: тот отвечает за токены и вход, а здесь —
/// «живой» профиль (имя, аватар, подписка, согласие на ИИ, настройки push),
/// который меняется на подэкранах и должен сразу отражаться на главном экране
/// профиля.
///
/// Экраны, которые меняют профиль (редактирование, тумблер ИИ, настройки
/// уведомлений, аватар), вызывают методы нотифаера — он кладёт в состояние
/// уже обновлённый профиль из ответа сервера, без повторного запроса.
final profileProvider =
    StateNotifierProvider<ProfileNotifier, AsyncValue<UserProfile>>((ref) {
  return ProfileNotifier(ref.read(profileServiceProvider));
});

/// Текущий пользователь — админ (role == 'admin' в профиле). 1.0.2: карточки
/// каталога и пакетов показывают админу «Доступ админа» вместо «Куплено» —
/// сервер отдаёт админу hasAccess=true на всё, и «Куплено» на 50 разборах
/// пугало Анну (29.08.2026, «у Алёны всё куплено» — смотрела со своего
/// аккаунта). ⚠️ Смотреть только там, где доступ уже есть: у гостя профиль
/// не грузим (401 → лишний refresh/logout-цикл).
final isAdminProvider = Provider<bool>((ref) {
  return ref.watch(profileProvider).valueOrNull?.isAdmin ?? false;
});

class ProfileNotifier extends StateNotifier<AsyncValue<UserProfile>> {
  ProfileNotifier(this._service) : super(const AsyncValue.loading()) {
    load();
  }

  final ProfileService _service;

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final profile = await _service.fetchProfile();
      if (!mounted) return;
      state = AsyncValue.data(profile);
    } catch (e, st) {
      if (!mounted) return;
      state = AsyncValue.error(e, st);
    }
  }

  /// Имя / город (экран 4.46). Бросает исключение наверх — экран покажет ошибку.
  Future<void> updateProfile({String? name, String? city}) async {
    final updated = await _service.updateProfile(name: name, city: city);
    if (!mounted) return;
    state = AsyncValue.data(updated);
  }

  /// Фото профиля. Оно же появится в чате напротив сообщений участницы.
  Future<void> uploadAvatar(String filePath) async {
    final updated = await _service.uploadAvatar(filePath);
    if (!mounted) return;
    state = AsyncValue.data(updated);
  }

  /// Тумблер «ИИ-анализ» (4.27 / модалка 4.42).
  Future<void> setAiConsent(bool consent) async {
    final updated = await _service.setAiConsent(consent);
    if (!mounted) return;
    state = AsyncValue.data(updated);
  }

  /// Настройки уведомлений (4.31).
  Future<void> updatePushSettings(Map<String, bool> settings) async {
    final updated = await _service.updatePushSettings(settings);
    if (!mounted) return;
    state = AsyncValue.data(updated);
  }
}

/// Статистика прослушивания (экран 4.45). За всё время.
///
/// ⚠️ 24.07.2026 — autoDispose: провайдер сбрасывается, когда экран закрыт, и
/// перезапрашивает данные при КАЖДОМ открытии «Моего прогресса». Раньше он
/// кэшировался на весь запуск приложения — поэтому свежий прогресс после
/// прослушивания появлялся только после перезапуска приложения.
final progressStatsProvider =
    FutureProvider.autoDispose<ProgressStats>((ref) async {
  return ref.read(profileServiceProvider).fetchStats();
});

/// Список начатых/дослушанных разборов (экран 4.45) — для тапабельных
/// мини-карточек под статистикой.
///
/// ⚠️ 24.07.2026 — autoDispose по той же причине, что и статистика: свежие
/// данные при каждом раскрытии списка, без ожидания перезапуска приложения.
final progressListProvider =
    FutureProvider.autoDispose<List<ProgressItem>>((ref) async {
  return ref.read(profileServiceProvider).fetchProgressList();
});

/// История покупок (экран 4.44).
final purchaseHistoryProvider =
    FutureProvider<List<PurchaseItem>>((ref) async {
  return ref.read(profileServiceProvider).fetchPurchases();
});
