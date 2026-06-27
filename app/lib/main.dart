import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'core/router/app_router.dart';
import 'features/auth/providers/auth_provider.dart';
import 'features/player/services/audio_service.dart';
import 'features/player/services/cover_cache.dart';
import 'features/player/services/player_api_service.dart';
import 'features/player/services/progress_service.dart';

void main() async {
  // AudioService.init требует WidgetsBinding и должен быть вызван до runApp.
  WidgetsFlutterBinding.ensureInitialized();

  // Создаём ProviderContainer заранее, чтобы получить доступ к зависимостям
  // (apiClient, secureStorage) для инициализации AudioHandler-а ДО runApp.
  // Тот же контейнер потом передаётся в UncontrolledProviderScope, чтобы
  // всё дерево виджетов использовало единое состояние Riverpod.
  final container = ProviderContainer();

  // Проверяем сохранённые токены при старте (checkAuth). БЕЗ этого вызова
  // authProvider навсегда остаётся в статусе initial при холодном старте —
  // и GuestGate (обёртка Клуба/Профиля) показывает вечную крутилку, т.к.
  // не понимает, авторизован юзер или гость. Это и был баг «белый экран
  // клуба после перезахода»: при свежем логине статус ставился вручную
  // (authenticated), а при перезаходе checkAuth никто не звал → initial →
  // вечная загрузка. checkAuth читает токены из хранилища (без сети, быстро),
  // выставляет authenticated/guest.
  await container.read(authProvider.notifier).checkAuth();

  // Инициализируем AudioHandler. Это singleton, доступный из любого места
  // через ChitatelAudioHandler.instance, и через audioHandlerProvider в Riverpod.
  await initChitatelAudio(
    apiService: container.read(playerApiServiceProvider),
    progressService: container.read(progressServiceProvider),
    coverCache: container.read(coverCacheProvider),
  );

  runApp(UncontrolledProviderScope(
    container: container,
    child: const ChitatelApp(),
  ));
}

class ChitatelApp extends ConsumerWidget {
  const ChitatelApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'ЧИТАТЕЛЬ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      routerConfig: router,
    );
  }
}
