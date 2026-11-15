import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/catalog/services/catalog_service.dart';
import '../constants/store_policy.dart';
import '../router/routes.dart';

/// Куда ведёт пуш/уведомление о покупке (UPDATES-PLAN K2, 15.11.2026).
///
/// data (плоские строки): { type: 'purchase', targetKind: 'book'|'club'|
/// 'season'|'paywall', targetId? }; для book targetId = bookSlug.
///
/// - book → экран книги. На iOS там кнопка покупки, на Android
///   (kPurchasesEnabled == false) экран сам показывает превью «Для участниц».
/// - club / season / paywall → iOS: пейвол клуба; Android: просто вкладка
///   клуба, без пейвола и цен (Google Payments).
class PurchaseTarget {
  const PurchaseTarget(this.location, {required this.isTab});

  final String location;

  /// true — корневая вкладка (открывать через go), false — экран поверх (push).
  final bool isTab;
}

/// Маршрут для данных пуша `purchase`. Не бросает: при любой ошибке —
/// запасной экран (каталог для book, клуб для остального).
Future<PurchaseTarget> resolvePurchaseTarget(
  Ref ref,
  Map<String, dynamic> data,
) {
  return _resolve(
    data,
    () => ref.read(catalogServiceProvider).fetchBooks(const CatalogQuery()),
  );
}

/// То же для виджетов (WidgetRef).
Future<PurchaseTarget> resolvePurchaseTargetFromWidget(
  WidgetRef ref,
  Map<String, dynamic> data,
) {
  return _resolve(
    data,
    () => ref.read(catalogServiceProvider).fetchBooks(const CatalogQuery()),
  );
}

Future<PurchaseTarget> _resolve(
  Map<String, dynamic> data,
  Future<CatalogResult> Function() fetchCatalog,
) async {
  final kind = data['targetKind']?.toString() ?? '';
  final targetId = data['targetId']?.toString().trim() ?? '';

  if (kind == 'book') {
    if (targetId.isEmpty) {
      return const PurchaseTarget(Routes.catalog, isTab: true);
    }
    // Если сервер когда-нибудь пришлёт сразу id книги (ObjectId) — открываем.
    if (_objectId.hasMatch(targetId)) {
      return PurchaseTarget(Routes.book(targetId), isTab: false);
    }
    // Экран книги открывается по id, а в пуше slug — ищем в каталоге.
    try {
      final result = await fetchCatalog();
      for (final b in result.books) {
        if (b.bookSlug == targetId && b.id.isNotEmpty) {
          return PurchaseTarget(Routes.book(b.id), isTab: false);
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[PurchaseTarget] catalog failed: $e');
    }
    // Не нашли (снят с публикации, нет сети) — каталог.
    return const PurchaseTarget(Routes.catalog, isTab: true);
  }

  // club / season / paywall и неизвестное значение.
  if (kPurchasesEnabled) {
    return const PurchaseTarget(Routes.paywall, isTab: false);
  }
  return const PurchaseTarget(Routes.club, isTab: true);
}

final RegExp _objectId = RegExp(r'^[0-9a-fA-F]{24}$');
