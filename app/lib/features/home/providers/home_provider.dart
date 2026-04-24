import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/home_service.dart';

/// Асинхронный провайдер данных главной.
///
/// Использование в UI:
///   final home = ref.watch(homeProvider);
///   home.when(data: ..., loading: ..., error: ...);
///
/// Обновление (pull-to-refresh):
///   ref.invalidate(homeProvider);
final homeProvider = FutureProvider<HomeData>((ref) async {
  final service = ref.read(homeServiceProvider);
  return service.fetchHome();
});
