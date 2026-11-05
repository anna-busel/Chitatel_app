import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/home_banners_service.dart';

/// Баннеры карусели на главной (UPDATES-PLAN T).
///
/// Никогда не падает: ошибка сети/сервера → пустой список, и главная
/// выглядит ровно как до баннеров (одна карточка «Клуб месяца»).
///
/// Обновляется вместе с главной (pull-to-refresh инвалидирует оба).
final homeBannersProvider = FutureProvider<List<HomeBanner>>((ref) async {
  try {
    return await ref.read(homeBannersServiceProvider).fetchBanners();
  } catch (_) {
    return const [];
  }
});
