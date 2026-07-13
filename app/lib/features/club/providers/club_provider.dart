import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/club_api_service.dart';

/// Провайдер списка клубов для переключателя (dropdown сверху экрана клуба).
///
/// Загружает GET /api/club/list — возвращает три категории
/// (archive / current / future) с полем relation в каждом ClubSummary.
///
/// Кешируется на время сессии — список меняется редко. Для принудительного
/// обновления — ref.invalidate.
final clubListProvider = FutureProvider<ClubListResult>((ref) async {
  final api = ref.read(clubApiServiceProvider);
  return api.fetchClubList();
});

/// Провайдер ID выбранного клуба в переключателе.
///
/// null означает «показывать текущий активный» (поведение по умолчанию).
/// Когда юзер выбирает другой клуб в dropdown'е — сюда кладётся его ID.
///
/// ⚠️ Сбрасывается при смене аккаунта (auth_provider._resetUserScopedState):
/// иначе новый вошедший попадал в клуб, выбранный предыдущим — видел чужой
/// архивный месяц, пустой чат и «нет вопросов» (баг 12.07.2026).
final selectedClubIdProvider = StateProvider<String?>((_) => null);

/// Провайдер контента выбранного клуба месяца.
///
/// Зависит от `selectedClubIdProvider`:
/// - null → GET /api/club/current (текущий активный)
/// - id → GET /api/club/:id (конкретный из переключателя)
final currentClubProvider = FutureProvider<CurrentClubResult>((ref) async {
  final selectedId = ref.watch(selectedClubIdProvider);
  final api = ref.read(clubApiServiceProvider);
  if (selectedId == null) {
    return api.fetchCurrentClub();
  }
  return api.fetchClubById(selectedId);
});

/// 🔴 Id сообщений, УДАЛЁННЫХ МНОЙ, пока идёт окно «Отменить» (4 секунды).
///
/// ЗАЧЕМ ВЫНЕСЕНО ИЗ ЭКРАНА ЧАТА (баг 13.07.2026):
/// Удаление оптимистичное: сообщение исчезает сразу, а реальный DELETE уходит
/// на сервер только через 4 секунды (всё это время висит SnackBar «Отменить»).
/// То есть на сервере сообщение ещё ЖИВОЕ.
///
/// Раньше список «удалённых мной» жил внутри State чата. Если в эти 4 секунды
/// уйти на другую страницу и вернуться, ChatTab пересоздавался, список умирал,
/// а история перезапрашивалась — сервер честно отдавал ещё не удалённое
/// сообщение, и удалённое фото «воскресало» в ленте (в БД оно потом удалялось,
/// но в ленте висело до следующего перезахода).
///
/// Теперь список живёт в провайдере — он переживает пересоздание экрана, и
/// фильтр `_visible` отсекает такие сообщения из ЛЮБОГО источника (история,
/// контекст, WebSocket), даже после возврата на страницу.
///
/// Очищается: при «Отменить» (id убирается), при ошибке удаления (откат) и при
/// смене аккаунта (auth_provider). Сам по себе не растёт — id немного и они
/// живут только до перезапуска приложения.
final locallyDeletedMessageIdsProvider =
    StateNotifierProvider<LocallyDeletedIdsNotifier, Set<String>>((ref) {
  return LocallyDeletedIdsNotifier();
});

class LocallyDeletedIdsNotifier extends StateNotifier<Set<String>> {
  LocallyDeletedIdsNotifier() : super(const <String>{});

  void add(String id) {
    state = {...state, id};
  }

  void remove(String id) {
    if (!state.contains(id)) return;
    final next = {...state}..remove(id);
    state = next;
  }

  bool contains(String id) => state.contains(id);
}
