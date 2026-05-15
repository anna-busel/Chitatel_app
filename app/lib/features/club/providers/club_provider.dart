import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/club_api_service.dart';

/// Провайдер текущего активного клуба месяца.
///
/// Загружает GET /api/club/current — возвращает CurrentClubResult
/// (клуб + access + book JSON). Используется всеми табами экрана клуба:
/// - About — рендерит book + parts schedule
/// - Chat — нужен club.id (для подключения к Socket-комнате и REST history)
/// - QA — нужен club.id (для загрузки вопросов)
///
/// AsyncValue.when обрабатывает loading/error/data в UI.
/// Для обновления — ref.invalidate(currentClubProvider).
final currentClubProvider = FutureProvider<CurrentClubResult>((ref) async {
  final api = ref.read(clubApiServiceProvider);
  return api.fetchCurrentClub();
});
