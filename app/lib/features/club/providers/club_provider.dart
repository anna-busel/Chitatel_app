import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/club_api_service.dart';

/// Провайдер списка клубов для переключателя (dropdown сверху экрана клуба).
///
/// Загружает GET /api/club/list — возвращает три категории
/// (archive / current / future) с полем relation в каждом ClubSummary.
///
/// Кешируется на время сессии — список меняется редко (раз в месяц новый клуб
/// появляется в current). Для принудительного обновления — ref.invalidate.
final clubListProvider = FutureProvider<ClubListResult>((ref) async {
  final api = ref.read(clubApiServiceProvider);
  return api.fetchClubList();
});

/// Провайдер ID выбранного клуба в переключателе.
///
/// null означает «показывать текущий активный» (поведение по умолчанию —
/// при открытии экрана клуба грузится /current). Когда юзер выбирает другой
/// клуб в dropdown'е — сюда кладётся его ID, и `currentClubProvider`
/// перезагружается через /club/:id.
final selectedClubIdProvider = StateProvider<String?>((_) => null);

/// Провайдер контента выбранного клуба месяца.
///
/// Зависит от `selectedClubIdProvider`:
/// - null → GET /api/club/current (текущий активный)
/// - id → GET /api/club/:id (конкретный из переключателя)
///
/// Используется всеми табами экрана клуба:
/// - About — рендерит book + parts schedule
/// - Chat — нужен club.id (для подключения к Socket-комнате и REST history)
/// - QA — нужен club.id (для загрузки вопросов)
///
/// AsyncValue.when обрабатывает loading/error/data в UI.
final currentClubProvider = FutureProvider<CurrentClubResult>((ref) async {
  final selectedId = ref.watch(selectedClubIdProvider);
  final api = ref.read(clubApiServiceProvider);
  if (selectedId == null) {
    return api.fetchCurrentClub();
  }
  return api.fetchClubById(selectedId);
});
