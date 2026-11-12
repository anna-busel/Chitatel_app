import 'package:flutter/foundation.dart';
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

/// Акция-вкладка каталога (1.0.5, 12.11.2026): первый видимый баннер с
/// подборкой и отметкой «Показывать вкладкой в каталоге». null — вкладки нет.
///
/// Только iPhone: на Android покупок нет, акции туда не показываем (сервер
/// по умолчанию тоже не отдаёт туда баннеры).
final catalogPromoProvider = Provider<HomeBanner?>((ref) {
  if (defaultTargetPlatform != TargetPlatform.iOS) return null;
  final banners = ref.watch(homeBannersProvider).valueOrNull ?? const [];
  for (final b in banners) {
    if (b.showInCatalog && b.action.kind == HomeBannerActionKind.books) {
      return b;
    }
  }
  return null;
});

/// Плашка акции на обложках (1.0.5): разборы и пакеты из вкладки-акции
/// получают плашку с названием подборки. Пусто — плашек нет.
class PromoBadges {
  const PromoBadges({
    this.label = '',
    this.bookIds = const {},
    this.packageIds = const {},
  });

  final String label;
  final Set<String> bookIds;
  final Set<String> packageIds;

  static const empty = PromoBadges();
}

final promoBadgesProvider = Provider<PromoBadges>((ref) {
  final promo = ref.watch(catalogPromoProvider);
  if (promo == null) return PromoBadges.empty;
  final label = promo.action.listTitle.trim();
  if (label.isEmpty) return PromoBadges.empty;
  return PromoBadges(
    label: label.toUpperCase(),
    bookIds: promo.action.books.map((b) => b.id).toSet(),
    packageIds: promo.action.packageIds.toSet(),
  );
});
